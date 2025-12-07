/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-09-14 19:10:09
 * @FilePath     : /src/custom-icon.ts
 * @LastEditTime : 2024-10-09 16:44:07
 * @Description  : 
 */

import { showMessage } from 'siyuan';
// 定义 Href 类型，实际为字符串类型，表示链接地址
type Href = string;
// 定义 IconUrl 类型，实际为字符串类型，表示图标的 URL 地址
type IconUrl = string;
// 定义 CSSCode 类型，实际为字符串类型，表示 CSS 代码
type CSSCode = string;

/**************************
 * @returns 动态样式相关函数
 *   - addIcon(href: Href, url: IconUrl): void; // 添加图标
 *   - removeIcon(href: Href): void; // 移除图标
 *   - clearStyle(id: string): void; // 清除样式
 **************************/
/**
 * 创建一个用于管理动态样式的对象，可用于添加、移除图标样式以及清除样式
 * @param styleId 样式元素的 ID，默认为 'custom-icon-style'
 * @returns 包含添加图标、移除所有图标、清除样式和刷新样式等功能的对象
 */
export const useDynamicStyle = (styleId = 'custom-icon-style') => {
    /**
     * 创建 CSS 样式模板
     * @param href 链接地址
     * @param url 图标 URL
     * @returns 返回生成的 CSS 规则
     */
    const template = (href: Href, url: IconUrl) => `
.protyle-wysiwyg [data-node-id] span[data-type~='a'][data-href *="${href}"]:not(:empty)::before,
.protyle-wysiwyg [data-node-id] span[data-type~='url'][data-href *="${href}"]:not(:empty)::before,
.protyle-wysiwyg [data-node-id] a[href *="${href}"]::before,
.b3-typography a[href *="${href}"]::before{
    content: "";
    background-image: url('${url}');
}
` as CSSCode;

    // 存储自定义样式的对象，键为链接地址，值为对应的 CSS 代码
    let customStyles: Record<Href, CSSCode> = {};

    /**
     * 更新样式
     * @param css 样式内容
     */
    const _updateStyle = (css: string) => {
        // 根据样式 ID 获取样式元素
        const element = document.getElementById(styleId);
        if (element) {
            // 如果元素存在，更新其内部的 CSS 代码
            element.innerHTML = css;
        } else {
            // 如果元素不存在，创建一个新的样式元素并添加到文档头部
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = css;
            document.head.appendChild(style);
        }
    };

    /**
     * 清除样式
     */
    const clearStyle = () => {
        // 根据样式 ID 获取样式元素
        const element = document.getElementById(styleId);
        if (element) {
            // 如果元素存在，从文档中移除该元素
            element.remove();
        }
    }

    /**
     * 更新图标样式
     */
    const _flushStyle = () => {
        // 初始化一个空字符串用于存储所有的 CSS 代码
        let css = '';
        // 遍历 customStyles 对象，将所有的 CSS 代码拼接起来
        for (const href in customStyles) {
            const style = customStyles[href];
            css += style + '\n';
        }
        // 调用 _updateStyle 函数更新样式
        _updateStyle(css);
    }

    /**
     * 添加图标
     * @param href 链接地址
     * @param url 图标 URL
     * @param flushStyle 是否立即刷新样式，默认为 true
     */
    const addIcon = (href: Href, url: IconUrl, flushStyle = true) => {
        // 调用 template 函数生成对应的 CSS 代码
        const style = template(href, url);
        // 将生成的 CSS 代码存储到 customStyles 对象中
        customStyles[href] = style;
        // 如果需要立即刷新样式，则调用 _flushStyle 函数
        if (flushStyle) {
            _flushStyle();
        }
    }

    /**
     * 移除所有图标样式
     */
    const removeAllIcons = () => {
        // 将 customStyles 对象重置为空对象
        customStyles = {};
    }

    /**
     * 移除图标
     * @param href 链接地址
     */
    const removeIcon = (href: Href) => {
        // 检查 customStyles 对象中是否存在该链接地址对应的样式
        if (customStyles[href]) {
            // 如果存在，删除该样式
            delete customStyles[href];
            // 调用 _flushStyle 函数更新样式
            _flushStyle();
        }
    }

    return {
        addIcon,
        removeAllIcons,
        clearStyle,
        flushStyle: _flushStyle,
    }
}

/**
 * 创建一个用于文件上传的 FormData 对象
 * @param path 文件路径
 * @param isDir 是否为目录
 * @param file 文件对象或其他数据
 * @param stream 是否以流的形式处理文件，可选参数
 * @returns 包含文件上传所需信息的 FormData 对象
 */
