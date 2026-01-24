/**
 * Keymap - 快捷键查看器
 * 
 * @description 提供快捷键管理和查看功能,支持搜索和重复快捷键检测
 * @author frostime
 */
import { Dialog } from "siyuan";
import { updateHotkeyTip } from "@/libs/hotkey";
import type FMiscPlugin from "@/index";
import { updateStyleDom } from "@frostime/siyuan-plugin-kits";

const keymapStyle = `
.keymap-plugin-container {
    padding: 12px;
    max-height: calc(100vh - 200px);
    color: var(--b3-theme-on-background);
    overflow: auto;
}

#keymap-plugin-search-input {
    margin-right: 20px;
}

.repeated-key {
    margin-right: 6px;
    border: 1px solid var(--b3-theme-on-background);
    cursor: pointer;
    padding: 2px 4px;
}

.repeated-key:hover {
    background-color: var(--b3-list-hover);
    border-radius: 2px;
}

.keymap-plugin-search {
    margin-bottom: 6px;
    border-bottom: 1px solid var(--b3-theme-background-light);
    padding-bottom: 10px;
}

.keymap-plugin-header {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--b3-theme-background-light);
    padding-bottom: 2px;
}

.keymap-plugin-header-2 {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--b3-theme-background-light);
    padding-bottom: 2px;
}

.keymap-plugin-item {
    width: 250px;
    display: inline-block;
    margin-bottom: 2px;
    padding: 2px 6px;
    position: relative;
    height: 20px;
}

.keymap-plugin-item.selected {
    background-color: var(--b3-theme-primary-light);
    color: var(--b3-theme-primary);
    border-color: var(--b3-theme-primary);
}

.keymap-plugin-item:hover {
    background-color: var(--b3-list-hover);
    border-radius: 2px;
}

.keymap-plugin-title, .keymap-plugin-value {
    display: inline-block;
}

.keymap-plugin-title {
    position: absolute;
    left: 4px;
    max-width: 150px;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
}

.keymap-plugin-value {
    position: absolute;
    right: 4px;
}
`;

updateStyleDom('trex-toolbox-keymap-style', keymapStyle);

let searchInput = '';

/**
 * 添加快捷键状态栏按钮
 */
export const addStatus = (plugin: FMiscPlugin) => {
    const tpl = document.createElement("template");
    tpl.innerHTML = `
        <div class="toolbar__item">
            <svg>
                <use xlink:href="#iconKeymap"></use>
            </svg>
            <span id="tts-content" style="margin-left: 4px">快捷键</span>
        </div>`;

    const rootEl = tpl.content.firstElementChild as HTMLElement;
    const spanEl = rootEl.querySelector("span");

    plugin.addStatusBar({ element: rootEl });
    spanEl?.addEventListener("click", () => showDialog(plugin));
};

/**
 * 显示快捷键对话框
 */
