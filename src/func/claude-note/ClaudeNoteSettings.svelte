<script lang="ts">
    import { showMessage } from "siyuan";
    import {
        mergeSettings,
        detectDefaultSettings,
        readProjectInstructions,
        writeProjectInstructions,
        type ClaudeNoteSettings,
    } from "./settings";

    export let settings: ClaudeNoteSettings;
    export let saveSettings: (settings: ClaudeNoteSettings) => Promise<void>;
    export let i18n: any = {};

    let localSettings = mergeSettings(settings);
    let previousSettings = settings;
    let tab: "general" | "claude" = "general";
    const detected = detectDefaultSettings();

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
</script>

<div class="cn-settings-dialog">
    <div class="cn-settings-tabs">
        <button class:active={tab === "general"} on:click={() => tab = "general"}>{i18n.tabGeneral || "通用"}</button>
        <button class:active={tab === "claude"} on:click={() => tab = "claude"}>{i18n.tabClaude || "Claude Code"}</button>
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
    {/if}

    <div class="cn-settings-footer">
        <button class="cn-primary-btn" on:click={save}>{i18n.save || "保存"}</button>
    </div>
</div>
