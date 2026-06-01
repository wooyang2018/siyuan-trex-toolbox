/**
 * Claude Note 模块 - 插件类型定义
 * @description 定义与主插件交互所需的类型
 */

// 思源笔记插件基础类型
type Plugin = any;
type IMenu = any;
type ICommand = any;

// 主插件类型定义（简化版本）
export interface FMiscPlugin extends Plugin {
    isMobile: boolean;
    data: {
        configs: {
            'Enable': { [key: string]: boolean };
            'Docky': {
                DockyEnableZoom: boolean;
                DockyZoomFactor: number;
                DockyProtyle: string;
            };
            Misc: {
                zoteroPassword: string;
                zoteroDir: string;
                sypaiToken: string;
                codeEditor: string;
            };
        };
    };

    // 插件方法
    addTopBar(options: any): HTMLElement;
    addDock(options: any): void;
    addCommand(options: any): void;
    addCommandV2(options: ICommand): void;
    delCommand(id: string): void;
    showMessage(message: string, type?: 'info' | 'success' | 'warning' | 'error', timeout?: number): void;
    openSetting(): void;
    loadData(name: string): Promise<any>;
    saveData(name: string, data: any): Promise<void>;

    // 自定义方法
    getConfig(group: string, key: string): any;
    registerMenuTopMenu(key: string, menu: IMenu[]): void;
    unRegisterMenuTopMenu(key: string): void;
}

// 设置项类型
export interface ISettingItem {
    key: string;
    type: 'text' | 'number' | 'textarea' | 'checkbox' | 'select' | 'slider' | 'button';
    title: string;
    description?: string;
    default?: any;
    options?: Array<{ label: string; value: any }>;
}

// 功能模块接口
export interface IFuncModule {
    name: string;
    enabled: boolean;
    allowToUse?: () => boolean;
    load: (plugin: FMiscPlugin) => void;
    unload: (plugin?: FMiscPlugin) => void;

    declareToggleEnabled?: {
        title: string;
        description: string;
        defaultEnabled?: boolean;
    };

    declareSettingPanel?: {
        key: string;
        title: string;
        element: () => any;
    }[];
}