/**
 * Keymap - 快捷键查看器（支持插件区行内编辑）
 *
 * @description 提供快捷键查看 / 搜索 / 重复检测；插件区支持点击行内编辑、
 *              按键捕获、回车保存、Esc 取消、Backspace/Delete 清空。
 *              保存时三处同步：
 *              1) window.siyuan.config.keymap.plugin[...].custom
 *              2) app.plugins[*].commands[*].customHotkey
 *              3) /api/setting/setKeymap 持久化
 * @author frostime
 */
import { Dialog, fetchPost, showMessage } from "siyuan";
import { updateHotkeyTip, keyboardEventToHotkey } from "@/libs/hotkey";
import type FMiscPlugin from "@/index";
import { updateStyleDom } from "@frostime/siyuan-plugin-kits";

const keymapStyle = `
.keymap-plugin-container.config-keymap {
    padding: 8px 12px;
    max-height: calc(100vh - 200px);
    overflow: auto;
    box-sizing: border-box;
}

.keymap-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
}

.keymap-toolbar .b3-form__icon {
    flex: 0 1 200px;
    min-width: 140px;
}

.keymap-toolbar .keymap-repeated-keys__label {
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    white-space: nowrap;
}

.keymap-section {
    margin-bottom: 10px;
}

.keymap-section__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-background);
    padding: 2px 4px 4px;
    margin-bottom: 2px;
    border-bottom: 1px solid var(--b3-theme-background-light);
}

.keymap-section__subtitle {
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding: 6px 4px 2px;
    margin-top: 2px;
}

.keymap-grid {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
}

.keymap-item {
    width: 250px;
    max-width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 1px 6px;
    min-height: 22px;
    box-sizing: border-box;
    border-radius: var(--b3-border-radius);
}

.keymap-item:hover {
    background-color: var(--b3-list-hover);
}

.keymap-item.selected {
    background-color: var(--b3-theme-primary-light);
    color: var(--b3-theme-primary);
}

.keymap-item__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 20px;
}

.keymap-plugin-container.config-keymap .config-keymap__key {
    padding: 2px 4px;
    font-family: var(--b3-font-family-kbd);
    font-variant-emoji: text;
    line-height: 1;
    color: var(--b3-theme-on-surface);
    background-color: var(--b3-theme-background);
    border: solid 1px var(--b3-theme-surface-lighter);
    border-radius: var(--b3-border-radius);
    box-shadow: inset 0 -1px 0 var(--b3-theme-surface-lighter);
    flex-shrink: 0;
    cursor: default;
    height: 14px;
    min-width: 17px;
    text-align: center;
    font-size: 12px;
}

.keymap-plugin-container.config-keymap .config-keymap__key:empty {
    visibility: hidden;
    min-width: 0;
    width: 0;
    padding: 0;
    border: 0;
    box-shadow: none;
}

.keymap-item.conflict .config-keymap__key {
    color: var(--b3-theme-error, #d23f31);
    font-weight: bold;
    border-color: var(--b3-theme-error, #d23f31);
}

.keymap-plugin-container.config-keymap .config-keymap__key[data-editable="true"] {
    cursor: pointer;
}

.keymap-plugin-container.config-keymap .config-keymap__key[data-editable="true"]:hover {
    outline: 1px dashed var(--b3-theme-on-surface);
}

.keymap-repeated-key {
    padding: 2px 5px;
    font-family: var(--b3-font-family-kbd);
    font-size: 12px;
    line-height: 1.2;
    color: var(--b3-theme-on-surface);
    background-color: var(--b3-theme-background);
    border: 1px solid var(--b3-theme-surface-lighter);
    border-radius: var(--b3-border-radius);
    box-shadow: inset 0 -1px 0 var(--b3-theme-surface-lighter);
    cursor: pointer;
}

.keymap-repeated-key:hover {
    background-color: var(--b3-list-hover);
}

.keymap-edit-input {
    width: 88px;
    height: 16px;
    box-sizing: border-box;
    padding: 0 4px;
    font-size: 12px;
    flex-shrink: 0;
}
`;

updateStyleDom('trex-toolbox-keymap-style', keymapStyle);

let searchInput = '';

