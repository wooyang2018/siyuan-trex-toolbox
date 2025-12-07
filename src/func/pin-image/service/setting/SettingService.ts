import { EnvConfig } from "../../libs/EnvConfig";
import Instance from "../../utils/Instance";
import { setReplacer } from "../../utils/json-util";
import { mergeObjects } from "../../utils/object-util";

const SettingFileName = 'image-pin-preview-setting.json';

export class SettingConfig {
    isOpen: Boolean;
    showOptionButton: Boolean;
}

export class SettingService {
    public static get ins(): SettingService {
        return Instance.get(SettingService);
    }

    private _settingConfig: SettingConfig;

    public get SettingConfig() {
        if (this._settingConfig) {
            return this._settingConfig;
        }
        this.init()
        return getDefaultSettingConfig()
    }

    public async init() {
        let persistentConfig = await getPersistentConfig();
        this._settingConfig = mergeObjects(persistentConfig, getDefaultSettingConfig());
    }

    public async updateSettingCofnigValue(key: string, newValue: any) {
        let oldValue = this._settingConfig[key];
        if (oldValue == newValue) {
            return;
        }

        this._settingConfig[key] = newValue;
        let paramJson = JSON.stringify(this._settingConfig, setReplacer);
        let plugin = EnvConfig.ins.plugin;
        if (!plugin) {
            return;
        }
        console.log(`图片悬浮预览插件 更新设置配置文件: ${paramJson}`);
        plugin.saveData(SettingFileName, paramJson);
    }

    public async updateSettingCofnig(settingConfigParam: SettingConfig) {
        let plugin = EnvConfig.ins.plugin;
        if (!plugin) {
            return;
        }

        let curSettingConfigJson = "";
        if (this._settingConfig) {
            curSettingConfigJson = JSON.stringify(this._settingConfig, setReplacer);
        }
        let paramJson = JSON.stringify(settingConfigParam, setReplacer);
        if (paramJson == curSettingConfigJson) {
            return;
        }
        console.log(`图片悬浮预览插件 更新设置配置文件: ${paramJson}`);
        this._settingConfig = { ...settingConfigParam };
        plugin.saveData(SettingFileName, paramJson);
    }
}

async function getPersistentConfig(): Promise<SettingConfig> {
    let plugin = EnvConfig.ins.plugin;
    let settingConfig = null;
    if (!plugin) {
        return settingConfig;
    }
    let loaded = await plugin.loadData(SettingFileName);
    if (loaded == null || loaded == undefined || loaded == '') {
    } else {
        if (typeof loaded === 'string') {
            loaded = JSON.parse(loaded);
        }
        try {
            settingConfig = new SettingConfig();
            for (let key in loaded) {
                setKeyValue(settingConfig, key, loaded[key]);
            }
        } catch (error_msg) {
            console.log(`Setting load error: ${error_msg}`);
        }
    }
    return settingConfig;
}

function setKeyValue(settingConfig, key: any, value: any) {
    if (!(key in settingConfig)) {
        console.error(`"${key}" is not a setting`);
        return;
    }
    settingConfig[key] = value;
}

function getDefaultSettingConfig() {
    let defaultConfig = new SettingConfig();

    /* 查询相关 */
    defaultConfig.isOpen = true;

    defaultConfig.showOptionButton = true;
    return defaultConfig;
}


