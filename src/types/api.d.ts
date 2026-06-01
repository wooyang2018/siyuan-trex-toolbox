/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-19 14:07:28
 * @FilePath     : /src/types/api.d.ts
 * @LastEditTime : 2024-04-18 18:57:04
 * @Description  : 
 */
export interface IResGetNotebookConf {
    box: string;
    conf: NotebookConf;
    name: string;
}

export interface IBlockDOM {
    id: BlockId;
    dom: string;
}

export interface IBacklink2 {
    backlinks: {
        id: BlockId;
        count: number;
        box: NotebookId;
    }[];
    backmentions: {
        id: BlockId;
        count: number;
        box: NotebookId;
    }[];
}

export interface IReslsNotebooks {
    notebooks: Notebook[];
}

export interface IResUpload {
    errFiles: string[];
    succMap: { [key: string]: string };
}

export interface IResdoOperations {
    doOperations: doOperation[];
    undoOperations: doOperation[] | null;
}

export interface IResGetBlockKramdown {
    id: BlockId;
    kramdown: string;
}

export interface IResGetChildBlock {
    id: BlockId;
    type: BlockType;
    subtype?: BlockSubType;
}

export interface IResGetTemplates {
    content: string;
    path: string;
}

export interface IResReadDir {
    isDir: boolean;
    isSymlink: boolean;
    name: string;
}

export interface IResExportMdContent {
    hPath: string;
    content: string;
}

export interface IResBootProgress {
    progress: number;
    details: string;
}

export interface IResForwardProxy {
    body: string;
    contentType: string;
    elapsed: number;
    headers: { [key: string]: string };
    status: number;
    url: string;
}

export interface IResExportResources {
    path: string;
}


export interface IDocTreeNode {
    id: BlockId;
    children?: IDocTreeNode[];
}
export interface IResListDocTree {
    tree: IDocTreeNode[];
}
