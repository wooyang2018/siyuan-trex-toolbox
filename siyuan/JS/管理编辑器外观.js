// ==========支持文档树多选==========
let lastClickedItem = null;

function handleFileClick(event) {
    if (!event.shiftKey) {
        // 普通点击，记录最后点击的项目
        lastClickedItem = event.target.closest('li[data-type="navigation-file"]');
        return;
    }

    const currentItem = event.target.closest('li[data-type="navigation-file"]');
    if (!currentItem || !lastClickedItem) return;

    // 获取所有文档项
    const allFiles = Array.from(document.querySelectorAll('li[data-type="navigation-file"]'));

    // 获取起始和结束索引
    const startIndex = allFiles.indexOf(lastClickedItem);
    const endIndex = allFiles.indexOf(currentItem);

    if (startIndex === -1 || endIndex === -1) return;

    // 确定选择范围
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);

    // 清除现有选择
    allFiles.forEach(file => {
        file.classList.remove('b3-list-item--focus');
    });

    // 添加新选择
    for (let i = start; i <= end; i++) {
        allFiles[i].classList.add('b3-list-item--focus');
    }

    // 阻止默认行为
    event.preventDefault();
    event.stopPropagation();
}

function initShiftSelect() {
    // 移除可能存在的旧事件监听器
    document.removeEventListener('click', handleFileClick, true);

    // 添加新的事件监听器
    document.addEventListener('click', handleFileClick, true);
}

// 初始化
initShiftSelect();

// 导出初始化函数，以便需要时重新初始化
window.initShiftSelect = initShiftSelect;

// ==========支持双击钉住页签==========
whenElementExist(".layout__center").then((el) => {
    el.addEventListener('dblclick', (event) => {
        const tab = event.target?.closest('li[data-type="tab-header"]');
        if (!tab) return;
        const protyle = siyuan.layout.centerLayout.children.map(item => item.children.find(item => item.headElement === tab)).find(item => item);
        if (tab.classList.contains('item--pin')) {
            protyle.unpin();
        } else {
            protyle.pin();
        }
    });
});


