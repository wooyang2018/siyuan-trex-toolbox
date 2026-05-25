// ==========修改插件菜单栏==========
// 定义一个字典，键是菜单项，值是替换字符串，空值表示隐藏该菜单项
const matchTextReplacements = {
    'Oembed': '切换Oembed',
    '添加为阅读材料': '添加阅读材料'
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
    "在线图片文字识别(OCR)": "在线图片文字识别",
    "书签+": "书签增强",
    "搜 easy": "搜索",
    "data-id:siyuan-plugins-mcp-sisyphus": "思源MCP",
    "data-id:siyuan-embed-excalidraw": "嵌入Excalidraw",
};
async function replaceMenuLabels() {
    await whenElementExist('#commonMenu .b3-menu__items .b3-menu__item');
    const menuItems = document.querySelector('#commonMenu .b3-menu__items');
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
}

whenElementExist('#barPlugins').then(barPlugins => {
    barPlugins.addEventListener('click', replaceMenuLabels);
});