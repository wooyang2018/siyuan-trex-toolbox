function translateHotkey(hotkey: string): string {
    // 定义映射关系
    const keyMap: Record<string, string> = {
        'Ctrl': '⌘',
        'Shift': '⇧',
        'Alt': '⌥',
        'Tab': '⇥',
        'Backspace': '⌫',
        'Delete': '⌦',
        'Enter': '↩'
    };

    // 分割快捷键字符串
    const keys = hotkey.split('+').map(key => key.trim());

    // 标准化顺序：Alt -> Shift -> Ctrl -> 其他键
    const standardOrder = ['Alt', 'Shift', 'Ctrl'];

    // 分离修饰键和普通键
    const modifiers = keys.filter(key => standardOrder.includes(key));
    const otherKeys = keys.filter(key => !standardOrder.includes(key));

    // 对修饰键进行排序
    modifiers.sort((a, b) =>
        standardOrder.indexOf(a) - standardOrder.indexOf(b)
    );

    // 转换所有键
    const translatedKeys = [...modifiers, ...otherKeys].map(key =>
        keyMap[key] || key
    );

    // 连接所有键
    return translatedKeys.join('');
}

const updateHotkeyTip = (hotkey) => {
    if (/Mac/.test(navigator.platform) || navigator.platform === "iPhone") {
        return hotkey;
    }

    const KEY_MAP = new Map(
        Object.entries({
            "⌘": "Ctrl",
            "⌃": "Ctrl",
            "⇧": "Shift",
            "⌥": "Alt",
            "⇥": "Tab",
            "⌫": "Backspace",
            "⌦": "Delete",
            "↩": "Enter",
        })
    );

    const keys = [];

    if (hotkey.indexOf("⌘") > -1) keys.push(KEY_MAP.get("⌘"));
    if (hotkey.indexOf("⇧") > -1) keys.push(KEY_MAP.get("⇧"));
    if (hotkey.indexOf("⌥") > -1) keys.push(KEY_MAP.get("⌥"));

    const lastKey = hotkey.replace(/⌘|⇧|⌥/g, "");
    if (lastKey) {
        keys.push(KEY_MAP.get(lastKey) || lastKey);
    }

    return keys.join("+");
};


/**
 * 将 KeyboardEvent 转为思源 keymap 存储用的符号字符串（如 "⌘⇧A"）。
 * 平台约定：
 * - Mac: Meta -> ⌘、Ctrl -> ⌃
 * - Win/Linux: Ctrl -> ⌘
 * - Shift -> ⇧、Alt -> ⌥
 * 若仅按下修饰键返回空串。
 */
const keyboardEventToHotkey = (e: KeyboardEvent): string => {
    const isMac = /Mac/.test(navigator.platform) || navigator.platform === "iPhone";

    let modifiers = "";
    if (e.altKey) modifiers += "⌥";
    if (e.shiftKey) modifiers += "⇧";
    if (isMac) {
        if (e.ctrlKey) modifiers += "⌃";
        if (e.metaKey) modifiers += "⌘";
    } else {
        if (e.ctrlKey) modifiers += "⌘";
    }

    const key = e.key || "";
    const code = e.code || "";

    const modifierKeys = new Set([
        "Shift", "Control", "Alt", "Meta",
        "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
        "AltLeft", "AltRight", "MetaLeft", "MetaRight",
    ]);
    if (modifierKeys.has(key) || modifierKeys.has(code)) {
        return "";
    }

    const specialMap: Record<string, string> = {
        "Backspace": "⌫",
        "Delete": "⌦",
        "Enter": "↩",
        "Tab": "⇥",
        "Escape": "Esc",
        "ArrowUp": "↑",
        "ArrowDown": "↓",
        "ArrowLeft": "←",
        "ArrowRight": "→",
        " ": "Space",
        "Spacebar": "Space",
    };

    let mainKey = "";
    if (specialMap[key]) {
        mainKey = specialMap[key];
    } else if (/^F\d{1,2}$/.test(key)) {
        mainKey = key;
    } else if (key.length === 1) {
        mainKey = key.toUpperCase();
    } else {
        mainKey = key;
    }

    return modifiers + mainKey;
};


export {
    translateHotkey,
    updateHotkeyTip,
    keyboardEventToHotkey,
}
