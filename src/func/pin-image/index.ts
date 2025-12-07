import { EnvConfig } from './libs/EnvConfig';
import { SettingService } from './service/setting/SettingService';
import { ImageService } from "./service/image/ImageService";
import type FMiscPlugin from "@/index";

export let name = "PinImagePreview";
export let enabled = false;
let pluginInstance: PluginSample | null = null;

export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    pluginInstance = new PluginSample(plugin_);
    pluginInstance.onload();
}

export const unload = (plugin_: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    if (pluginInstance) {
        pluginInstance.onunload();
        pluginInstance = null;
    }
}

export default class PluginSample {
    private siyuanPlugin: FMiscPlugin;

    constructor(siyuanPlugin: FMiscPlugin) {
        this.siyuanPlugin = siyuanPlugin;
    }

    async onunload() {
    }

    async onload() {
        EnvConfig.ins.init(this.siyuanPlugin);
        await SettingService.ins.init();
        ImageService.ins.init();
    }
}
