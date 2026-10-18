/**
 * 改编自 siyuan-plugin-tts（https://github.com/zuoez02/siyuan-plugin-tts），作者 zuoez02。
 * 原仓库没有 LICENSE 文件。这里保留 Microsoft Edge ReadAloud 的合成与播放流程。
 *
 * Node 的 crypto / net / tls / stream 只在方法里通过 window["require"] 取得，
 * 避免模块被打进主包后，在浏览器或移动端一加载就执行 require。
 */

import { generateSecMsGecV2 } from "./sec-ms-gec";

const OUTPUT_FORMAT_WEBM_24 = "webm-24khz-16bit-mono-opus";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;

export const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

const logger = {
    level: "warn" as "info" | "warn" | "error",
    info: (...args: unknown[]) => ["info"].includes(logger.level) && console.log(...args),
    warn: (...args: unknown[]) => ["info", "warn"].includes(logger.level) && console.warn(...args),
    error: (...args: unknown[]) => ["info", "warn", "error"].includes(logger.level) && console.error(...args),
};

interface NodeApi {
    randomBytes: (size: number) => Buffer;
    net: { connect: (options: any, listener: () => void) => any };
    tls: { connect: (options: any, listener: () => void) => any };
    Readable: new (options: { read: () => void }) => any;
}

let nodeApi: NodeApi | null = null;

function nodeRequire(id: string): any {
    const req = (window as any)["require"];
    if (typeof req !== "function") {
        throw new Error("文本朗读仅在桌面端可用");
    }
    return req(id);
}

function node(): NodeApi {
    if (nodeApi) return nodeApi;
    const crypto = nodeRequire("crypto");
    const stream = nodeRequire("stream");
    nodeApi = {
        randomBytes: crypto.randomBytes.bind(crypto),
        net: nodeRequire("net"),
        tls: nodeRequire("tls"),
        Readable: stream.Readable,
    };
    return nodeApi;
}

class MiniEmitter {
    private listeners = new Map<string, Array<(...args: any[]) => void>>();

    on(event: string, fn: (...args: any[]) => void) {
        const list = this.listeners.get(event) || [];
        list.push(fn);
        this.listeners.set(event, list);
        return this;
    }

    emit(event: string, ...args: any[]) {
        for (const fn of this.listeners.get(event) || []) fn(...args);
    }
}

class NodeWebSocket extends MiniEmitter {
    url: URL;
    options: any;
    socket: any = null;
    connected = false;
    buffer: Buffer = Buffer.alloc(0);
    isHandshakeComplete = false;
    readyState = 0;
    fragments: Buffer[] = [];
    fragmentOpcode = 0;
    onclose: (() => void) | null = null;
    onerror: ((err: any) => void) | null = null;
    onopen: ((connection?: any) => void) | null = null;
    onmessage: ((message: { data: string | Blob }) => void) | null = null;

    constructor(url: string, options: any = {}) {
        super();
        this.url = new URL(url);
        this.options = options;
    }

    connect() {
        const api = node();
        const isSecure = this.url.protocol === "wss:";
        const port = this.url.port || (isSecure ? 443 : 80);
        const connectOptions = {
            host: this.options.host || this.url.hostname,
            port,
            rejectUnauthorized: this.options.rejectUnauthorized !== false,
        };
        const connectModule = isSecure ? api.tls : api.net;
        this.socket = connectModule.connect(connectOptions, () => {
            this.sendHandshake();
        });
        this.socket.on("data", (data: Buffer) => {
            this.buffer = Buffer.concat([this.buffer, data]);
            if (!this.isHandshakeComplete) {
                this.handleHandshake();
            } else {
                this.processFrames();
            }
        });
        this.socket.on("close", () => {
            this.connected = false;
            this.readyState = 3;
            this.onclose?.();
            this.emit("close");
        });
        this.socket.on("error", (err: any) => {
            if (err.code === "ECONNRESET" || err.code === "EPIPE") {
                this.connected = false;
                this.readyState = 3;
                this.onclose?.();
                this.emit("close");
                return;
            }
            this.readyState = 3;
            this.onerror?.(err);
            this.emit("error", err);
        });
    }

