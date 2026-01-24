/**
 * WebView storage configuration
 * 
 * @description WebView 应用配置的存储和加载
 * @author frostime
 */
import { IWebApp } from "./utils/types";
import { CustomApps as DefaultApps } from "./app";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";

export const StorageFileName = 'custom-webview-app.js';

/**
 * 加载存储的 WebView 应用配置
 */
export const loadStorage = async (): Promise<IWebApp[]> => {
    const plugin = thisPlugin();
    try {
        const data = await plugin.loadBlob(StorageFileName);
        if (!data) {
            throw new Error("Storage file not found");
        }

        const blob = new Blob([data], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);

        try {
            const module = await import(/* webpackIgnore: true */ url);
            URL.revokeObjectURL(url);
            const customApps = module.default as IWebApp[];
            return mergeWithDefault(customApps);
        } catch (importError) {
            URL.revokeObjectURL(url);
            throw importError;
        }
    } catch (e) {
        await createDefaultStorage(plugin);
        return [...DefaultApps];
    }
}

/**
 * 合并自定义应用和默认应用
 */
const mergeWithDefault = (customApps: IWebApp[]): IWebApp[] => {
    const mergedApps = [...DefaultApps];

    customApps.forEach(newApp => {
        const existingIndex = mergedApps.findIndex(app => app.name === newApp.name);
        if (existingIndex !== -1) {
            mergedApps[existingIndex] = { ...mergedApps[existingIndex], ...newApp };
        } else {
            mergedApps.push(newApp);
        }
    });

    return mergedApps;
}

/**
 * 创建默认存储文件
 */
const createDefaultStorage = async (plugin: ReturnType<typeof thisPlugin>) => {
    const content = `/*
 * Custom WebView Apps Configuration
 * This file is auto-generated. You can modify it to customize your web apps.
 */

const customApps = ${JSON.stringify(DefaultApps, null, 4)};

export default customApps;
`;
    await plugin.saveBlob(StorageFileName, content);
}