const createForm = (path: string, isDir: boolean, file: Blob | any, stream?: boolean) => {
    // 创建一个新的 FormData 对象
    let form = new FormData();
    // 向 FormData 对象中添加文件路径
    form.append('path', path);
    // 向 FormData 对象中添加是否为目录的信息
    form.append('isDir', isDir.toString());
    // 向 FormData 对象中添加文件修改时间
    form.append('modTime', Math.floor(Date.now() / 1000).toString());
    if (file instanceof Blob && !stream) {
        // 如果文件是 Blob 类型且不以流的形式处理，直接添加到 FormData 对象中
        form.append('file', file);
    } else {
        // 否则，将文件转换为 Blob 类型并以流的形式添加到 FormData 对象中
        form.append('file', new Blob([file], { type: 'application/octet-stream' }));
    }

    return form;
}

/**
 * 上传文件并返回图标的 URL 地址
 * @param file 要上传的文件
 * @returns 图标的 URL 地址
 */
const doUpload = async (file: File): Promise<IconUrl> => {
    // 获取文件的名称
    const filename = file.name;
    // 定义图标的存储路径
    let iconPath = `/data/public/custom-link-icons/${filename}`;
    // 调用 createForm 函数创建一个用于文件上传的 FormData 对象
    const form = createForm(iconPath, false, file);
    // 定义文件上传的 API 地址
    let url = '/api/file/putFile';
    // 发起文件上传请求
    await fetch(url, {
        method: 'POST',
        body: form
    });
    // 返回图标的 URL 地址
    return `/public/custom-link-icons/${filename}`;
}

/**
 * 上传自定义图标的界面
 * @param uploadCallback 上传成功后的回调函数，接收链接地址和图标的 URL 地址作为参数
 * @returns 包含上传界面元素的 HTMLElement 对象
 */
export const uploadCustomIcon = (uploadCallback: (hrefName: Href, url: IconUrl) => void): HTMLElement => {
    // 创建一个 div 元素作为上传界面的容器
    const div = document.createElement('div');
    // 设置容器的类名
    div.className = 'custom-icon-upload';
    // 设置容器的内部 HTML 结构
    div.innerHTML = `
        <div class="input-group">
            <label for="website-href">Website URL:</label>
            <input type="text" id="website-href" placeholder="e.g., example.com">
        </div>
        <div class="input-group">
            <label for="icon-file">Select Icon:</label>
            <input type="file" id="icon-file" accept=".png,.jpg,.svg,.ico">
        </div>
        <div id="file-preview"></div>
        <button id="upload-button" class="b3-button" disabled>Upload Icon</button>
    `;

    // 获取输入链接地址的输入框元素
    const hrefInput = div.querySelector('#website-href') as HTMLInputElement;
    // 获取选择图标的文件输入框元素
    const fileInput = div.querySelector('#icon-file') as HTMLInputElement;
    // 获取文件预览的 div 元素
    const filePreview = div.querySelector('#file-preview') as HTMLDivElement;
    // 获取上传按钮元素
    const uploadButton = div.querySelector('#upload-button') as HTMLButtonElement;

    /**
     * 更新上传按钮的状态，根据链接地址输入框和文件选择框的状态决定按钮是否可用
     */
    const updateUploadButtonState = () => {
        // 当链接地址输入框有内容且文件选择框选择了文件时，按钮可用，否则禁用
        uploadButton.disabled = !(hrefInput.value.trim() && fileInput.files && fileInput.files.length > 0);
    };

    // 监听链接地址输入框的输入事件，输入时调用 updateUploadButtonState 函数更新按钮状态
    hrefInput.addEventListener('input', updateUploadButtonState);
    // 监听文件选择框的变化事件
    fileInput.addEventListener('change', () => {
        // 调用 updateUploadButtonState 函数更新按钮状态
        updateUploadButtonState();
        // 清空文件预览区域
        filePreview.innerHTML = '';
        if (fileInput.files && fileInput.files[0]) {
            // 如果选择了文件
            const file = fileInput.files[0];
            if (file.type.startsWith('image/')) {
                // 如果文件是图片类型，创建一个 img 元素并显示图片预览
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.style.maxWidth = '100px';
                img.style.maxHeight = '100px';
                filePreview.appendChild(img);
            } else {
                // 如果文件不是图片类型，显示文件名称
                filePreview.textContent = `File selected: ${file.name}`;
            }
        }
    });

    // 监听上传按钮的点击事件
    uploadButton.addEventListener('click', async () => {
        if (fileInput.files && fileInput.files[0]) {
            // 如果选择了文件
            const file = fileInput.files[0];
            try {
                // 调用 doUpload 函数上传文件并获取图标的 URL 地址
                const iconUrl = await doUpload(file);
                // 调用上传成功后的回调函数
                uploadCallback(hrefInput.value.trim(), iconUrl);
                // 显示上传成功的消息
                showMessage('Icon uploaded successfully!');
                // 清空链接地址输入框
                hrefInput.value = '';
                // 清空文件选择框
                fileInput.value = '';
                // 清空文件预览区域
                filePreview.innerHTML = '';
                // 调用 updateUploadButtonState 函数更新按钮状态
                updateUploadButtonState();
            } catch (error) {
                // 打印上传失败的错误信息
                console.error('Upload failed:', error);
                // 显示上传失败的消息
                showMessage('Upload failed. Please try again.');
            }
        }
    });

    return div;
};

