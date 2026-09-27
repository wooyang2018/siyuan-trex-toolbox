// ==========修改插件菜单栏==========
// 定义一个字典，键是菜单项，值是替换字符串，空值表示隐藏该菜单项
const matchTextReplacements = {
    'Oembed': '切换Oembed',
    '复习此处闪卡': '复习闪卡',
};
// 定义一个字典，键是匹配开头的字符串，值是替换开头的字符串
const partialTextReplacements = {
};
const menuItemsSelector = '#commonMenu > div.b3-menu__items';
const targetMenuItemSelector = 'button.b3-menu__item.b3-menu__item--show.b3-menu__item--current > div > div';

whenElementExist(menuItemsSelector).then((menuItemsElement) => {
    const menuItemsObserver = new MutationObserver((mutationsList) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
                const targetMenuItem = menuItemsElement.querySelector(targetMenuItemSelector);
                if (targetMenuItem) {
                    targetMenuItem.childNodes.forEach((childNode) => {
                        const labelElement = childNode.querySelector('span.b3-menu__label');
                        if (labelElement) {
                            const labelText = labelElement.textContent.trim();
                            if (matchTextReplacements.hasOwnProperty(labelText)) {
                                const replacementText = matchTextReplacements[labelText];
                                if (replacementText === '') {
                                    childNode.style.display = 'none';
                                } else {
                                    labelElement.style.whiteSpace = "pre";
                                    labelElement.textContent = replacementText;
                                }
                            }
                            // 匹配开头的字符串
                            for (const startText in partialTextReplacements) {
                                if (labelText.startsWith(startText)) {
                                    labelElement.style.whiteSpace = "pre";
                                    const replacementText = partialTextReplacements[startText];
                                    // labelElement.textContent = replacementText + labelText.slice(startText.length);
                                    labelElement.textContent = replacementText;
                                    break;
                                }
                            }
                        }
                    });
                }
            }
        }
    });

    const menuItemsConfig = { childList: true, attributes: true, subtree: true };
    menuItemsObserver.observe(menuItemsElement, menuItemsConfig);
});

// ==========修改插件栏标签==========
// key 支持两种形式：
// 1. 普通字符串：按 label 文本精确匹配
// 2. "data-id:xxx"：按 button 的 data-id 属性匹配
const replaceTextMap = {
    "(伪)文档面包屑": "文档面包屑",
    "Query&View": "Query View",
    "书签+": "书签增强",
    "搜 easy": "搜索",
    "data-id:siyuan-plugins-mcp-sisyphus": "思源MCP",
    "data-id:siyuan-embed-excalidraw": "嵌入Excalidraw",
    "data-id:plugin_siyuan-plugin-text-process_0": "粘贴文本处理",
};
const textWidthContext = document.createElement('canvas').getContext('2d');

function labelLength(item) {
    const label = item.querySelector('span.b3-menu__label');
    if (!label) return 0;
    const text = label.textContent.trim();
    if (!text) return 0;
    textWidthContext.font = getComputedStyle(label).font;
    return textWidthContext.measureText(text).width;
}

function refreshGroupEdgeClasses(items) {
    items.forEach((item) => {
        item.classList.remove('b3-menu__item--group-first', 'b3-menu__item--group-last');
    });
    items[0].classList.add('b3-menu__item--group-first');
    items[items.length - 1].classList.add('b3-menu__item--group-last');
}

// 分隔线把菜单拆成独立组；只重排组内顺序，按显示宽度从长到短，宽度相同则保持原顺序。
function sortPluginMenuGroups(menuItems) {
    const groups = [];
    let current = [];
    for (const child of menuItems.children) {
        if (child.classList.contains('b3-menu__separator')) {
            if (current.length) groups.push(current);
            current = [];
            continue;
        }
        if (child.classList.contains('b3-menu__item')) {
            current.push(child);
        }
    }
    if (current.length) groups.push(current);

    for (const group of groups) {
        if (group.length < 2) continue;
        const sorted = group.slice().sort((a, b) => labelLength(b) - labelLength(a));
        const orderChanged = sorted.some((item, index) => item !== group[index]);
        refreshGroupEdgeClasses(sorted);
        if (!orderChanged) continue;
        const anchor = group[group.length - 1].nextSibling;
        for (const item of sorted) {
            menuItems.insertBefore(item, anchor);
        }
    }
}

function whenPluginMenuReady() {
    return new Promise((resolve) => {
        const findMenu = () => {
            const menu = document.querySelector('#commonMenu[data-name="topBarPlugin"] .b3-menu__items');
            if (!menu) return null;
            const hasBothGroups = menu.querySelector('[data-id="separator_settings"]')
                && menu.querySelectorAll('.b3-menu__item').length > 1;
            return hasBothGroups ? menu : null;
        };
        const ready = findMenu();
        if (ready) {
            resolve(ready);
            return;
        }
        const observer = new MutationObserver(() => {
            const menu = findMenu();
            if (!menu) return;
            observer.disconnect();
            resolve(menu);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

async function replaceMenuLabels() {
    await whenPluginMenuReady();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const menuItems = document.querySelector('#commonMenu[data-name="topBarPlugin"] .b3-menu__items');
    if (!menuItems) return;
    const items = menuItems.querySelectorAll('.b3-menu__item');
    items.forEach(item => {
        const label = item.querySelector('span.b3-menu__label');
        if (!label) return;
        // 优先按 data-id 匹配
        const dataId = item.getAttribute('data-id');
        if (dataId) {
            const dataIdKey = `data-id:${dataId}`;
            if (replaceTextMap[dataIdKey]) {
                label.textContent = replaceTextMap[dataIdKey];
                return;
            }
        }
        // 回退按文本匹配
        if (replaceTextMap[label.textContent]) {
            label.textContent = replaceTextMap[label.textContent];
        }
    });
    sortPluginMenuGroups(menuItems);
}

whenElementExist('#barPlugins').then(barPlugins => {
    barPlugins.addEventListener('click', replaceMenuLabels);
});