    send(data: string | Buffer) {
        if (this.readyState !== 1) throw new Error("WebSocket is not open");
        let opcode: number;
        let payload: Buffer;
        if (typeof data === "string") {
            opcode = 0x1;
            payload = Buffer.from(data, "utf8");
        } else if (Buffer.isBuffer(data)) {
            opcode = 0x2;
            payload = data;
        } else {
            throw new Error("Data must be string or Buffer");
        }
        this.writeFrame(opcode, payload);
    }

    close() {
        if (this.readyState === 3) return;
        this.readyState = 2;
        this.fragments = [];
        this.fragmentOpcode = 0;
        const payload = Buffer.alloc(2);
        payload.writeUInt16BE(1000, 0);
        this.writeFrame(0x8, payload);
    }

    private sendHandshake() {
        const key = node().randomBytes(16).toString("base64");
        const headers = [
            `GET ${this.url.pathname}${this.url.search} HTTP/1.1`,
            `Host: ${this.url.hostname}:${this.url.port || (this.url.protocol === "wss:" ? 443 : 80)}`,
            "Upgrade: websocket",
            "Connection: Upgrade",
            `Sec-WebSocket-Key: ${key}`,
            "Sec-WebSocket-Version: 13",
        ];
        if (this.options.origin) {
            headers.push(`Origin: ${this.options.origin}`);
        }
        if (this.options.headers) {
            for (const [headerName, headerValue] of Object.entries(this.options.headers)) {
                if (headerName.toLowerCase() === "origin" && this.options.origin) continue;
                headers.push(`${headerName}: ${headerValue}`);
            }
        }
        this.socket.write(headers.join("\r\n") + "\r\n\r\n");
    }

    private handleHandshake() {
        const idx = this.buffer.indexOf("\r\n\r\n");
        if (idx === -1) return;
        const headers = this.buffer.slice(0, idx).toString().split("\r\n");
        this.buffer = this.buffer.slice(idx + 4);
        const statusLine = headers[0];
        if (!statusLine.includes("101")) {
            const err = new Error(`Unexpected server response: ${statusLine}`);
            this.onerror?.(err);
            this.socket.end();
            return;
        }
        this.isHandshakeComplete = true;
        this.connected = true;
        this.readyState = 1;
        this.onopen?.();
        this.emit("open");
        if (this.buffer.length > 0) this.processFrames();
    }

    private writeFrame(opcode: number, payload: Buffer) {
        if (!this.socket || this.socket.destroyed || !this.socket.writable) return;
        const length = payload.length;
        let frameSize = 2;
        let lengthByte = 0;
        if (length < 126) {
            lengthByte = length;
        } else if (length < 65536) {
            frameSize += 2;
            lengthByte = 126;
        } else {
            frameSize += 8;
            lengthByte = 127;
        }
        frameSize += 4;
        const frame = Buffer.alloc(frameSize + length);
        frame[0] = 0x80 | opcode;
        frame[1] = 0x80 | lengthByte;
        let payloadOffset = 2;
        if (lengthByte === 126) {
            frame.writeUInt16BE(length, 2);
            payloadOffset += 2;
        } else if (lengthByte === 127) {
            frame.writeUInt32BE(0, 2);
            frame.writeUInt32BE(length, 6);
            payloadOffset += 8;
        }
        const maskKey = node().randomBytes(4);
        maskKey.copy(frame, payloadOffset);
        payloadOffset += 4;
        for (let i = 0; i < length; i++) {
            frame[payloadOffset + i] = payload[i] ^ maskKey[i % 4];
        }
        this.socket.write(frame);
    }

