import { Constants, fetchPost } from "siyuan";
import { getAssetName, pathPosix } from "../util/pathName";
import { isBrowser, isMobileClient as isMobile } from "../../utils/electron-util";
import { exportByMobile, isInAndroid } from "../compatibility";


export const exportAsset = async (src: string) => {
    let electron = null;
    if (window && window.require) {
        electron = window.require('electron');
    }

    if (isBrowser() || isMobile() || !src.startsWith("assets/")) {
        exportByMobile(src);
    } else if (electron && electron.ipcRenderer) {
        const result = await electron.ipcRenderer.invoke(Constants.SIYUAN_GET, {
            cmd: "showSaveDialog",
            defaultPath: getAssetName(src) + pathPosix().extname(src),
            properties: ["showOverwriteConfirmation"],
        });
        if (!result.canceled) {
            fetchPost("/api/file/copyFile", { src, dest: result.filePath });
        }
    }
};

export const copyPNGByLink = (link: string) => {
    if (isInAndroid()) {
        window.JSAndroid.writeImageClipboard(link);
        return;
    } else {
        const canvas = document.createElement("canvas");
        const tempElement = document.createElement("img");
        tempElement.onload = (e: Event & { target: HTMLImageElement }) => {
            canvas.width = e.target.width;
            canvas.height = e.target.height;
            canvas.getContext("2d").drawImage(e.target, 0, 0, e.target.width, e.target.height);
            canvas.toBlob((blob) => {
                navigator.clipboard.write([
                    new ClipboardItem({
                        // @ts-ignore
                        ["image/png"]: blob
                    })
                ]);
            }, "image/png", 1);
        };
        console.log("copyPNGByLink")
        tempElement.src = link;
    }
};

