/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 01:45:14
 * @FilePath     : /src/func/gpt/tools/types.ts
 * @LastEditTime : 2025-06-05 12:14:11
 * @Description  : 工具类型定义
 */
export enum ToolPermissionLevel {
    PUBLIC = 'public',
    MODERATE = 'moderate',
    SENSITIVE = 'sensitive'
}

export enum ToolExecuteStatus {
    SUCCESS = 'success',
    ERROR = 'error',
    EXECUTION_REJECTED = 'execution_rejected',
    RESULT_REJECTED = 'result_rejected',
    NOT_FOUND = 'not_found',
    REJECTED = 'execution_rejected'
}

export interface ToolExecuteResult {
    status: ToolExecuteStatus;
    data?: ScalarType | Record<string, any> | Array<ScalarType | Record<string, any>>;
    error?: string;
    rejectReason?: string;
}

export type UserApprovalCallback = (
    toolName: string,
    toolDescription: string,
    args: Record<string, any>
) => Promise<{
    approved: boolean;
    rejectReason?: string;
}>;

export type ResultApprovalCallback = (
    toolName: string,
    args: Record<string, any>,
    result: ToolExecuteResult
) => Promise<{
    approved: boolean;
    rejectReason?: string;
}>;

export type ToolDefinitionWithPermission = IToolDefinition & {
    permissionLevel?: ToolPermissionLevel;
    requireExecutionApproval?: boolean;
    requireResultApproval?: boolean;
};

export type ToolExecuteFunction = (
    args: Record<string, any>
) => Promise<ToolExecuteResult>;

export interface Tool {
    definition: ToolDefinitionWithPermission;
    execute: ToolExecuteFunction;
    compressArgs?: (args: Record<string, any>) => string;
    compressResult?: (result: ToolExecuteResult) => string;
}

export interface ToolGroup {
    name: string;
    tools: Tool[];
    rulePrompt?: string;
    dynamicPromptFunction?: () => string;
}

export interface IExternalToolUnit {
    type: 'script';
    scriptType?: 'python';
    scriptLocation?: 'machine' | 'siyuan';
    scriptPath?: string;
}

export enum DisplayMode {
    INLINE = 'inline',
    DIALOG = 'dialog'
}

export interface ApprovalUIAdapter {
    showToolExecutionApproval(
        toolName: string,
        toolDescription: string,
        args: Record<string, any>
    ): Promise<{
        approved: boolean;
        persistDecision?: boolean;
        rejectReason?: string;
    }>;

    showToolResultApproval(
        toolName: string,
        args: Record<string, any>,
        result: ToolExecuteResult
    ): Promise<{
        approved: boolean;
        rejectReason?: string;
    }>;
}
