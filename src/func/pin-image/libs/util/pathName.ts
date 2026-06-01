import { getElectronIpcRenderer, isBrowser } from "../../utils/electron-util";
import { Constants } from "siyuan";
import { isWindows } from "../compatibility";

/**
 * 通过 Electron 的 window.require 获取 Node.js path 模块。
 * 不使用静态 `import * as path from "path"`，因为 vite 在浏览器构建时
 * 会发出 "Module 'path' has been externalized" 警告并 stub 掉 posix 命名空间。
 */
function nodePath(): typeof import("path") | null {
    try {
        const requireFn = (window as any)?.require;
        if (typeof requireFn !== "function") return null;
        return requireFn("path") as typeof import("path");
    } catch {
        return null;
    }
}

export const pathPosix = () => {
    const p = nodePath();
    if (p?.posix) return p.posix;
    // 浏览器 fallback：用最小的 posix 替代实现
    return {
        basename: (filePath: string, ext?: string): string => {
            const name = filePath.split(/[\\/]/).pop() || "";
            return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
        },
        extname: (filePath: string): string => {
            const name = filePath.split(/[\\/]/).pop() || "";
            const dot = name.lastIndexOf(".");
            return dot > 0 ? name.slice(dot) : "";
        },
    } as typeof import("path").posix;
};

export const showFileInFolder = (filePath: string) => {
    let ipcRenderer = getElectronIpcRenderer();

    if (ipcRenderer && !isBrowser()) {
        ipcRenderer.send(Constants.SIYUAN_OPEN_FOLDER, filePath);
    }
};

export const getAssetName = (assetPath: string) => {
    return pathPosix().basename(assetPath, pathPosix().extname(assetPath)).replace(/-\d{14}-\w{7}/, "");
};

export const isLocalPath = (link: string) => {
    if (!link) {
        return false;
    }

    link = link.trim();
    if (1 > link.length) {
        return false;
    }

    link = link.toLowerCase();
    if (link.startsWith("assets/") || link.startsWith("file://") || link.startsWith("\\\\") /* Windows 网络共享路径 */) {
        return true;
    }

    if (isWindows()) {
        const colonIdx = link.indexOf(":");
        return 1 === colonIdx; // 冒号前面只有一个字符认为是 Windows 盘符而不是网络协议
    }
    return link.startsWith("/");
};
