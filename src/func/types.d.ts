/**
 * 配置项接口（扩展自 ISettingItem）
 */
interface IConfigItem<T> extends Omit<ISettingItem, 'value'> {
    get: () => T;
    set: (value: T) => void;
}

/**
 * 功能模块接口
 */
interface IFuncModule {
    name: string;
    enabled: boolean;
    allowToUse?: () => boolean;

    load: (plugin: FMiscPlugin) => void;
    unload: (plugin?: FMiscPlugin) => void;
    
    /** 启用切换配置 */
    declareToggleEnabled?: {
        title: string;
        description: string;
        defaultEnabled?: boolean;
    };
    
    /** 自定义设置面板 */
    declareSettingPanel?: {
        key: string;
        title: string;
        element: () => JSX.Element;
    }[];
    
    /** 简单模块配置 */
    declareModuleConfig?: {
        key: string;
        title?: string;
        items: IConfigItem<any>[];
        load: (itemValues?: Record<string, any>) => void;
        dump?: () => Record<string, any>;
        customPanel?: () => JSX.Element;
    };
}