interface IKeymapEntry {
    /** 显示文本（i18n 翻译后） */
    displayKey: string;
    /** 快捷键显示值（已经过 updateHotkeyTip） */
    value: string;
    /** 仅 plugin 区有；保存路径 keymap.plugin[pluginName][langKey] */
    pluginName?: string;
    /** 仅 plugin 区有；ICommand.langKey */
    langKey?: string;
    /** 是否允许行内编辑（仅 plugin 区为 true） */
    editable: boolean;
}

interface ITypes {
    general: IKeymapEntry[];
    editor: Record<string, IKeymapEntry[]>;
    plugin: Record<string, IKeymapEntry[]>;
}

/**
 * 添加快捷键状态栏按钮
 */
export const addStatus = (plugin: FMiscPlugin) => {
    const rootEl = document.createElement("div");
    rootEl.className = "toolbar__item";
    rootEl.title = "快捷键";
    rootEl.innerHTML = `<svg><use xlink:href="#iconKeymap"></use></svg>`;
    rootEl.addEventListener("click", () => showDialog(plugin));
    plugin.addStatusBar({ element: rootEl });
};

/**
 * 提交一个插件命令的新快捷键。完成"内存写入 + commands 同步 + 后端持久化"，
 * 失败时回滚两处内存状态。
 */
const saveHotkey = (
    fmiscPlugin: FMiscPlugin,
    pluginName: string,
    langKey: string,
    newHotkey: string,
): Promise<boolean> => {
    return new Promise((resolve) => {
        const keymap = (window as any).siyuan?.config?.keymap;
        if (!keymap?.plugin?.[pluginName]?.[langKey]) {
            showMessage(`保存失败：未找到 ${pluginName}.${langKey}`, 3000, 'error');
            resolve(false);
            return;
        }

        // 备份
        const oldCustom: string = keymap.plugin[pluginName][langKey].custom ?? '';
        const p = fmiscPlugin.app.plugins.find((n: any) => n.name === pluginName) as any;
        const cmd = p?.commands?.find((c: any) => c.langKey === langKey);
        const oldCmdHotkey: string | undefined = cmd?.customHotkey;

        // 1) 写内存
        keymap.plugin[pluginName][langKey].custom = newHotkey;
        // 2) 同步运行时 commands
        if (cmd) cmd.customHotkey = newHotkey;

        // 3) 持久化（参考思源 app/src/config/keymap.ts：fetchPost('/api/setting/setKeymap', { data })）
        fetchPost('/api/setting/setKeymap', { data: keymap }, (res: any) => {
            if (res && res.code === 0) {
                resolve(true);
                return;
            }
            // 失败：回滚
            keymap.plugin[pluginName][langKey].custom = oldCustom;
            if (cmd) cmd.customHotkey = oldCmdHotkey;
            const msg = res?.msg || '保存快捷键失败';
            showMessage(`快捷键保存失败：${msg}`, 5000, 'error');
            resolve(false);
        });
    });
};

/**
 * HTML 转义，防止 langKey/displayKey 中的特殊字符破坏 attribute / innerHTML
 */
const escapeAttr = (s: string): string =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

const renderSectionTitle = (title: string, subtitle = false): string => `
    <div class="${subtitle ? 'keymap-section__subtitle' : 'keymap-section__title'}">${escapeAttr(title)}</div>`;

const renderSection = (title: string, itemsHtml: string): string => `
    <div class="keymap-section">
        ${renderSectionTitle(title)}
        <div class="keymap-grid">${itemsHtml}</div>
    </div>`;

const renderSubSection = (title: string, itemsHtml: string): string => `
    ${renderSectionTitle(title, true)}
    <div class="keymap-grid">${itemsHtml}</div>`;

/**
 * 显示快捷键对话框
 */
