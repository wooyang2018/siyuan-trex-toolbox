import { getFrontend } from "siyuan";

export function getElectron() {
    if (window && window.require) {
        return window.require('electron');
    }
    return null;
}

export function getElectronIpcRenderer() {
    let electron = getElectron();
    if (electron) {
        return electron.ipcRenderer;
    }
    return null;
}

export function getElectronShell() {
    let electron = getElectron();
    if (electron) {
        return electron.shell;
    }
    return null;
}

export function isBrowser(): boolean {
    let frontend = getFrontend();
    if (frontend == "browser-desktop" || frontend == "browser-mobile") {
        return true;
    }
    return false;
}

export function isMobileClient(): boolean {
    let frontend = getFrontend();
    if (frontend == "mobile") {
        return true;
    }
    return false;
}