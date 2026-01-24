/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-05-11 16:59:06
 * @FilePath     : /src/func/gpt/tools/index.ts
 * @LastEditTime : 2025-06-04 17:21:11
 * @Description  :
 */
export * from './types';
export { ToolExecutor } from './executor';

import { ToolExecutor } from './executor';
import { basicTool } from './basic';
import { toolGroupWeb } from './web';
import { fileSystemTools, fileEditorTools } from './file-system';
import { scriptTools } from './script-tools';
import { ApprovalUIAdapter } from './types';
import { DefaultUIAdapter } from './approval-ui';
import { toolsManager } from '../setting/store';
import { siyuanTool } from './siyuan';
import { createCustomScriptToolGroupsFromCache } from './custom-program-tools';
import { registerToolCallScriptGroup } from './toolcall-script';


const IS_IN_APP = window?.require?.('electron') !== undefined;

export const toolExecutorFactory = (options: {
    approvalAdapter?: ApprovalUIAdapter;
}): ToolExecutor => {
    const toolExecutor = new ToolExecutor();

    toolExecutor.registerToolGroup(basicTool);
    toolExecutor.registerToolGroup(toolGroupWeb);
    toolExecutor.registerToolGroup(fileSystemTools);
    toolExecutor.registerToolGroup(fileEditorTools);
    IS_IN_APP && toolExecutor.registerToolGroup(scriptTools);
    toolExecutor.registerToolGroup(siyuanTool);

    if (IS_IN_APP) {
        const groups = createCustomScriptToolGroupsFromCache();
        groups.forEach(group => {
            toolExecutor.registerToolGroup(group);
            if (toolsManager().groupDefaults[group.name] !== undefined) {
                toolExecutor.toggleGroupEnabled(group.name, toolsManager().groupDefaults[group.name]);
            }
        });
    }


    registerToolCallScriptGroup(toolExecutor);

    const approvalAdapter = options.approvalAdapter || new DefaultUIAdapter();

    if (!toolExecutor.hasExecutionApprovalCallback()) {
        toolExecutor.setExecutionApprovalCallback(async (toolName, toolDescription, args) => {
            const tool = toolExecutor.getTool(toolName);
            if (!tool) {
                return { approved: false, rejectReason: `Tool ${toolName} not found` };
            }

            return await approvalAdapter.showToolExecutionApproval(
                toolName,
                toolDescription,
                args
            );
        });
    }

    if (!toolExecutor.hasResultApprovalCallback()) {
        toolExecutor.setResultApprovalCallback(async (toolName, args, result) => {
            return await approvalAdapter.showToolResultApproval(
                toolName,
                args,
                result
            );
        });
    }

    const groupDefaults = toolsManager().groupDefaults;
    Object.entries(groupDefaults).forEach(([groupName, enabled]) => {
        if (toolExecutor.groupRegistry[groupName]) {
            toolExecutor.toggleGroupEnabled(groupName, enabled);
        }
    });

    const toolDefaults = toolsManager().toolDefaults;
    Object.entries(toolDefaults).forEach(([toolName, enabled]) => {
        toolExecutor.setToolEnabled(toolName, enabled);
    });

    return toolExecutor;
};