    private processFrames() {
        while (this.buffer.length >= 2) {
            const firstByte = this.buffer[0];
            const secondByte = this.buffer[1];
            const fin = (firstByte & 0x80) === 0x80;
            const opcode = firstByte & 0x0f;
            const masked = (secondByte & 0x80) === 0x80;
            let payloadLen = secondByte & 0x7f;
            let headerSize = 2;
            if (payloadLen === 126) {
                if (this.buffer.length < 4) return;
                payloadLen = this.buffer.readUInt16BE(2);
                headerSize += 2;
            } else if (payloadLen === 127) {
                if (this.buffer.length < 10) return;
                this.buffer.readUInt32BE(2);
                payloadLen = this.buffer.readUInt32BE(6);
                headerSize += 8;
            }
            if (masked) headerSize += 4;
            if (this.buffer.length < headerSize + payloadLen) return;

            let payload = this.buffer.slice(headerSize, headerSize + payloadLen);
            if (masked) {
                const maskKey = this.buffer.slice(headerSize - 4, headerSize);
                const unmasked = Buffer.alloc(payload.length);
                for (let i = 0; i < payload.length; i++) {
                    unmasked[i] = payload[i] ^ maskKey[i % 4];
                }
                payload = unmasked;
            }
            this.buffer = this.buffer.slice(headerSize + payloadLen);

            if (opcode === 0x0) {
                if (this.fragmentOpcode === 0) continue;
                this.fragments.push(payload);
                if (fin) {
                    const fullPayload = Buffer.concat(this.fragments);
                    if (this.fragmentOpcode === 0x1) {
                        this.onmessage?.({ data: fullPayload.toString("utf8") });
                    } else if (this.fragmentOpcode === 0x2) {
                        this.onmessage?.({ data: new Blob([toArrayBuffer(fullPayload)]) });
                    }
                    this.fragments = [];
                    this.fragmentOpcode = 0;
                }
            } else if (opcode === 0x1 || opcode === 0x2) {
                if (!fin) {
                    this.fragmentOpcode = opcode;
                    this.fragments.push(payload);
                } else if (opcode === 0x1) {
                    this.onmessage?.({ data: payload.toString("utf8") });
                } else {
                    this.onmessage?.({ data: new Blob([toArrayBuffer(payload)]) });
                }
            } else if (opcode === 0x8) {
                this.close();
            }
        }
    }
}

