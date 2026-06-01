#!/usr/bin/env python3
"""Small SiYuan HTTP API helper bundled with Claude Note."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


API_URL = os.getenv("SIYUAN_API_URL") or f"http://127.0.0.1:{os.getenv('SIYUAN_API_PORT', '6806')}"
API_TOKEN = os.getenv("SIYUAN_API_TOKEN", "")


def request(endpoint, data=None):
    body = json.dumps(data or {}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        API_URL.rstrip("/") + endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Token {API_TOKEN}"} if API_TOKEN else {}),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read().decode('utf-8', errors='replace')}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        sys.exit(1)
    if isinstance(result, dict) and result.get("code", 0) != 0:
        print(f"SiYuan API error {result.get('code')}: {result.get('msg', '')}", file=sys.stderr)
        sys.exit(1)
    return result.get("data") if isinstance(result, dict) else result


def print_json(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def cmd_notebooks(_args):
    data = request("/api/notebook/lsNotebooks") or {}
    print_json(data.get("notebooks", data))


def cmd_sql(args):
    print_json(request("/api/query/sql", {"stmt": args.stmt}) or [])


def cmd_search(args):
    keyword = args.keyword.replace("'", "''")
    stmt = (
        "SELECT id, content, hpath, type FROM blocks "
        f"WHERE content LIKE '%{keyword}%' OR hpath LIKE '%{keyword}%' "
        f"LIMIT {int(args.limit)}"
    )
    print_json(request("/api/query/sql", {"stmt": stmt}) or [])


def cmd_export(args):
    print(request("/api/export/exportMdContent", {"id": args.id}) or "")


def cmd_hpath(args):
    if args.id:
        print(request("/api/filetree/getHPathByID", {"id": args.id}) or "")
    else:
        print(request("/api/filetree/getHPathByPath", {"notebook": args.notebook, "path": args.path}) or "")


def cmd_block_kramdown(args):
    data = request("/api/block/getBlockKramdown", {"id": args.id})
    if isinstance(data, dict):
        print(data.get("kramdown", ""))
    else:
        print(data or "")


def cmd_child_blocks(args):
    print_json(request("/api/block/getChildBlocks", {"id": args.id}) or [])


def cmd_create(args):
    print_json(request("/api/filetree/createDocWithMd", {
        "notebook": args.notebook,
        "path": args.path,
        "markdown": args.markdown,
    }))


def cmd_rename(args):
    if args.id:
        print_json(request("/api/filetree/renameDocByID", {"id": args.id, "title": args.title}))
    else:
        print_json(request("/api/filetree/renameDoc", {
            "notebook": args.notebook,
            "path": args.path,
            "title": args.title,
        }))


def cmd_remove(args):
    if args.id:
        print_json(request("/api/filetree/removeDocByID", {"id": args.id}))
    else:
        print_json(request("/api/filetree/removeDoc", {"notebook": args.notebook, "path": args.path}))


def cmd_update_block(args):
    print_json(request("/api/block/updateBlock", {"id": args.id, "dataType": "markdown", "data": args.data}))


def cmd_delete_block(args):
    print_json(request("/api/block/deleteBlock", {"id": args.id}))


def cmd_append_block(args):
    print_json(request("/api/block/appendBlock", {"parentID": args.parent_id, "dataType": "markdown", "data": args.data}))


def cmd_prepend_block(args):
    print_json(request("/api/block/prependBlock", {"parentID": args.parent_id, "dataType": "markdown", "data": args.data}))


def cmd_insert_block(args):
    payload = {"dataType": "markdown", "data": args.data}
    if args.next_id:
        payload["nextID"] = args.next_id
    elif args.previous_id:
        payload["previousID"] = args.previous_id
    elif args.parent_id:
        payload["parentID"] = args.parent_id
    else:
        print("insert-block requires --next-id, --previous-id, or --parent-id", file=sys.stderr)
        sys.exit(2)
    print_json(request("/api/block/insertBlock", payload))


def cmd_move_block(args):
    payload = {"id": args.id}
    if args.previous_id:
        payload["previousID"] = args.previous_id
    if args.parent_id:
        payload["parentID"] = args.parent_id
    if len(payload) == 1:
        print("move-block requires --previous-id or --parent-id", file=sys.stderr)
        sys.exit(2)
    print_json(request("/api/block/moveBlock", payload))


def main():
    parser = argparse.ArgumentParser(description="Claude Note bundled SiYuan helper")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("notebooks", aliases=["nb"]).set_defaults(func=cmd_notebooks)

    p = sub.add_parser("sql")
    p.add_argument("stmt")
    p.set_defaults(func=cmd_sql)

    p = sub.add_parser("search", aliases=["s"])
    p.add_argument("keyword")
    p.add_argument("--limit", type=int, default=20)
    p.set_defaults(func=cmd_search)

    p = sub.add_parser("export", aliases=["cat"])
    p.add_argument("id")
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("hpath")
    p.add_argument("--id")
    p.add_argument("-n", "--notebook")
    p.add_argument("-p", "--path")
    p.set_defaults(func=cmd_hpath)

    p = sub.add_parser("block-kramdown", aliases=["bk"])
    p.add_argument("id")
    p.set_defaults(func=cmd_block_kramdown)

    p = sub.add_parser("child-blocks", aliases=["ch"])
    p.add_argument("id")
    p.set_defaults(func=cmd_child_blocks)

    p = sub.add_parser("create", aliases=["mk"])
    p.add_argument("-n", "--notebook", required=True)
    p.add_argument("-p", "--path", required=True)
    p.add_argument("-m", "--markdown", default="")
    p.set_defaults(func=cmd_create)

    p = sub.add_parser("rename", aliases=["rn"])
    p.add_argument("--id")
    p.add_argument("-n", "--notebook")
    p.add_argument("-p", "--path")
    p.add_argument("--title", required=True)
    p.set_defaults(func=cmd_rename)

    p = sub.add_parser("remove", aliases=["rm"])
    p.add_argument("--id")
    p.add_argument("-n", "--notebook")
    p.add_argument("-p", "--path")
    p.set_defaults(func=cmd_remove)

    p = sub.add_parser("update-block", aliases=["bu"])
    p.add_argument("id")
    p.add_argument("-d", "--data", required=True)
    p.set_defaults(func=cmd_update_block)

    p = sub.add_parser("delete-block", aliases=["bd"])
    p.add_argument("id")
    p.set_defaults(func=cmd_delete_block)

    p = sub.add_parser("append-block", aliases=["app"])
    p.add_argument("parent_id")
    p.add_argument("-d", "--data", required=True)
    p.set_defaults(func=cmd_append_block)

    p = sub.add_parser("prepend-block", aliases=["pre"])
    p.add_argument("parent_id")
    p.add_argument("-d", "--data", required=True)
    p.set_defaults(func=cmd_prepend_block)

    p = sub.add_parser("insert-block", aliases=["ins"])
    p.add_argument("-d", "--data", required=True)
    p.add_argument("--parent-id")
    p.add_argument("--previous-id")
    p.add_argument("--next-id")
    p.set_defaults(func=cmd_insert_block)

    p = sub.add_parser("move-block", aliases=["mv"])
    p.add_argument("id")
    p.add_argument("--parent-id")
    p.add_argument("--previous-id")
    p.set_defaults(func=cmd_move_block)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