// ==========删除指定菜单项==========
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if ((mutation.type === "childList" && mutation.addedNodes.length > 0) || mutation.type === "characterData") {
            let thisNode = mutation.addedNodes[0];

            // ------------------ 删除指定菜单项 ------------------
            // "模式切换", "插入图片或文件", "开始录音", "网络图片转换为本地图片", "网络资源文件转换本地",
            // "上传资源文件到图床", "分享到社区", "自适应宽度", "字符数", "复制为块引用", "复制为嵌入块",
            // "复制块超链接", "复制块 Markdown 链接", "复制可读路径", "反向链接", "关系图", "属性",
            // "微信提醒", "闪卡", "更新于", "添加到数据库", "导出预览", "转移引用", "面板", "布局", "日记",
            // "用户指南", "反馈", "人工智能", "聚焦到上层", "聚焦", "跳转到父块的下一个块", "跳转到父块的上一个块",
            // "跳转到父块", "折叠/展开", "快速制卡"
            let hiddenCommonMenus = ["微信提醒", "上传资源文件到图床", "问题反馈", "OCR"]

            // ------------------ 删除帮助菜单项 ------------------
            let hiddenHelpMenus = ["问题反馈"]

            // ------------------ 删除斜杠快捷菜单项 ------------------
            // "AI Chat", "资源", "引用", "嵌入块", "数据库", "插入图片或文件"
            let hiddenHintMenus = []

            // ------------------ 隐藏设置菜单项 ------------------
            // "闪卡", "AI", "资源", "搜索", "快捷键", "账号", "云端", "发布"
            let hiddenSettingsMenu = []

            // ------------------ 隐藏详细设置菜单项 ------------------
            // "从右到左（RTL）", "是否显示书签、命名、别名、备注和引用计数",
            // "是否显示网络图片角标", "嵌入块面包屑", "列表大纲反向缩进", "列表项圆点/数字单击聚焦",
            // "拼写检查", "仅搜索文档", "虚拟引用", "虚拟引用关键字包含列表", "虚拟引用关键字排除列表",
            // "PlantUML 伺服地址", "反向链接默认展开数", "反向提及默认展开数", "浮窗触发方式", "字体",
            // "快速调整字号", "字号", "Tab 空格数",
            // "块引新建文档存放位置", "使用单行保存", "新建文档存放位置", "删除文档时不需要确认",
            // "导出时关于块引用内容的处理方式", "导出时关于嵌入块内容的处理方式", "导出时关于 PDF 标注引出处锚文本的处理方式",
            // "选择外观的显示语言", "重置后窗口布局将恢复初始化状态", "隐藏底部状态栏", "关闭按钮设置",
            // "Google Analytics", "自动上传报错信息和诊断数据", "网络伺服", "数据仓库密钥", "数据仓库清理",
            // "API token", "网络代理"
            let hiddenSettingsItem = []

            try {
                if (thisNode.className.includes("b3-menu__item")) {
                    var rootNode = thisNode.parentNode.parentNode
                    if (rootNode && rootNode.id === "commonMenu" && rootNode.dataset.name === "statusHelp") {
                        hiddenHelpMenus.forEach(function (item) {
                            if (thisNode.querySelector(".b3-menu__label") && thisNode.querySelector(".b3-menu__label").innerHTML.includes(item)) {
                                const currentTop = parseInt(rootNode.style.top, 10) || 0;
                                rootNode.style.top = (currentTop + thisNode.offsetHeight) + "px";
                                thisNode.remove();
                            }
                        });
                        return;
                    }
                }
            } catch (error) {
                return;
            }


            try {
                if (thisNode.className.includes("b3-menu__item")) {
                    hiddenCommonMenus.forEach(function (item) {
                        if (thisNode.innerHTML.includes("b3-menu__submenu") && thisNode.lastElementChild.lastElementChild.childNodes.length > 0) {
                            thisNode.lastElementChild.lastElementChild.childNodes.forEach(function (childNode) {
                                if (childNode.querySelector(".b3-menu__label") && childNode.querySelector(".b3-menu__label").innerHTML.includes(item)) {
                                    childNode.remove();
                                }
                            })
                        }
                        if (thisNode.querySelector(".b3-menu__label") && thisNode.querySelector(".b3-menu__label").innerHTML.includes(item)) {
                            thisNode.remove();
                        }
                    });
                    return;
                }
            } catch (error) {
                return;
            }

            try {
                if (thisNode.offsetParent.className.includes("hint--menu")) {
                    hiddenHintMenus.forEach(function (item) {
                        thisNode.childNodes.forEach(function (childNode) {
                            if (childNode.innerHTML.includes(item)) {
                                childNode.remove();
                            }
                        })
                    });
                    thisNode.firstElementChild.classList.add("b3-list-item--focus");
                    return;
                }
            } catch (error) {
                return;
            }

            try {
                if (thisNode.innerHTML.includes("config__panel")) {
                    hiddenSettingsMenu.forEach(function (item) {
                        thisNode.querySelectorAll("li[data-name]").forEach(function (childNode) {
                            if (childNode.innerHTML.includes(item)) {
                                childNode.remove();
                            }
                        });
                    });
                    hiddenSettingsItem.forEach(function (item) {
                        thisNode.querySelectorAll(".b3-label").forEach(function (childNode) {
                            if (childNode.innerHTML.includes(item)) {
                                childNode.style.display = "none";
                            }
                        });
                    })
                } else if (thisNode.parentElement.className.includes("config__tab-container") || thisNode.offsetParent.className.includes("config__panel")) {
                    mutation.addedNodes.forEach(function (childNode) {
                        hiddenSettingsItem.forEach(function (item) {
                            if (childNode.className && childNode.className.includes("b3-label") && !childNode.className.includes("fn__none") && childNode.innerHTML.includes(item)) {
                                childNode.style.display = "none";
                            }
                        })
                    })
                }
                return;
            } catch (error) {
                return;
            }
        }
    });
});

observer.observe(document.body, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
});