function combineUrl(url: string) {
    const connectionId = node().randomBytes(16).toString("hex");
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${generateSecMsGecV2()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
}

class MsEdgeTTS {
    static SYNTH_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
    static BINARY_DELIM = "Path:audio\r\n";
    static VOICE_LANG_REGEX = /\w{2}-\w{2}/;

    private ws: NodeWebSocket | null = null;
    private voice = "";
    private voiceLocale = "";
    private outputFormat = "";
    private queue: Record<string, any> = {};
    private startTime = 0;
    private end: Record<string, number> = {};
    private requestContent: Record<string, string> = {};
    private finished: Record<string, boolean> = {};
    private wsInitPromise: Promise<NodeWebSocket> | null = null;

    close() {
        this.ws?.close();
    }

    private async send(message: string) {
        await this.initClient();
        return this.ws?.send(message);
    }

    private initClient() {
        if (this.wsInitPromise) return this.wsInitPromise;
        this.wsInitPromise = new Promise((resolve, reject) => {
            const messageQueue: Array<any> = [];
            const checkAndSend = (id: string, index: number) => {
                logger.info("[TTS]\tchecking", id, index);
                const cache: Buffer[] = [];
                if (this.end[id] === undefined) return false;
                let j = 0;
                for (; j <= index; j++) {
                    if (!messageQueue[j]) {
                        logger.info("[TTS]\tCheck found null", id, j);
                        return false;
                    }
                    if (messageQueue[j].id !== id) continue;
                    if (messageQueue[j].data) cache.push(messageQueue[j].data);
                }
                for (const audio of cache) this.queue[id].push(audio);
                logger.info("[TTS]\tCheck finished", id, index, j, this.requestContent[id]);
                this.queue[id].push(null);
                this.finished[id] = true;
                return true;
            };
            const checkEndedNotFinished = () => {
                for (const key in this.end) {
                    if (!this.finished[key]) {
                        logger.info("[TTS]\tChecking ended request but not finished", key, this.end[key], this.requestContent[key]);
                        checkAndSend(key, this.end[key]);
                    }
                }
            };

            let i = 0;
            this.ws = new NodeWebSocket(combineUrl(MsEdgeTTS.SYNTH_URL), {
                host: "speech.platform.bing.com",
                origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
                headers: {
                    Pragma: "no-cache",
                    "Cache-Control": "no-cache",
                    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_FULL_VERSION.split(".")[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split(".")[0]}.0.0.0`,
                    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
                    "Accept-Encoding": "gzip, deflate, br, zstd",
                    "Accept-Language": "en-US,en;q=0.9",
                    Cookie: `muid=${node().randomBytes(16).toString("hex").toUpperCase()};`,
                },
                rejectUnauthorized: false,
            });
            this.ws.connect();
            this.ws.onmessage = (message) => {
                if (typeof message.data === "string") {
                    const data = Buffer.from(message.data);
                    const matched = /X-RequestId:(.*?)\r\n/gm.exec(data.toString());
                    if (!matched) {
                        logger.warn("UNKNOWN STRING MESSAGE", data);
                        return;
                    }
                    const requestId = matched[1];
                    const text = data.toString();
                    if (text.includes("Path:turn.start")) {
                        messageQueue[i] = { id: requestId, type: "start" };
                    } else if (text.includes("Path:turn.end")) {
                        this.end[requestId] = i;
                        messageQueue[i] = { id: requestId, type: "end" };
                        logger.info("[TTS]\tEnd: ", this.requestContent[requestId], requestId);
                    } else if (text.includes("Path:response")) {
                        messageQueue[i] = { id: requestId, type: "ignore" };
                    } else {
                        logger.warn("UNKNOWN MESSAGE", data);
                    }
                    logger.info("[TTS]\tString set: ", i, messageQueue[i], requestId, this.requestContent[requestId]);
                    checkAndSend(requestId, i);
                } else if (message.data instanceof Blob) {
                    const blob = message.data;
                    const cur = i;
                    messageQueue[i] = null;
                    blob.arrayBuffer().then((buffer) => {
                        const data = Buffer.from(buffer);
                        const matched = /X-RequestId:(.*?)\r\n/gm.exec(data.toString());
                        if (!matched?.[1]) {
                            logger.error("UNKNOWN Blob data", data);
                            logger.info(data.toString());
                            return;
                        }
                        const requestId = matched[1];
                        if (data[0] === 0x00 && data[1] === 0x67 && data[2] === 0x58) {
                            messageQueue[cur] = { id: requestId, type: "ignore" };
                        } else {
                            const index = data.indexOf(MsEdgeTTS.BINARY_DELIM) + MsEdgeTTS.BINARY_DELIM.length;
                            messageQueue[cur] = { id: requestId, data: data.slice(index) };
                        }
                        logger.info("[TTS]\tblob set:", cur, messageQueue[cur]);
                        checkAndSend(requestId, this.end[requestId] ?? -1);
                        checkEndedNotFinished();
                    });
                } else {
                    console.warn("[TTS]\t UNKNOWN type of m.data");
                }
                i++;
            };
            this.ws.onclose = () => {
                logger.info("[TTS]\tdisconnected");
                this.wsInitPromise = null;
            };
            this.ws.onopen = () => {
                logger.info("[TTS]\tConnected in", (Date.now() - this.startTime) / 1000, "seconds");
                this.ws?.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n
                    {
                        "context": {
                            "synthesis": {
                                "audio": {
                                    "metadataoptions": {
                                        "sentenceBoundaryEnabled": "false",
                                        "wordBoundaryEnabled": "false"
                                    },
                                    "outputFormat": "${this.outputFormat}"
                                }
                            }
                        }
                    }
                `);
                resolve(this.ws!);
            };
            this.ws.onerror = (error) => {
                reject("Connect Error: " + error);
            };
        });
        return this.wsInitPromise;
    }

    private ssmlTemplate(input: string) {
        return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${this.voiceLocale}">
                <voice name="${this.voice}">
                    ${input}
                </voice>
            </speak>`;
    }

    async setMetadata(voiceName: string, outputFormat: string, voiceLocale?: string) {
        const oldVoice = this.voice;
        const oldVoiceLocale = this.voiceLocale;
        const oldOutputFormat = this.outputFormat;
        this.voice = voiceName;
        this.voiceLocale = voiceLocale || "";
        if (!this.voiceLocale) {
            const voiceLangMatch = MsEdgeTTS.VOICE_LANG_REGEX.exec(this.voice);
            if (!voiceLangMatch) throw new Error("Could not infer voiceLocale from voiceName!");
            this.voiceLocale = voiceLangMatch[0];
        }
        this.outputFormat = outputFormat;
        const changed = oldVoice !== this.voice || oldVoiceLocale !== this.voiceLocale || oldOutputFormat !== this.outputFormat;
        if (!this.ws || changed) await this.initClient();
    }

    private metadataCheck() {
        if (!this.ws) {
            throw new Error("Speech synthesis not configured yet. Run setMetadata before calling toStream or toFile.");
        }
    }

    toStream(input: string) {
        return this.rawSsmlRequest(this.ssmlTemplate(input));
    }

    private async rawSsmlRequest(requestSSML: string) {
        this.metadataCheck();
        if (!this.ws || this.ws.readyState === 2 || this.ws.readyState === 3) {
            await this.initClient();
        }
        const requestId = node().randomBytes(16).toString("hex");
        const request = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n
                ` + requestSSML.trim();
        const readable = new (node().Readable)({ read() { } });
        this.requestContent[requestId] = requestSSML.trim().split("\n")[2].trim();
        this.queue[requestId] = readable;
        this.send(request).then();
        return readable;
    }
}

function toArrayBuffer(buf: Buffer) {
    const copy = new ArrayBuffer(buf.length);
    const view = new Uint8Array(copy);
    for (let i = 0; i < buf.length; ++i) view[i] = buf[i];
    return copy;
}

function setPauseIcon(href: string) {
    const iconEl = document.querySelector('.tts-nav-btn[data-type="pause"] use');
    iconEl?.setAttribute("xlink:href", href);
}

class Player {
    private loaded = false;
    private source: AudioBufferSourceNode | null = null;
    private block: Block | null = null;
    private loadPromise: Promise<void> | null = null;
    private isEmpty = true;
    content = "";

    constructor(private tts: MsEdgeTTS) { }

    async load(block: Block) {
        this.isEmpty = block.isEmpty();
        if (this.isEmpty) {
            this.loadPromise = Promise.resolve();
            return this.loadPromise;
        }
        this.block = block;
        this.content = block.content;
        if (this.loadPromise) return this.loadPromise;
        logger.info(`[Player]\tloading block: '${this.content}'`);
        const context = new AudioContext();
        const buffers: Buffer[] = [];
        this.loadPromise = this.tts.toStream(this.content).then((readable: any) => {
            return new Promise<void>((resolve, reject) => {
                readable.on("data", (data: Buffer) => {
                    buffers.push(data);
                });
                readable.on("close", () => {
                    const merged = Buffer.concat(buffers);
                    try {
                        context.decodeAudioData(toArrayBuffer(merged), (buffer) => {
                            const source = context.createBufferSource();
                            this.source = source;
                            this.loaded = true;
                            source.buffer = buffer;
                            source.connect(context.destination);
                            resolve();
                        }, (error) => reject(error));
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
        return this.loadPromise;
    }

    async setRate(rate: number) {
        if (!this.loaded && this.block) await this.load(this.block);
        if (this.isEmpty || !this.source) return;
        this.source.playbackRate.value = rate;
    }

    async play() {
        if (!this.loaded && this.block) await this.load(this.block);
        if (this.isEmpty || !this.source || !this.block) return;
        this.block.highlight();
        this.source.start(0);
        return new Promise<void>((resolve) => {
            this.source?.addEventListener("ended", () => {
                this.block?.unhighlight();
                resolve();
            });
        });
    }

    stop() {
        this.source?.stop();
    }

    pause() {
        (this.source?.context as AudioContext | undefined)?.suspend();
    }

    resume() {
        (this.source?.context as AudioContext | undefined)?.resume();
    }
}

export class Block {
    el: Element | null;
    content: string;

    constructor(blockElement: Element | string) {
        if (!blockElement) {
            throw new Error("Block constructor must has 1 parameter blockElement or string content");
        }
        if (typeof blockElement === "string") {
            this.content = blockElement;
            this.el = null;
            return;
        }
        this.el = blockElement;
        this.content = blockElement.textContent?.normalize("NFD").replace(/[\u200B-\u200D\uFEFF]/g, "") || "";
    }

    isEmpty() {
        return this.content.trim() === "";
    }

    highlight() {
        const nodeId = this.el?.getAttribute("data-node-id");
        if (!nodeId) return;
        document.querySelector(`.protyle-wysiwyg [data-node-id="${nodeId}"]`)?.classList.add("tts-highlight");
    }

    unhighlight() {
        const nodeId = this.el?.getAttribute("data-node-id");
        if (!nodeId) return;
        document.querySelector(`.protyle-wysiwyg [data-node-id="${nodeId}"]`)?.classList.remove("tts-highlight");
    }
}

export interface TtsPlaybackConfig {
    currentMetadata: string;
    playbackRate: number;
}

export interface TtsStatusSink {
    setStatus(content: string): void;
}

export class Controller {
    blocks: Block[] = [];
    private players: Player[] = [];
    private cacheIndex = 0;
    playIndex = 0;
    private maxCache = 3;
    private tts = new MsEdgeTTS();
    private active = true;
    playbackRate: number;
    isPaused = false;

    constructor(config: TtsPlaybackConfig, private plugin: TtsStatusSink) {
        this.playbackRate = config.playbackRate;
        this.tts.setMetadata(config.currentMetadata, OUTPUT_FORMAT_WEBM_24).catch((error) => {
            console.error("[TTS] 连接朗读服务失败:", error);
        });
    }

    loadBlocks(blockElements: Array<Element | string>) {
        this.blocks = blockElements.map((item) => new Block(item));
    }

    loadContent(content: string) {
        if (typeof content !== "string") throw new Error("loadContent must have a string parameter");
        this.blocks = [new Block(content)];
    }

    async play() {
        if (!this.active) return;
        logger.info("[Controller]\tgoing to play, checking cache", this.playIndex, this.blocks);
        this.isPaused = false;
        this.plugin.setStatus(`正在加载块, 数量: ${this.blocks.length}`);
        while (this.players.length < this.maxCache && this.cacheIndex < this.blocks.length) {
            if (this.blocks[this.cacheIndex].isEmpty()) {
                logger.info("[Controller]\tskip empty block");
                this.cacheIndex++;
                continue;
            }
            const player = new Player(this.tts);
            player.load(this.blocks[this.cacheIndex]);
            logger.info("[Controller]\tCreate player cache");
            this.plugin.setStatus(`正在缓存块, 编号: ${this.cacheIndex + 1}`);
            this.players.push(player);
            this.cacheIndex++;
        }
        logger.info("[Controller]\tcheck finished, ready to play", this.playIndex);
        const player = this.players[0];
        if (!player) {
            this.stop();
            logger.info("[Controller]\tNo player in cache, going to clean and stop", this.playIndex);
            this.plugin.setStatus("播放完成, 已停止");
            return;
        }
        setPauseIcon("#iconPause");
        logger.info("[Controller]\tplaying =>>> ", player.content, this.playIndex);
        this.plugin.setStatus(`正在播放块: ${this.playIndex + 1}/${this.blocks.length}`);
        await player.setRate(this.playbackRate);
        await player.play();
        if (!this.active) return;
        logger.info("[Controller]\tplayed =>>>", player.content, this.playIndex);
        this.players.shift();
        this.playIndex++;
        this.play();
    }

    stop() {
        this.active = false;
        this.players.forEach((player) => {
            try {
                player.stop();
            } catch {
                return;
            }
        });
        this.tts.close();
        this.blocks[this.playIndex]?.unhighlight();
        setPauseIcon("#iconRecord");
        this.blocks = [];
        this.players = [];
        this.cacheIndex = 0;
        this.playIndex = 0;
        this.isPaused = false;
        this.plugin.setStatus("已停止");
    }

    pause() {
        if (this.players[0]) {
            this.players[0].pause();
            this.isPaused = true;
            setPauseIcon("#iconPlay");
        }
    }

    resume() {
        if (this.players[0]) {
            this.players[0].resume();
            this.isPaused = false;
            setPauseIcon("#iconPause");
        }
    }
}
