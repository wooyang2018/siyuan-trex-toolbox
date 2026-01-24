/*
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-06-05 21:05:45
 * @FilePath     : /src/func/gpt/chat/SessionToolsManager.tsx
 * @Description  : 会话级别的工具管理器组件
 */


import { Component, For, Show, createSignal, onMount } from 'solid-js';
import { ToolExecutor } from '../tools';
import '../setting/ToolsManagerSetting.scss';

export const SessionToolsManager: Component<{
    toolExecutor: ToolExecutor;
    onToggleGroup?: (groupName: string, enabled: boolean) => void;
    onToggleTool?: (toolName: string, enabled: boolean) => void;
    onClose?: () => void;
}> = (props) => {
    const [collapsedGroups, setCollapsedGroups] = createSignal<Record<string, boolean>>({});

    const toggleGroupExpand = (groupName: string): void => {
        setCollapsedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    onMount(() => {
        const initialCollapsedState: Record<string, boolean> = {};
        for (const groupName of Object.keys(props.toolExecutor.groupRegistry)) {
            initialCollapsedState[groupName] = true;
        }
        setCollapsedGroups(initialCollapsedState);
    });

    const toggleGroupEnabled = (groupName: string): void => {
        const currentEnabled = props.toolExecutor.isGroupEnabled(groupName);
        props.toolExecutor.toggleGroupEnabled(groupName, !currentEnabled);

        if (props.onToggleGroup) {
            props.onToggleGroup(groupName, !currentEnabled);
        }
    };

    const toggleToolEnabled = (toolName: string): void => {
        const currentEnabled = props.toolExecutor.isToolEnabled(toolName);
        props.toolExecutor.setToolEnabled(toolName, !currentEnabled);

        if (props.onToggleTool) {
            props.onToggleTool(toolName, !currentEnabled);
        }
    };

    return (
        <div class="tools-manager-setting" style={{ flex: 1 }}>
            <div class="b3-card" style={{ margin: '0 0 8px 0', padding: '8px 16px', display: 'block' }}>
                请按需开启工具，每个开启的工具会增加 token 消耗。
                部分工具存在风险/隐私问题，需用户审核后才能执行。
                无编程经验者慎重使用脚本工具组(特别是 shell 工具)。
            </div>
            <div class="tools-manager-groups">
                <For each={Object.entries(props.toolExecutor.groupRegistry)}>
                    {([groupName, group]) => (
                        <div class="tools-manager-group">
                            <div class="tools-manager-group-header" onClick={() => toggleGroupExpand(groupName)}>
                                <div class="tools-manager-group-toggle">
                                    <input
                                        type="checkbox"
                                        checked={props.toolExecutor.isGroupEnabled(groupName)}
                                        onChange={() => toggleGroupEnabled(groupName)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <span class="tools-manager-group-name">{group.name}</span>
                                </div>
                                <div
                                    class="tools-manager-group-expand"
                                >
                                    <svg class={`icon-arrow ${collapsedGroups()[groupName] ? 'collapsed' : ''}`}><use href="#iconDown"></use></svg>
                                </div>
                            </div>

                            <Show when={collapsedGroups()[groupName] !== true}>
                                <div class="tools-manager-tools">
                                    <For each={group.tools}>
                                        {tool => (
                                            <div class="tools-manager-tool">
                                                <input
                                                    type="checkbox"
                                                    checked={props.toolExecutor.isToolEnabled(tool.definition.function.name)}
                                                    onChange={() => toggleToolEnabled(tool.definition.function.name)}
                                                    disabled={!props.toolExecutor.isGroupEnabled(groupName)}
                                                />
                                                <span class="tools-manager-tool-name">
                                                    {tool.definition.function.name}
                                                </span>
                                                <span class="tools-manager-tool-description">
                                                    {tool.definition.function.description}
                                                </span>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
};
