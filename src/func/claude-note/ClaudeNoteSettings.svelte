<script lang="ts">
    import { showMessage } from "siyuan";
    import {
        mergeSettings,
        detectDefaultSettings,
        readProjectInstructions,
        writeProjectInstructions,
        DEFAULT_PROMPT_TEMPLATES,
        type ClaudeNoteSettings,
        type PromptTemplate,
    } from "./settings";

    export let settings: ClaudeNoteSettings;
    export let saveSettings: (settings: ClaudeNoteSettings) => Promise<void>;
    export let i18n: any = {};

    let localSettings = mergeSettings(settings);
    let previousSettings = settings;
    let tab: "general" | "claude" | "templates" = "general";
    const detected = detectDefaultSettings();

    // Template editing state
    let editingTemplateId = "";
    let editingTemplate: PromptTemplate = { id: "", title: "", content: "" };

    $: if (settings !== previousSettings) {
        previousSettings = settings;
        localSettings = mergeSettings(settings);
    }

    function syncInstructionsFromWorkingDir() {
        const existing = readProjectInstructions(localSettings.workingDir);
        localSettings.projectInstructions = existing ?? "";
        localSettings = localSettings;
    }

    async function save() {
        const next = mergeSettings(localSettings);
        writeProjectInstructions(next.workingDir, next.projectInstructions || "");
        await saveSettings({ ...next, appendSystemPrompt: "" });
        showMessage(i18n.settingsSaved || "Claude Note 设置已保存");
    }

    // ——— Template CRUD ———

    function generateTemplateId(): string {
        return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function startEditTemplate(tpl: PromptTemplate) {
        editingTemplateId = tpl.id;
        editingTemplate = { ...tpl };
    }

    function startAddTemplate() {
        const newTpl: PromptTemplate = { id: generateTemplateId(), title: "", content: "" };
        localSettings.promptTemplates = [...localSettings.promptTemplates, newTpl];
        localSettings = localSettings;
        startEditTemplate(newTpl);
    }

    function saveEditTemplate() {
        if (!editingTemplate.title.trim()) {
            showMessage("模板名称不能为空");
            return;
        }
        localSettings.promptTemplates = localSettings.promptTemplates.map(t =>
            t.id === editingTemplateId ? { ...editingTemplate } : t
        );
        localSettings = localSettings;
        editingTemplateId = "";
    }

    function cancelEditTemplate() {
        // If the template was just added (no title yet), remove it
        const tpl = localSettings.promptTemplates.find(t => t.id === editingTemplateId);
        if (tpl && !tpl.title.trim()) {
            localSettings.promptTemplates = localSettings.promptTemplates.filter(t => t.id !== editingTemplateId);
            localSettings = localSettings;
        }
        editingTemplateId = "";
    }

    function deleteTemplate(id: string) {
        localSettings.promptTemplates = localSettings.promptTemplates.filter(t => t.id !== id);
        localSettings = localSettings;
        if (editingTemplateId === id) editingTemplateId = "";
    }

    function resetToDefaults() {
        localSettings.promptTemplates = DEFAULT_PROMPT_TEMPLATES.map(t => ({ ...t }));
        localSettings = localSettings;
        editingTemplateId = "";
    }
</script>

<div class="cn-settings-dialog">
    <div class="cn-settings-tabs">
        <button class:active={tab === "general"} on:click={() => tab = "general"}>{i18n.tabGeneral || "通用"}</button>
        <button class:active={tab === "claude"} on:click={() => tab = "claude"}>{i18n.tabClaude || "Claude Code"}</button>
        <button class:active={tab === "templates"} on:click={() => tab = "templates"}>{"模板"}</button>
    </div>

    {#if tab === "general"}
        <div class="cn-setting-section">
            <label class="cn-switch"><input type="checkbox" bind:checked={localSettings.autoAttachCurrentDoc} /><span>{i18n.autoAttachDoc || "默认附加当前打开文档"}</span></label>
            <label class="cn-switch"><input type="checkbox" bind:checked={localSettings.requireModEnterToSend} /><span>{i18n.requireModEnter || "必须使用 ⌘/Ctrl+Enter 发送"}</span></label>
            <label class="cn-switch"><input type="checkbox" bind:checked={localSettings.enableAutoScroll} /><span>{i18n.autoScroll || "流式输出时自动滚动到底部"}</span></label>
            <label class="cn-switch"><input type="checkbox" bind:checked={localSettings.showThinking} /><span>{i18n.showThinking || "显示思考过程"}</span><small class="cn-setting-hint">仅当所选模型实际输出 thinking 内容块时生效（部分代理后端如 deepseek 不会输出）</small></label>
            <label class="cn-switch"><input type="checkbox" bind:checked={localSettings.showToolCalls} /><span>{i18n.showToolCalls || "显示工具调用"}</span></label>
            <div class="cn-two-col">
                <label><span>{i18n.historyLimit || "历史会话显示条数"}</span><input class="b3-text-field fn__block" type="number" min="1" max="200" bind:value={localSettings.historyLimit} /></label>
                <label><span>{i18n.historyDays || "历史会话最近天数"}</span><input class="b3-text-field fn__block" type="number" min="0" max="3650" bind:value={localSettings.historyDays} placeholder={i18n.historyDaysPlaceholder || "0 表示不限"} /></label>
            </div>
            <div class="cn-two-col">
                <label><span>{i18n.siyuanToken || "思源 API 密钥"}</span><input class="b3-text-field fn__block" bind:value={localSettings.siyuanApiToken} placeholder={i18n.autoDetectPlaceholder || "留空则自动感应获取"} /></label>
                <label><span>{i18n.siyuanPort || "思源 API 端口"}</span><input class="b3-text-field fn__block" bind:value={localSettings.siyuanApiPort} placeholder="6806" /></label>
            </div>
        </div>
    {:else if tab === "claude"}
        <div class="cn-setting-section">
            <label><span>{i18n.cliPath || "Claude CLI 路径"}</span><input class="b3-text-field fn__block" bind:value={localSettings.cliPath} placeholder={detected.cliPath || (i18n.cliPathPlaceholder || "留空默认为系统 PATH 中的 claude")} /></label>
            <label><span>{i18n.workingDir || "工作目录"}</span><input class="b3-text-field fn__block" bind:value={localSettings.workingDir} on:change={syncInstructionsFromWorkingDir} placeholder={detected.workingDir || (i18n.workingDirPlaceholder || "留空默认为思源 data 目录")} /></label>
            <label><span>{i18n.claudeHomeDir || "Claude 会话目录根"}</span><input class="b3-text-field fn__block" bind:value={localSettings.claudeHomeDir} placeholder={detected.claudeHomeDir || (i18n.claudeHomeDirPlaceholder || "留空将根据 CLI 路径自动推断（claude → ~/.claude，claude-internal → ~/.claude-internal）")} /></label>
            <label><span>{i18n.projectInstructions || "项目指令（对应工作目录 CLAUDE.md）"}</span><textarea class="b3-text-field fn__block" rows="7" bind:value={localSettings.projectInstructions} placeholder={i18n.projectInstructionsPlaceholder || "保存后会同步到工作目录下的 CLAUDE.md；留空也会生成空文件。"}></textarea></label>
            <label><span>{i18n.envVars || "环境变量"}</span><textarea class="b3-text-field fn__block" rows="4" bind:value={localSettings.environmentVariables} placeholder="ANTHROPIC_BASE_URL=https://...&#10;HTTPS_PROXY=http://127.0.0.1:7890"></textarea></label>
        </div>
    {:else if tab === "templates"}
        <div class="cn-template-section">
            <div class="cn-template-header">
                <span class="cn-template-hint">支持变量：<code>{"{{currentDocTitle}}"}</code>、<code>{"{{selectedText}}"}</code>、<code>{"{{activeDocId}}"}</code></span>
                <div class="cn-template-header-actions">
                    <button class="cn-ghost-btn cn-template-reset-btn" on:click={resetToDefaults} title="恢复内置默认模板">重置默认</button>
                    <button class="cn-primary-btn" on:click={startAddTemplate}>+ 新建模板</button>
                </div>
            </div>

            {#if localSettings.promptTemplates.length === 0}
                <div class="cn-template-empty">暂无模板，点击"新建模板"添加</div>
            {:else}
                <div class="cn-template-list">
                    {#each localSettings.promptTemplates as tpl (tpl.id)}
                        {#if editingTemplateId === tpl.id}
                            <div class="cn-template-edit-card">
                                <div class="cn-template-edit-row">
                                    <label class="cn-template-edit-label" for="cn-tpl-title">名称</label>
                                    <input
                                        id="cn-tpl-title"
                                        class="b3-text-field cn-template-title-input"
                                        type="text"
                                        bind:value={editingTemplate.title}
                                        placeholder="模板名称..."
                                    />
                                </div>
                                <div class="cn-template-edit-row cn-template-edit-content-row">
                                    <label class="cn-template-edit-label" for="cn-tpl-content">内容</label>
                                    <textarea
                                        id="cn-tpl-content"
                                        class="b3-text-field cn-template-content-textarea"
                                        rows="5"
                                        bind:value={editingTemplate.content}
                                        placeholder={"输入 Prompt 内容，可用 {{currentDocTitle}}、{{selectedText}} 等变量..."}
                                    ></textarea>
                                </div>
                                <div class="cn-template-edit-actions">
                                    <button class="cn-primary-btn" on:click={saveEditTemplate}>保存</button>
                                    <button class="cn-ghost-btn" on:click={cancelEditTemplate}>取消</button>
                                </div>
                            </div>
                        {:else}
                            <div class="cn-template-item">
                                <div class="cn-template-item-body" on:click={() => startEditTemplate(tpl)}>
                                    <div class="cn-template-item-title">{tpl.title || "（未命名）"}</div>
                                    <div class="cn-template-item-preview">{tpl.content.slice(0, 60)}{tpl.content.length > 60 ? "..." : ""}</div>
                                </div>
                                <div class="cn-template-item-actions">
                                    <button class="cn-action-btn" title="编辑" on:click={() => startEditTemplate(tpl)}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cn-svg-icon mini">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
                                        </svg>
                                    </button>
                                    <button class="cn-action-btn delete" title="删除" on:click={() => deleteTemplate(tpl.id)}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cn-svg-icon mini">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        {/if}
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <div class="cn-settings-footer">
        <button class="cn-primary-btn" on:click={save}>{i18n.save || "保存"}</button>
    </div>
</div>

<style>
.cn-template-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 240px;
}

.cn-template-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
}

.cn-template-header-actions {
    display: flex;
    gap: 6px;
    align-items: center;
}

.cn-template-hint {
    font-size: 11px;
    color: var(--cn-muted);
    flex: 1;
    min-width: 0;
}

.cn-template-hint code {
    font-family: var(--cn-font-mono, monospace);
    font-size: 10.5px;
    background: var(--cn-panel-soft);
    padding: 1px 4px;
    border-radius: 3px;
}

.cn-template-reset-btn {
    font-size: 11px;
    padding: 4px 8px;
    border: 1px solid var(--cn-border);
    border-radius: 5px;
}

.cn-template-empty {
    padding: 24px;
    text-align: center;
    color: var(--cn-muted);
    font-size: 12px;
}

.cn-template-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 340px;
    overflow-y: auto;
}

.cn-template-item {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--cn-border);
    border-radius: 7px;
    padding: 8px 10px;
    background: var(--cn-panel);
    transition: border-color 0.15s ease, background 0.15s ease;
}

.cn-template-item:hover {
    border-color: color-mix(in srgb, var(--cn-accent) 30%, var(--cn-border));
    background: var(--cn-panel-soft);
}

.cn-template-item-body {
    flex: 1;
    min-width: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.cn-template-item-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--cn-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cn-template-item-preview {
    font-size: 11px;
    color: var(--cn-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cn-template-item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.cn-template-edit-card {
    border: 1px solid color-mix(in srgb, var(--cn-accent) 30%, var(--cn-border));
    border-radius: 8px;
    padding: 12px;
    background: color-mix(in srgb, var(--cn-accent) 4%, var(--cn-panel));
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.cn-template-edit-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.cn-template-edit-label {
    font-size: 11px;
    color: var(--cn-muted);
    font-weight: 600;
}

.cn-template-title-input {
    height: 28px;
    font-size: 12px;
    padding: 0 8px;
}

.cn-template-content-textarea {
    font-size: 12px;
    resize: vertical;
    min-height: 90px;
    font-family: var(--cn-font-ui);
    line-height: 1.5;
}

.cn-template-edit-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
}
</style>