/**
 * 管理自定义图标的界面
 * @param customIcons 包含自定义图标信息的数组，每个元素包含链接地址和图标的 URL 地址
 * @param updatedCustomIcons 自定义图标信息更新后的回调函数，接收更新后的自定义图标信息数组作为参数
 * @param closeCallback 关闭管理界面的回调函数
 * @returns 包含管理界面元素的 HTMLElement 对象
 */
export const manageCustomIcons = (
    customIcons: { href: string; iconUrl: string }[],
    updatedCustomIcons: (customIcons: { href: string; iconUrl: string }[]) => void,
    closeCallback: () => void
): HTMLElement => {
    // 创建一个 div 元素作为管理界面的容器
    const container = document.createElement('div');
    // 设置容器的类名
    container.className = 'custom-icon-manager';

    // 复制一份自定义图标信息数组
    customIcons = [...customIcons];

    // 设置容器的样式
    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: '0 20px',
        gap: '15px',
    });

    // 存储要删除的图标 URL 地址的数组
    const deleteList: string[] = [];

    /**
     * 创建一个表示自定义图标的元素
     * @param icon 包含链接地址和图标的 URL 地址的对象
     * @param index 图标在自定义图标信息数组中的索引
     * @returns 包含图标预览、链接地址输入框和删除按钮的 div 元素
     */
    const createIconElement = (icon: { href: string; iconUrl: string }, index: number) => {
        // 创建一个 div 元素作为图标元素的容器
        const iconElement = document.createElement('div');
        // 设置容器的类名
        iconElement.className = 'custom-icon-item';
        // 设置容器的样式
        Object.assign(iconElement.style, {
            display: 'flex',
            gap: '15px',
            // marginBottom: '10px',
            alignItems: 'center',
        });
        // 设置容器的内部 HTML 结构
        iconElement.innerHTML = `
            <img src="${icon.iconUrl}" alt="Custom Icon" class="custom-icon-preview" style="height: 25px;">
            <input type="text" class="custom-icon-href" value="${icon.href}" style="flex: 1;">
            <button class="custom-icon-delete b3-button b3-button--outline">Delete</button>
        `;

        // 获取链接地址输入框元素
        const hrefInput = iconElement.querySelector('.custom-icon-href') as HTMLInputElement;
        // 获取删除按钮元素
        const deleteButton = iconElement.querySelector('.custom-icon-delete') as HTMLButtonElement;

        // 监听链接地址输入框的变化事件
        hrefInput.addEventListener('change', () => {
            // 更新自定义图标信息数组中对应图标的链接地址
            customIcons[index].href = hrefInput.value;
            // updatedCustomIcons([...customIcons]);
        });

        // 监听删除按钮的点击事件
        deleteButton.addEventListener('click', () => {
            // 获取要删除的图标信息
            const icon = customIcons[index];
            // 将该图标的 URL 地址添加到要删除的列表中
            deleteList.push(icon.iconUrl);
            // 从自定义图标信息数组中移除该图标
            customIcons.splice(index, 1);
            // 从文档中移除该图标元素
            iconElement.remove();
            // updatedCustomIcons([...customIcons]);
        });

        return iconElement;
    };

    /**
     * 渲染所有的自定义图标元素
     */
    const renderIcons = () => {
        // 清空容器的内容
        container.innerHTML = '';
        // 遍历自定义图标信息数组，为每个图标创建一个图标元素并添加到容器中
        customIcons.forEach((icon, index) => {
            container.appendChild(createIconElement(icon, index));
        });
    };

    // 调用 renderIcons 函数渲染所有的自定义图标元素
    renderIcons();

    // 创建一个保存按钮元素
    const saveButton = document.createElement('button');
    // 设置按钮的类名
    saveButton.className = 'b3-button b3-button--text';
    // 设置按钮的文本内容
    saveButton.textContent = 'Save Changes';
    // 监听保存按钮的点击事件
    saveButton.addEventListener('click', async () => {
        // 调用自定义图标信息更新后的回调函数，传递更新后的自定义图标信息数组
        updatedCustomIcons([...customIcons]);
        // 存储删除文件的请求任务数组
        let deleteTasks = [];
        // 遍历要删除的图标 URL 地址列表，为每个地址创建一个删除文件的请求任务
        for (const iconUrl of deleteList) {
            deleteTasks.push(fetch('/api/file/removeFile', {
                method: 'POST',
                body: JSON.stringify({
                    path: `/data${iconUrl}`
                })
            }));
        }
        // 等待所有删除文件的请求任务完成
        await Promise.all(deleteTasks);
        // 调用关闭管理界面的回调函数
        closeCallback();
        // 显示自定义图标更新成功的消息
        showMessage('Custom icons updated successfully!');
    });

    // 将保存按钮添加到容器中
    container.appendChild(saveButton);

    return container;
};