const showDialog = (fmiscPlugin: FMiscPlugin) => {
    const keys = window.siyuan.config.keymap;
    const { general, editor, plugin } = keys;
    const keyCount: Record<string, string[]> = {};
    const types = {
        general: [] as Array<{ key: string; value: string }>,
        editor: {} as Record<string, Array<{ key: string; value: string }>>,
        plugin: {} as Record<string, Array<{ key: string; value: string }>>,
    };
    const pluginNames: Record<string, string> = {};

    for (const k in general) {
        const key = window.siyuan.languages[k] || k;
        const value = updateHotkeyTip(general[k]?.custom);
        keyCount[value] = keyCount[value] ? [...keyCount[value], key] : [key];
        types.general.push({ key, value });
    }

    for (const k in editor) {
        types.editor[k] = [];
        for (const j in editor[k]) {
            const key = window.siyuan.languages[j] || j;
            const value = updateHotkeyTip(editor[k][j]?.custom);
            keyCount[value] = keyCount[value] ? [...keyCount[value], key] : [key];
            types.editor[k].push({ key, value });
        }
    }

    for (const k in plugin) {
        types.plugin[k] = [];
        const p = fmiscPlugin.app.plugins.find((n) => n.name === k);
        const i18n = p?.i18n || {};
        pluginNames[k] = p?.displayName;
        
        for (const j in plugin[k]) {
            const key = i18n[j] || j;
            const value = updateHotkeyTip(plugin[k][j]?.custom);
            keyCount[value] = keyCount[value] ? [...keyCount[value], key] : [key];
            types.plugin[k].push({ key, value });
        }
    }

    const repeatedkeys = Object.entries(keyCount)
        .filter(([key, value]) => key && value.length > 1)
        .map(([key]) => key);

    const content = `
    <div class="keymap-plugin-container">
        <div class="keymap-plugin-search">
            <span>搜索</span>
            <input class="b3-text-field" type="input" id="keymap-plugin-search-input"/>
            ${repeatedkeys.length > 0 ? `
                <span>点击追溯重复快捷键: </span> 
                ${repeatedkeys.map((k) => `<span class="repeated-key" data-keymap="${k}">${k}</span>`).join('')}
            ` : ''}
        </div>
        <div id="keymap-plugin-content"></div>
    </div>`;

    const render = () => {
        const generals = types.general.filter((v) => 
            !searchInput || v.key.includes(searchInput)
        );
        
        let innerHTML = '';
        
        if (generals.length > 0) {
            innerHTML += `
            <div class="keymap-plugin-header">${window.siyuan.languages["general"]}</div>
            ${generals.map((v) => `
                <div class="keymap-plugin-item" data-keymap="${v.value}">
                    <div class="keymap-plugin-title" title="${v.key}">${v.key}</div>
                    <div class="keymap-plugin-value config-keymap__key">${v.value}</div>
                </div>
            `).join("")}`;
        }

        const editorKeys = Object.keys(types.editor);
        const editor: Record<string, Array<{ key: string; value: string }>> = {};
        let showEditor = false;
        
        for (const k of editorKeys) {
            editor[k] = types.editor[k].filter((v1) => 
                !searchInput || v1.key.includes(searchInput)
            );
            if (editor[k].length > 0) {
                showEditor = true;
            } else {
                delete editor[k];
            }
        }
        
        if (showEditor) {
            innerHTML += `
            <div class="keymap-plugin-header">${window.siyuan.languages["editor"]}</div>
            ${Object.keys(editor).map((v) => `
                <div class="keymap-plugin-header-2">${window.siyuan.languages[v] || v}</div>
                ${editor[v].map((v1) => `
                    <div class="keymap-plugin-item" data-keymap="${v1.value}">
                        <div class="keymap-plugin-title" title="${v1.key}">${v1.key}</div>
                        <div class="keymap-plugin-value config-keymap__key">${v1.value}</div>
                    </div>
                `).join("")}
            `).join("")}`;
        }

        const pluginKeys = Object.keys(types.plugin);
        const pluginData: Record<string, Array<{ key: string; value: string }>> = {};
        let showPlugin = false;
        
        for (const k of pluginKeys) {
            pluginData[k] = types.plugin[k].filter((v1) => 
                !searchInput || v1.key.includes(searchInput)
            );
            if (pluginData[k].length > 0) {
                showPlugin = true;
            } else {
                delete pluginData[k];
            }
        }
        
        if (showPlugin) {
            innerHTML += `
            <div class="keymap-plugin-header">${window.siyuan.languages["plugin"]}</div>
            ${Object.keys(pluginData).map((v) => `
                <div class="keymap-plugin-header-2">${window.siyuan.languages[v] || v}</div>
                ${pluginData[v].map((v1) => `
                    <div class="keymap-plugin-item" data-keymap="${v1.value}">
                        <div class="keymap-plugin-title" title="${v1.key}">${v1.key}</div>
                        <div class="keymap-plugin-value config-keymap__key">${v1.value}</div>
                    </div>
                `).join("")}
            `).join("")}`;
        }

        const contentEl = document.getElementById('keymap-plugin-content');
        if (contentEl) {
            contentEl.innerHTML = innerHTML;
        }
    }
    
    new Dialog({
        width: "1360px",
        title: "快捷键",
        content,
    });
    render();

    const input = document.getElementById('keymap-plugin-search-input');
    input?.addEventListener('keyup', (e) => {
        searchInput = (e.target as HTMLInputElement).value || '';
        render();
    });

    document.querySelectorAll('.repeated-key').forEach((k) => {
        k.addEventListener('click', (e) => {
            const el = e.target as HTMLElement;
            const v = el.getAttribute('data-keymap');
            let top = 0;
            
            document.querySelectorAll('.keymap-plugin-item').forEach((item) => {
                const element = item as HTMLElement;
                if (v === element.getAttribute('data-keymap')) {
                    element.classList.add('selected');
                    top = element.offsetTop;
                } else {
                    element.classList.remove('selected');
                }
            });
            
            document.querySelector('.keymap-plugin-container')?.scrollTo({
                top,
                behavior: 'smooth'
            });
        });
    });
}