const showDialog = (fmiscPlugin: FMiscPlugin) => {
    /** 重新从 window.siyuan.config.keymap 收集最新数据，并重算重复键 */
    const collect = (): { types: ITypes; repeatedKeys: string[]; pluginDisplayNames: Record<string, string> } => {
        const keys = (window as any).siyuan.config.keymap;
        const { general, editor, plugin } = keys;
        const keyCount: Record<string, string[]> = {};
        const types: ITypes = {
            general: [],
            editor: {},
            plugin: {},
        };
        // 插件分组标题：优先 app.plugins[name].displayName -> siyuan.languages[name] -> name
        const pluginDisplayNames: Record<string, string> = {};

        for (const k in general) {
            const displayKey = (window as any).siyuan.languages[k] || k;
            const value = updateHotkeyTip(general[k]?.custom);
            keyCount[value] = keyCount[value] ? [...keyCount[value], displayKey] : [displayKey];
            types.general.push({ displayKey, value, editable: false });
        }

        for (const k in editor) {
            types.editor[k] = [];
            for (const j in editor[k]) {
                const displayKey = (window as any).siyuan.languages[j] || j;
                const value = updateHotkeyTip(editor[k][j]?.custom);
                keyCount[value] = keyCount[value] ? [...keyCount[value], displayKey] : [displayKey];
                types.editor[k].push({ displayKey, value, editable: false });
            }
        }

        for (const k in plugin) {
            types.plugin[k] = [];
            const p = fmiscPlugin.app.plugins.find((n: any) => n.name === k) as any;
            const i18n = p?.i18n || {};
            const cmds: any[] = p?.commands || [];
            // 收集插件分组标题：优先取 plugin.displayName（plugin.json 声明的 i18n 名）
            const pluginDisplayName =
                (typeof p?.displayName === 'string' && p.displayName.trim()) ? p.displayName.trim() :
                ((window as any).siyuan?.languages?.[k] || k);
            pluginDisplayNames[k] = pluginDisplayName;

            for (const j in plugin[k]) {
                // 显示名优先级：ICommand.langText > plugin.i18n[langKey] > plugin.docks[langKey].config.title > langKey
                const cmd = cmds.find((c: any) => c?.langKey === j);
                const langText = typeof cmd?.langText === 'string' ? cmd.langText.trim() : '';
                const dockTitle = typeof p?.docks?.[j]?.config?.title === 'string'
                    ? p.docks[j].config.title.trim()
                    : '';
                const displayKey = langText || i18n[j] || dockTitle || j;
                const value = updateHotkeyTip(plugin[k][j]?.custom);
                keyCount[value] = keyCount[value] ? [...keyCount[value], displayKey] : [displayKey];
                types.plugin[k].push({
                    displayKey,
                    value,
                    pluginName: k,
                    langKey: j,
                    editable: true,
                });
            }
        }

        const repeatedKeys = Object.entries(keyCount)
            .filter(([key, value]) => key && value.length > 1)
            .map(([key]) => key);

        return { types, repeatedKeys, pluginDisplayNames };
    };

    let { types, repeatedKeys, pluginDisplayNames } = collect();

    const searchPlaceholder = (window as any).siyuan?.languages?.search || '搜索';

    // 顶部搜索条与重复键追溯条；重复键追溯每次重渲会刷新
    const buildHeader = () => `
        <div class="keymap-toolbar">
            <label class="b3-form__icon fn__block">
                <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                <input id="keymap-plugin-search-input" class="b3-form__icon-input b3-text-field fn__block"
                    placeholder="${escapeAttr(searchPlaceholder)}" value="${escapeAttr(searchInput)}"/>
            </label>
            ${repeatedKeys.length > 0 ? `
                <span class="keymap-repeated-keys__label">点击追溯重复快捷键:</span>
                ${repeatedKeys.map((k) => `
                    <button type="button" class="keymap-repeated-key"
                        data-keymap-trace="${escapeAttr(k)}">${escapeAttr(k)}</button>
                `).join('')}
            ` : ''}
        </div>`;

    const dialogContent = `
    <div class="config-keymap keymap-plugin-container" id="keymapList">
        <div id="keymap-plugin-header"></div>
        <div id="keymap-plugin-content"></div>
    </div>`;

    /** 单条 item 的 HTML；plugin 区携带 data-plugin-name / data-lang-key / data-editable */
    const renderItem = (entry: IKeymapEntry): string => {
        const dataAttrs = entry.editable
            ? ` data-editable="true" data-plugin-name="${escapeAttr(entry.pluginName!)}" data-lang-key="${escapeAttr(entry.langKey!)}"`
            : '';
        const keyContent = entry.value ? escapeAttr(entry.value) : '';
        return `
            <div class="keymap-item" data-keymap="${escapeAttr(entry.value)}">
                <span class="keymap-item__title" title="${escapeAttr(entry.displayKey)}">${escapeAttr(entry.displayKey)}</span>
                <span class="config-keymap__key"${dataAttrs}>${keyContent}</span>
            </div>`;
    };

    const renderContent = () => {
        const generals = types.general.filter((v) =>
            !searchInput || v.displayKey.includes(searchInput)
        );

        let innerHTML = '';

        if (generals.length > 0) {
            innerHTML += renderSection(
                (window as any).siyuan.languages["general"],
                generals.map(renderItem).join(""),
            );
        }

        const editorKeys = Object.keys(types.editor);
        const editor: Record<string, IKeymapEntry[]> = {};
        let showEditor = false;

        for (const k of editorKeys) {
            editor[k] = types.editor[k].filter((v1) =>
                !searchInput || v1.displayKey.includes(searchInput)
            );
            if (editor[k].length > 0) {
                showEditor = true;
            } else {
                delete editor[k];
            }
        }

        if (showEditor) {
            const editorHtml = Object.keys(editor).map((v) =>
                renderSubSection(
                    (window as any).siyuan.languages[v] || v,
                    editor[v].map(renderItem).join(""),
                )
            ).join("");
            innerHTML += `
            <div class="keymap-section">
                ${renderSectionTitle((window as any).siyuan.languages["editor"])}
                ${editorHtml}
            </div>`;
        }

        const pluginKeys = Object.keys(types.plugin);
        const pluginData: Record<string, IKeymapEntry[]> = {};
        let showPlugin = false;

        for (const k of pluginKeys) {
            pluginData[k] = types.plugin[k].filter((v1) =>
                !searchInput || v1.displayKey.includes(searchInput)
            );
            if (pluginData[k].length > 0) {
                showPlugin = true;
            } else {
                delete pluginData[k];
            }
        }

        if (showPlugin) {
            const pluginHtml = Object.keys(pluginData).map((v) =>
                renderSubSection(
                    pluginDisplayNames[v] || v,
                    pluginData[v].map(renderItem).join(""),
                )
            ).join("");
            innerHTML += `
            <div class="keymap-section">
                ${renderSectionTitle((window as any).siyuan.languages["plugin"])}
                ${pluginHtml}
            </div>`;
        }

        const contentEl = dialog.element.querySelector('#keymap-plugin-content') as HTMLElement | null;
        if (contentEl) {
            contentEl.innerHTML = innerHTML;
            // 标注冲突项：value 出现在 repeatedKeys 集合里则加 conflict 类
            const conflictSet = new Set(repeatedKeys);
            contentEl.querySelectorAll('.keymap-item[data-keymap]').forEach((item) => {
                const v = item.getAttribute('data-keymap') || '';
                if (v && conflictSet.has(v)) {
                    item.classList.add('conflict');
                } else {
                    item.classList.remove('conflict');
                }
            });
        }
    };

    /** 仅重建顶部 header（搜索条 + 重复键追溯条）*/
    const renderHeader = () => {
        const headerEl = dialog.element.querySelector('#keymap-plugin-header') as HTMLElement | null;
        if (headerEl) headerEl.innerHTML = buildHeader();
    };

    /** 全量重渲：header + content（保存快捷键后用） */
    const render = () => {
        renderHeader();
        renderContent();
    };

    const dialog = new Dialog({
        width: "1360px",
        title: "快捷键",
        content: dialogContent,
    });
    render();

    const container = dialog.element.querySelector('.keymap-plugin-container') as HTMLElement;

    /** 退出当前编辑态（如果有），不保存 */
    const exitEditing = (input: HTMLInputElement | null) => {
        if (!input) return;
        const valueEl = input.parentElement;
        if (!valueEl) return;
        const original = input.dataset.original ?? '';
        valueEl.textContent = original;
    };

    /** 进入编辑态：把 .config-keymap__key 替换成内嵌 input */
    const enterEditing = (valueEl: HTMLElement) => {
        // 已在编辑态则忽略
        if (valueEl.querySelector('input.keymap-edit-input')) return;
        const original = valueEl.textContent ?? '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'b3-text-field keymap-edit-input';
        input.readOnly = true; // 防止系统输入法干扰
        input.value = original;
        input.dataset.original = original;
        input.dataset.pending = original; // 当前捕获的待保存值（显示文本）
        input.dataset.pendingRaw = ''; // 当前捕获的存储用符号字符串（如 ⌘⇧A）；空表示"清空"
        valueEl.textContent = '';
        valueEl.appendChild(input);
        input.focus();
        input.select();
    };

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // 重复键追溯
        const traceBtn = target.closest('[data-keymap-trace]') as HTMLElement | null;
        if (traceBtn) {
            const v = traceBtn.getAttribute('data-keymap-trace') || '';
            let top = 0;
            container.querySelectorAll('.keymap-item[data-keymap]').forEach((item) => {
                const el = item as HTMLElement;
                if (v === el.getAttribute('data-keymap')) {
                    el.classList.add('selected');
                    if (!top) top = el.offsetTop;
                } else {
                    el.classList.remove('selected');
                }
            });
            container.scrollTo({ top, behavior: 'smooth' });
            return;
        }

        // 进入编辑态：仅 plugin 区可编辑
        const valueEl = target.closest('.config-keymap__key') as HTMLElement | null;
        if (valueEl && valueEl.getAttribute('data-editable') === 'true') {
            // 先关闭其它正在编辑的 input
            container.querySelectorAll('input.keymap-edit-input').forEach((el) => {
                exitEditing(el as HTMLInputElement);
            });
            enterEditing(valueEl);
        }
    });

    // 按键捕获：keydown 阶段截获，避免 readonly input 触发原生输入
    container.addEventListener('keydown', async (e) => {
        const target = e.target as HTMLElement;
        if (!target.classList.contains('keymap-edit-input')) {
            // 搜索框正常处理，不拦截
            return;
        }
        const input = target as HTMLInputElement;
        const valueEl = input.parentElement as HTMLElement | null;

        // Esc：取消
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            exitEditing(input);
            return;
        }

        // Enter：提交
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (!valueEl) return;
            const pluginName = valueEl.getAttribute('data-plugin-name') || '';
            const langKey = valueEl.getAttribute('data-lang-key') || '';
            const newRaw = input.dataset.pendingRaw ?? '';
            // 如果用户什么都没按过（pendingRaw 还是初始空，且 pending 等于原值），视为取消
            const pending = input.dataset.pending ?? '';
            const original = input.dataset.original ?? '';
            if (newRaw === '' && pending === original) {
                exitEditing(input);
                return;
            }
            const ok = await saveHotkey(fmiscPlugin, pluginName, langKey, newRaw);
            if (ok) {
                // 重新收集并整表重渲（自动刷新冲突高亮）
                const fresh = collect();
                types = fresh.types;
                repeatedKeys = fresh.repeatedKeys;
                pluginDisplayNames = fresh.pluginDisplayNames;
                render();
            } else {
                exitEditing(input);
            }
            return;
        }

        // Backspace / Delete：清空
        if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            e.stopPropagation();
            input.value = '';
            input.dataset.pending = '';
            input.dataset.pendingRaw = ''; // 空字符串 = 删除快捷键（思源支持）
            return;
        }

        // 其它按键：捕获组合键
        e.preventDefault();
        e.stopPropagation();
        const raw = keyboardEventToHotkey(e);
        if (!raw) {
            // 仅按下修饰键，不更新展示
            return;
        }
        input.dataset.pendingRaw = raw;
        const display = updateHotkeyTip(raw);
        input.dataset.pending = display;
        input.value = display;
    });

    // blur：视为取消（编辑态外部点击/失焦）
    container.addEventListener('focusout', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('keymap-edit-input')) {
            // 延迟一拍，避免与点击其它 value 进入新编辑态冲突
            setTimeout(() => {
                if (document.body.contains(target)) {
                    exitEditing(target as HTMLInputElement);
                }
            }, 0);
        }
    });

    // 搜索框 keyup（独立绑定，不和 keydown 编辑捕获冲突）
    // 注意：仅刷新内容，不重建 header（避免搜索框 input 被销毁导致焦点丢失）
    let searchDebounce: ReturnType<typeof setTimeout> | null = null;
    container.addEventListener('keyup', (e) => {
        const target = e.target as HTMLElement;
        if (target.id === 'keymap-plugin-search-input') {
            searchInput = (target as HTMLInputElement).value || '';
            if (searchDebounce) clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                renderContent();
            }, 100);
        }
    });
};
