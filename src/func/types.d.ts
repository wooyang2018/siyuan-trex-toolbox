/**
 * 配置项接口（扩展自 ISettingItem）
 */
interface IConfigItem<T> extends Omit<ISettingItem, 'value'> {
    get: () => T;
    set: (value: T) => void;
}

/**
 * 设置页类别（一级菜单）
 *
 * @description 纯开关类模块统一放进 toggles，需要单独展开的复杂配置各占一个一级菜单。
 *              不要为了"分类好看"再拆细类，否则又会出现只有一项的空分类。
 */
type SettingCategory = 'toggles' | 'pomodoro' | 'ai' | 'websocket';

/**
 * 模块统一设置声明
 * 合并了原来的 declareToggleEnabled / declareModuleConfig / declareSettingPanel
 */
interface IModuleSetting {
    /** 模块显示标题（无 emoji 前缀） */
    title: string;
    /** 模块功能描述 */
    description: string;
    /** 启用切换配置（存在则表示该模块可在设置中开关） */
    toggle?: {
        defaultEnabled?: boolean;
    };
    /** 简单配置项列表（原 declareModuleConfig.items） */
    configs?: IConfigItem<any>[];
    /** 配置加载函数（原 declareModuleConfig.load） */
    configLoad?: (itemValues?: Record<string, any>) => void;
    /** 配置序列化函数（原 declareModuleConfig.dump） */
    configDump?: () => Record<string, any>;
    /** 自定义面板（原 declareSettingPanel.element / declareModuleConfig.customPanel） */
    customPanel?: () => JSX.Element;
}

/**
 * 功能开关页内的视觉分组
 *
 * @description 只影响「功能开关」页的标题分隔，不影响侧边栏一级菜单。
 *              纯视觉分隔：不折叠、不需要点击。
 */
type ToggleGroup = 'writing' | 'documents' | 'learning' | 'window';

/**
 * 功能模块接口
 */
interface IFuncModule {
    name: string;
    enabled: boolean;
    allowToUse?: () => boolean;
    /** 设置分组类别 */
    category: SettingCategory;
    /** 仅 category 为 toggles 时生效：该开关在「功能开关」页里的分组 */
    toggleGroup?: ToggleGroup;
    /** 统一设置声明 */
    declareSetting?: IModuleSetting;

    load: (plugin: FMiscPlugin) => void;
    unload: (plugin?: FMiscPlugin) => void;
}

