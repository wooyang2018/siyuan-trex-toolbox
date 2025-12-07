import { getElectronIpcRenderer, isBrowser } from "../../utils/electron-util";
import * as path from "path";
import { Constants } from "siyuan";
import { isWindows } from "../compatibility";

export const pathPosix = () => {
    if (path.posix) {
        return path.posix;
    }
    const nodePath = window.require('path') as typeof import('path');
    return nodePath;
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