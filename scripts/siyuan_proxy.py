#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
siyuan_proxy.py
---------------

A zero-dependency reverse HTTP proxy that exposes a local SiYuan kernel
(http://127.0.0.1:6806) on a public-facing address (default 0.0.0.0:26806),
so remote clients such as the `siyuan-sisyphus` CLI can reach SiYuan over
the network when port 6806 is blocked by a firewall.

Design goals (see plan: siyuan-http-proxy):
  * Pure standard library (Python 3.7+), no pip install.
  * Stream request and response bodies (multipart upload, binary download).
  * Forward status code, headers (incl. `Authorization: Token`) and body.
  * No authentication of its own — relies entirely on SiYuan's token.
  * Threaded so concurrent CLI calls don't block each other.
  * Graceful Ctrl+C / SIGTERM shutdown.

Usage:
    # Default: listen 0.0.0.0:26806 -> upstream 127.0.0.1:6806, only allow 21.139.136.164
    python3 siyuan_proxy.py

    # Allow multiple IPs
    python3 siyuan_proxy.py --allow-ip 21.6.68.39 --allow-ip 10.0.0.1

    # Open mode: allow all IPs (same as original behavior)
    python3 siyuan_proxy.py --allow-ip 0.0.0.0

    # Custom listen / upstream / timeout
    python3 siyuan_proxy.py --listen 0.0.0.0:36806 --upstream http://127.0.0.1:6806 --timeout 120
"""

from __future__ import annotations

import argparse
import http.client
import logging
import os
import signal
import socket
import socketserver
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional, Tuple
from urllib.parse import urlsplit

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Hop-by-hop headers per RFC 7230 §6.1 — must NOT be forwarded by a proxy.
HOP_BY_HOP_HEADERS = frozenset(
    h.lower()
    for h in (
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    )
)

# Chunk size for streaming copy (request body upload + response body download).
STREAM_CHUNK_SIZE = 64 * 1024

# Read limit when buffering a chunked request body before re-sending with
# Content-Length. SiYuan asset upload is the largest realistic payload; 256 MiB
# is a safe ceiling that protects the proxy from runaway uploads.
CHUNKED_BUFFER_LIMIT = 256 * 1024 * 1024

DEFAULT_LISTEN = "0.0.0.0:26806"
DEFAULT_UPSTREAM = "http://127.0.0.1:6806"
DEFAULT_TIMEOUT = 60.0
DEFAULT_ALLOW_IPS = ("21.91.123.76")

logger = logging.getLogger("siyuan_proxy")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_listen(value: str) -> Tuple[str, int]:
    """Parse "host:port" — IPv6 not supported (sufficient for our use case)."""
    if ":" not in value:
        raise argparse.ArgumentTypeError(
            f"--listen must be in 'host:port' form, got {value!r}"
        )
    host, _, port_str = value.rpartition(":")
    if not host:
        host = "0.0.0.0"
    try:
        port = int(port_str)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"--listen port must be an integer, got {port_str!r}"
        ) from exc
    if not (0 < port < 65536):
        raise argparse.ArgumentTypeError(
            f"--listen port out of range: {port}"
        )
    return host, port


def parse_upstream(value: str) -> Tuple[str, int, str]:
    """Parse 'http://host:port' — return (host, port, scheme).

    HTTPS upstream is not expected for SiYuan but we still tolerate the scheme
    so the user could chain proxies.
    """
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https"):
        raise argparse.ArgumentTypeError(
            f"--upstream scheme must be http(s), got {value!r}"
        )
    host = parts.hostname
    if not host:
        raise argparse.ArgumentTypeError(
            f"--upstream missing host: {value!r}"
        )
    port = parts.port or (443 if parts.scheme == "https" else 80)
    return host, port, parts.scheme


def filter_request_headers(
    raw_headers, upstream_host: str, upstream_port: int
) -> list:
    """Drop hop-by-hop headers and rewrite Host to the upstream target.

    Returns a list of (name, value) tuples preserving original order/casing
    where possible (http.client preserves the case it gets).
    """
    out = []
    seen_host = False
    for name, value in raw_headers.items():
        lname = name.lower()
        if lname in HOP_BY_HOP_HEADERS:
            continue
        if lname == "host":
            seen_host = True
            out.append((name, f"{upstream_host}:{upstream_port}"))
            continue
        # Drop Content-Length here; we'll re-emit it ourselves so chunked-to-
        # length conversion stays consistent. (For straight Content-Length
        # passthrough, we re-emit the original value.)
        if lname == "content-length":
            continue
        out.append((name, value))
    if not seen_host:
        out.append(("Host", f"{upstream_host}:{upstream_port}"))
    return out


def filter_response_headers(raw_headers) -> list:
    out = []
    for name, value in raw_headers.items():
        if name.lower() in HOP_BY_HOP_HEADERS:
            continue
        out.append((name, value))
    return out


def read_chunked_body(rfile, limit: int) -> bytes:
    """Read an HTTP/1.1 chunked-encoded request body into memory.

    The proxy converts chunked uploads to Content-Length uploads to avoid
    speaking chunked to the upstream connection (http.client expects a
    Content-Length or no body). `limit` is a hard cap to prevent memory abuse.
    """
    buf = bytearray()
    while True:
        line = rfile.readline()
        if not line:
            raise ConnectionError("unexpected EOF while reading chunk size")
        # Strip optional ";chunk-extension" and CRLF.
        size_str = line.split(b";", 1)[0].strip()
        try:
            size = int(size_str, 16)
        except ValueError as exc:
            raise ConnectionError(
                f"invalid chunk size {size_str!r}"
            ) from exc
        if size == 0:
            # Consume optional trailers until empty line.
            while True:
                trailer = rfile.readline()
                if not trailer or trailer in (b"\r\n", b"\n"):
                    break
            return bytes(buf)
        if len(buf) + size > limit:
            raise ConnectionError(
                f"chunked body exceeds limit ({limit} bytes)"
            )
        remaining = size
        while remaining > 0:
            chunk = rfile.read(min(remaining, STREAM_CHUNK_SIZE))
            if not chunk:
                raise ConnectionError("unexpected EOF inside chunk body")
            buf.extend(chunk)
            remaining -= len(chunk)
        # Consume trailing CRLF after chunk data.
        crlf = rfile.read(2)
        if crlf != b"\r\n":
            raise ConnectionError("missing CRLF after chunk body")


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------

class ProxyHandler(BaseHTTPRequestHandler):
    # Class-level config injected by main().
    upstream_host: str = "127.0.0.1"
    upstream_port: int = 6806
    upstream_scheme: str = "http"
    upstream_timeout: float = DEFAULT_TIMEOUT
    allowed_ips: Optional[tuple] = None  # None = allow all

    # Speak HTTP/1.1 so clients can keep connections alive on our side.
    protocol_version = "HTTP/1.1"

    # We log via our own logger; suppress BaseHTTPRequestHandler's default
    # stderr access logs.
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        logger.debug("%s - %s", self.address_string(), format % args)

    # All HTTP methods route through _proxy().
    def do_GET(self):     self._proxy()
    def do_POST(self):    self._proxy()
    def do_PUT(self):     self._proxy()
    def do_DELETE(self):  self._proxy()
    def do_PATCH(self):   self._proxy()
    def do_OPTIONS(self): self._proxy()
    def do_HEAD(self):    self._proxy()

    # ------------------------------------------------------------------
    # Core proxy logic
    # ------------------------------------------------------------------

    def _proxy(self) -> None:
        # IP whitelist check — runs on every request, before any proxy work.
        if self.allowed_ips is not None:
            client_ip = self.client_address[0]
            if client_ip not in self.allowed_ips:
                logger.warning(
                    "Rejected %s %s from %s (not in allow list)",
                    self.command, self.path, client_ip,
                )
                self._send_simple(403, f"Forbidden: {client_ip} not allowed")
                return

        start = time.monotonic()
        method = self.command
        path = self.path  # already includes query string
        client_ip = self.client_address[0]
        upstream_label = (
            f"{self.upstream_scheme}://{self.upstream_host}:{self.upstream_port}"
        )

        try:
            body, body_len = self._read_request_body()
        except Exception as exc:  # noqa: BLE001
            self._send_simple(400, f"Bad request body: {exc}")
            logger.warning(
                "%s %s %s -> 400 (read body failed: %s)",
                client_ip, method, path, exc,
            )
            return

        headers = filter_request_headers(
            self.headers, self.upstream_host, self.upstream_port
        )
        if body is not None:
            headers.append(("Content-Length", str(body_len)))

        conn: Optional[http.client.HTTPConnection] = None
        try:
            if self.upstream_scheme == "https":
                conn = http.client.HTTPSConnection(
                    self.upstream_host,
                    self.upstream_port,
                    timeout=self.upstream_timeout,
                )
            else:
                conn = http.client.HTTPConnection(
                    self.upstream_host,
                    self.upstream_port,
                    timeout=self.upstream_timeout,
                )

            # putrequest + putheader gives us full control vs request().
            conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
            for name, value in headers:
                conn.putheader(name, value)
            conn.endheaders()

            if body is not None:
                # body is either bytes (chunked-buffered) or a stream pumped
                # via _stream_request_body below.
                if isinstance(body, (bytes, bytearray)):
                    conn.send(bytes(body))
                else:
                    self._stream_request_body(conn, body, body_len)

            resp = conn.getresponse()
        except (socket.timeout, ConnectionError, OSError) as exc:
            self._send_simple(
                502,
                f"Bad gateway: cannot reach upstream {upstream_label}: {exc}",
            )
            logger.warning(
                "%s %s %s -> 502 (upstream error: %s)",
                client_ip, method, path, exc,
            )
            if conn is not None:
                conn.close()
            return
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "%s %s %s -> 500 (proxy bug: %s)\n%s",
                client_ip, method, path, exc, traceback.format_exc(),
            )
            self._send_simple(500, f"Proxy internal error: {exc}")
            if conn is not None:
                conn.close()
            return

        # Stream upstream response back to client.
        try:
            self.send_response(resp.status, resp.reason)
            resp_headers = filter_response_headers(resp.msg)
            # Re-emit Content-Length explicitly when present so streaming on
            # our side stays HTTP/1.1 compliant. HTTPResponse decodes chunked
            # encoding, so we write exactly that many bytes.
            content_length = resp.getheader("Content-Length")
            for name, value in resp_headers:
                # filter_response_headers already removed Transfer-Encoding,
                # but Content-Length passes through naturally.
                self.send_header(name, value)
            # If neither Content-Length nor we can stream a known-length body,
            # close the connection after the body to delimit it.
            if content_length is None:
                self.send_header("Connection", "close")
                self.close_connection = True
            self.end_headers()

            if method != "HEAD":
                self._stream_upstream(resp)

        except (BrokenPipeError, ConnectionResetError) as exc:
            logger.info(
                "%s %s %s : client disconnected mid-response (%s)",
                client_ip, method, path, exc,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "%s %s %s : error while streaming response: %s\n%s",
                client_ip, method, path, exc, traceback.format_exc(),
            )
        finally:
            try:
                resp.close()
            finally:
                conn.close()

        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "%s %s %s -> %d (%dms)",
            client_ip, method, path, resp.status, elapsed_ms,
        )

    def _stream_upstream(self, resp: http.client.HTTPResponse) -> None:
        """Copy the upstream body to the client.

        GET /mcp is a long-lived stream. SiYuan can sit silent for longer
        than the upstream read timeout. An idle wait is not a failed request:
        keep reading. Other requests still surface the timeout.
        """
        idle_ok = (
            self.command == "GET"
            and self.path.split("?", 1)[0].rstrip("/") == "/mcp"
        )
        if idle_ok:
            raw = getattr(getattr(resp, "fp", None), "raw", None)
            sock = getattr(raw, "_sock", None)
            if sock is not None:
                sock.settimeout(None)
        while True:
            try:
                buf = resp.read(STREAM_CHUNK_SIZE)
            except (TimeoutError, socket.timeout):
                if not idle_ok:
                    raise
                continue
            if not buf:
                break
            try:
                self.wfile.write(buf)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                break

    # ------------------------------------------------------------------
    # Body handling
    # ------------------------------------------------------------------

    def _read_request_body(self):
        """Return (body, length) where:
          * body is None and length is 0 if there is no request body,
          * body is the raw rfile (file-like) and length is content_length
            for streaming Content-Length uploads,
          * body is bytes and length is len(bytes) for chunked uploads
            (buffered then re-sent as Content-Length).

        We read body data eagerly only for chunked because http.client cannot
        emit chunked transfer encoding cleanly via putrequest/send.
        """
        cl = self.headers.get("Content-Length")
        te = self.headers.get("Transfer-Encoding", "")

        if cl is not None:
            try:
                length = int(cl)
            except ValueError as exc:
                raise ConnectionError(
                    f"invalid Content-Length: {cl!r}"
                ) from exc
            if length < 0:
                raise ConnectionError(
                    f"negative Content-Length: {length}"
                )
            if length == 0:
                return None, 0
            return self.rfile, length

        if "chunked" in te.lower():
            buf = read_chunked_body(self.rfile, CHUNKED_BUFFER_LIMIT)
            return buf, len(buf)

        # No body (e.g. GET, OPTIONS without payload).
        return None, 0

    def _stream_request_body(
        self,
        conn: http.client.HTTPConnection,
        rfile,
        length: int,
    ) -> None:
        remaining = length
        while remaining > 0:
            chunk = rfile.read(min(remaining, STREAM_CHUNK_SIZE))
            if not chunk:
                raise ConnectionError(
                    f"client disconnected with {remaining} bytes remaining"
                )
            conn.send(chunk)
            remaining -= len(chunk)

    # ------------------------------------------------------------------
    # Error responses
    # ------------------------------------------------------------------

    def _send_simple(self, status: int, message: str) -> None:
        body = message.encode("utf-8", errors="replace")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            self.close_connection = True


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

class _ThreadedServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def build_server(
    listen_host: str,
    listen_port: int,
    upstream_host: str,
    upstream_port: int,
    upstream_scheme: str,
    timeout: float,
    allowed_ips: Optional[tuple] = None,
) -> _ThreadedServer:
    ProxyHandler.upstream_host = upstream_host
    ProxyHandler.upstream_port = upstream_port
    ProxyHandler.upstream_scheme = upstream_scheme
    ProxyHandler.upstream_timeout = timeout
    ProxyHandler.allowed_ips = allowed_ips

    server = _ThreadedServer((listen_host, listen_port), ProxyHandler)
    return server


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Reverse HTTP proxy for SiYuan kernel. "
            "Default: 0.0.0.0:26806 -> http://127.0.0.1:6806"
        ),
    )
    parser.add_argument(
        "--listen",
        type=parse_listen,
        default=parse_listen(DEFAULT_LISTEN),
        metavar="HOST:PORT",
        help=f"local listen address (default {DEFAULT_LISTEN})",
    )
    parser.add_argument(
        "--upstream",
        type=parse_upstream,
        default=parse_upstream(DEFAULT_UPSTREAM),
        metavar="URL",
        help=f"upstream SiYuan kernel URL (default {DEFAULT_UPSTREAM})",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"upstream request timeout in seconds (default {DEFAULT_TIMEOUT})",
    )
    parser.add_argument(
        "--log-level",
        default=os.environ.get("SIYUAN_PROXY_LOG_LEVEL", "INFO"),
        help="logging level: DEBUG/INFO/WARNING/ERROR (default INFO)",
    )
    parser.add_argument(
        "--allow-ip",
        dest="allow_ips",
        action="append",
        default=None,
        metavar="IP",
        help=(
            "IP address allowed to connect. Repeat to add more. "
            f"Default: [{', '.join(DEFAULT_ALLOW_IPS)}]. "
            "Use --allow-ip=0.0.0.0 to allow all."
        ),
    )
    return parser.parse_args(argv)


def configure_logging(level_name: str) -> None:
    level = getattr(logging, level_name.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main(argv=None) -> int:
    args = parse_args(argv)
    configure_logging(args.log_level)

    listen_host, listen_port = args.listen
    up_host, up_port, up_scheme = args.upstream

    # Build IP allow list: None = allow all, tuple = whitelist.
    raw_ips = args.allow_ips
    if raw_ips is None:
        # No --allow-ip specified → use default.
        allowed_ips: Optional[tuple] = DEFAULT_ALLOW_IPS
    elif "0.0.0.0" in raw_ips:
        allowed_ips = None  # open mode
    else:
        allowed_ips = tuple(raw_ips)

    server = build_server(
        listen_host, listen_port,
        up_host, up_port, up_scheme,
        args.timeout,
        allowed_ips,
    )

    upstream_label = f"{up_scheme}://{up_host}:{up_port}"
    allow_label = (
        "ALL (open)" if allowed_ips is None
        else ", ".join(allowed_ips)
    )
    logger.info(
        "Listening on %s:%d -> %s (timeout=%.1fs, allow=%s)",
        listen_host, listen_port, upstream_label, args.timeout, allow_label,
    )
    if allowed_ips is None and listen_host in ("0.0.0.0", "::", ""):
        logger.warning(
            "Bound on a public interface with NO IP restriction. "
            "Auth is enforced by SiYuan's own token only.",
        )

    stop_event = threading.Event()

    def _shutdown(signum, _frame):
        logger.info("Received signal %s, shutting down...", signum)
        stop_event.set()
        # Run shutdown() in a separate thread because it blocks until
        # serve_forever() returns, and we are inside a signal handler.
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, _shutdown)
    try:
        signal.signal(signal.SIGTERM, _shutdown)
    except (AttributeError, ValueError):
        # SIGTERM not available on some platforms (e.g. Windows main thread).
        pass

    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        logger.info("Proxy stopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
