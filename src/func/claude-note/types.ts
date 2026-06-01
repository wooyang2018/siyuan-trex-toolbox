/**
 * Claude Note i18n 字典类型
 * 用于 .svelte 文件的 i18n props 类型提示
 */
export interface ClaudeNoteI18n {
    settingsTitle?: string;
    settingsSaved?: string;
    tabGeneral?: string;
    tabClaude?: string;
    autoAttachDoc?: string;
    requireModEnter?: string;
    autoScroll?: string;
    showThinking?: string;
    showToolCalls?: string;
    historyLimit?: string;
    historyDays?: string;
    historyDaysPlaceholder?: string;
    siyuanToken?: string;
    siyuanPort?: string;
    autoDetectPlaceholder?: string;
    cliPath?: string;
    cliPathPlaceholder?: string;
    workingDir?: string;
    workingDirPlaceholder?: string;
    claudeHomeDir?: string;
    claudeHomeDirPlaceholder?: string;
    projectInstructions?: string;
    projectInstructionsPlaceholder?: string;
    envVars?: string;
    save?: string;
    [key: string]: string | undefined;
}
