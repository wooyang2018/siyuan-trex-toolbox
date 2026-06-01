/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/types/index.d.ts
 * @LastEditTime : 2024-11-30 19:35:22
 * @Description  : 
 */

export type ScalarType = string | number | boolean;

/**
 * 设置项核心接口
 */
export interface ISettingItemCore {
    type: 'checkbox' | 'textinput' | 'textarea' | 'number' | 'button' | 'select' | 'slider' | 'hint';
    title?: string;
    description?: string;
    placeholder?: string;
    direction?: 'row' | 'column';
    value?: any;
    options?: { key: string; value: any; text: string }[];
    slider?: { min: number; max: number; step: number };
    button?: { text: string; callback: () => void };
    number?: { min?: number; max?: number; step?: number };
}

/**
 * 设置项接口
 */
export interface ISettingItem extends ISettingItemCore {
    key: string;
}

export interface IDockyBlock {
    name: string;
    position: 'RightTop' | 'RightBottom' | 'LeftTop' | 'LeftBottom';
    id: string;
    icon?: string;
    hotkey?: string;
}

export type ThemeMode = "light" | "dark";
export interface ITheme {
    name: string;
    modes: ThemeMode[];
    repoHash: string;
    repoURL: string;
}

export type TKeyText = {
    key: string;
    text: string;
}

export interface KV {
    key: string;
    value: any;
}

export interface ChangeEvent {
    group: string;
    key: string;
    value: any;
}

export type DocumentId = string;
export type BlockId = string;
export type NotebookId = string;
export type PreviousID = BlockId;
export type ParentID = BlockId | DocumentId;

export type Notebook = {
    id: NotebookId;
    name: string;
    icon: string;
    sort: number;
    closed: boolean;
}

export type NotebookConf = {
    name: string;
    closed: boolean;
    refCreateSavePath: string;
    createDocNameTemplate: string;
    dailyNoteSavePath: string;
    dailyNoteTemplatePath: string;
}

/**
 * 块类型定义
 *
 * 各类型说明：
 * - 'd' (Document): 文档块 - 代表一篇完整的文档
 * - 'h' (Heading): 标题块 - 用于组织文档结构的多级标题
 * - 'p' (Paragraph): 段落块 - 基本的文本内容块
 * - 'l' (List): 列表块 - 列表项的容器
 * - 'i' (ListItem): 列表项块 - 列表中的单个项目
 * - 'c' (Code): 代码块 - 支持语法高亮的代码展示
 * - 't' (Table): 表格块 - 表格数据展示和编辑
 * - 'm' (Math): 数学公式块 - LaTeX数学公式渲染
 * - 'b' (Blockquote): 引用块 - 突出显示引用内容
 * - 's' (SuperBlock): 超级块 - 包含多个块并支持布局控制
 * - 'av' (Attribute View): 属性视图块 - 数据库式视图功能
 * - 'tb' (Table Block): 数据库块 - 功能强大的数据库
 * - 'widget' (Widget): 小工具块 - 嵌入各种小工具和组件
 * - 'iframe' (IFrame): 内嵌框架块 - 嵌入外部网页内容
 * - 'audio' (Audio): 音频块 - 嵌入和播放音频文件
 * - 'video' (Video): 视频块 - 嵌入和播放视频文件
 * - 'query_embed' (Query Embed): 查询嵌入块 - 嵌入查询结果
 * - 'html' (HTML): HTML块 - 直接编写和渲染HTML代码
 * - 'f' (Footnote): 脚注块 - 文档脚注内容
 *
 * 推荐使用 block-type-enhance.ts 中的增强工具函数和常量
 * @see ./block-type-enhance.ts
 */
export type BlockType =
    | 'c'
    | 'd'
    | 's'
    | 'h'
    | 't'
    | 'i'
    | 'p'
    | 'f'
    | 'l'
    | 'b'
    | 'm'
    | 'av'
    | 'tb'
    | 'widget'
    | 'iframe'
    | 'audio'
    | 'video'
    | 'query_embed'
    | 'html';

/**
 * 块子类型定义
 *
 * 各子类型说明：
 * - 文档相关: "d1", "d2" - 文档子类型
 * - 超级块相关: "s1", "s2", "s3" - 超级块子类型
 * - 表格相关: "t1", "t2", "table" - 表格子类型
 * - 标题相关: "h1"-"h6" - 1-6级标题
 * - 任务相关: "task" - 任务列表项
 * - 切换相关: "toggle" - 可切换内容块
 * - 公式相关: "latex" - LaTeX公式
 * - 引用相关: "quote" - 引用内容
 * - HTML相关: "html" - HTML内容
 * - 代码相关: "code" - 代码内容
 * - 脚注相关: "footnote" - 脚注
 * - 引用相关: "cite" - 文献引用
 * - 集合相关: "collection" - 内容集合
 * - 书签相关: "bookmark" - 书签
 * - 附件相关: "attachment" - 附件
 * - 评论相关: "comment" - 评论
 * - 思维导图: "mindmap" - 思维导图
 * - 电子表格: "spreadsheet" - 电子表格
 * - 日历相关: "calendar" - 日历
 * - 图片相关: "image" - 图片
 * - 音频相关: "audio" - 音频
 * - 视频相关: "video" - 视频
 * - 其他类型: "other" - 其他未分类子类型
 */
export type BlockSubType = "d1" | "d2" | "s1" | "s2" | "s3" | "t1" | "t2" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "table" | "task" | "toggle" | "latex" | "quote" | "html" | "code" | "footnote" | "cite" | "collection" | "bookmark" | "attachment" | "comment" | "mindmap" | "spreadsheet" | "calendar" | "image" | "audio" | "video" | "other";

export type Block = {
    id: BlockId;
    parent_id?: BlockId;
    root_id: DocumentId;
    hash: string;
    box: string;
    path: string;
    hpath: string;
    name: string;
    alias: string;
    memo: string;
    tag: string;
    content: string;
    fcontent?: string;
    markdown: string;
    length: number;
    type: BlockType;
    subtype: BlockSubType;

    ial?: string;
    sort: number;
    created: string;
    updated: string;
}

export type doOperation = {
    action: string;
    data: string;
    id: BlockId;
    parentID: BlockId | DocumentId;
    previousID: BlockId;
    retData: null;
}

export declare interface Window {
    siyuan: {
        config: any;
        notebooks: any;
        menus: any;
        dialogs: any;
        blockPanels: any;
        storage: any;
        user: any;
        ws: any;
        languages: any;
        emojis: any;
    };
    Lute: any;
    fmisc: FMiscPlugin;
    mermaid: any;
    echarts: any;
    hljs: any;
    katex: any;
}

export interface IPluginProtyleSlash {
    filter: string[],
    html: string,
    id: string,
    callback(protyle: Protyle): void,
};

export interface ISiyuanEventPaste {
    protyle: IProtyle,
    resolve: <T>(value: T | PromiseLike<T>) => void,
    textHTML: string,
    textPlain: string,
    siyuanHTML: string,
    files: FileList | DataTransferItemList;
}

// 导出 API 响应类型
export * from './api';

// 导出 Claude Note 特定类型
export * from './claude-note';
