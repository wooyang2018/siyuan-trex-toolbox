/**
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @description 自定义链接图标管理模块
 */

import { showMessage } from 'siyuan';

type Href = string;
type IconUrl = string;
type CSSCode = string;
/**
 * 创建用于管理动态样式的对象
 * @param styleId 样式元素的 ID，默认为 'custom-icon-style'
 * @returns 包含添加图标、移除图标、清除样式和刷新样式的对象
 */
export const useDynamicStyle = (styleId = 'custom-icon-style') => {
    /**
     * 创建 CSS 样式模板
     */
    const template = (href: Href, url: IconUrl): CSSCode => `
.protyle-wysiwyg [data-node-id] span[data-type~='a'][data-href *="${href}"]:not(:empty)::before,
.protyle-wysiwyg [data-node-id] span[data-type~='url'][data-href *="${href}"]:not(:empty)::before,
.protyle-wysiwyg [data-node-id] a[href *="${href}"]::before,
.b3-typography a[href *="${href}"]::before{
    content: "";
    background-image: url('${url}');
}
`;

    let customStyles: Record<Href, CSSCode> = {};

    /**
     * 更新样式
     */
    const _updateStyle = (css: string) => {
        const element = document.getElementById(styleId);
        if (element) {
            element.innerHTML = css;
        } else {
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
        document.getElementById(styleId)?.remove();
    };

    /**
     * 刷新图标样式
     */
    const _flushStyle = () => {
        const css = Object.values(customStyles).join('\n');
        _updateStyle(css);
    };

    /**
     * 添加图标
     */
    const addIcon = (href: Href, url: IconUrl, flushStyle = true) => {
        const style = template(href, url);
        customStyles[href] = style;
        if (flushStyle) {
            _flushStyle();
        }
    };

    /**
     * 移除所有图标样式
     */
    const removeAllIcons = () => {
        customStyles = {};
    };

    /**
     * 移除图标
     */
    const removeIcon = (href: Href) => {
        if (customStyles[href]) {
            delete customStyles[href];
            _flushStyle();
        }
    };

    return {
        addIcon,
        removeAllIcons,
        clearStyle,
        flushStyle: _flushStyle,
    };
};

/**
 * 创建文件上传的 FormData 对象
 */
const createForm = (path: string, isDir: boolean, file: Blob | any, stream?: boolean) => {
    const form = new FormData();
    form.append('path', path);
    form.append('isDir', isDir.toString());
    form.append('modTime', Math.floor(Date.now() / 1000).toString());
    
    if (file instanceof Blob && !stream) {
        form.append('file', file);
    } else {
        form.append('file', new Blob([file], { type: 'application/octet-stream' }));
    }

    return form;
};

/**
 * 上传文件并返回图标的 URL 地址
 */
const doUpload = async (file: File): Promise<IconUrl> => {
    const filename = file.name;
    const iconPath = `/data/public/custom-link-icons/${filename}`;
    const form = createForm(iconPath, false, file);
    
    await fetch('/api/file/putFile', {
        method: 'POST',
        body: form
    });
    
    return `/public/custom-link-icons/${filename}`;
};

/**
 * 上传自定义图标的界面
 * @param uploadCallback 上传成功后的回调函数,接收链接地址和图标的 URL 地址作为参数
 * @returns 包含上传界面元素的 HTMLElement 对象
 */
export const uploadCustomIcon = (uploadCallback: (hrefName: Href, url: IconUrl) => void): HTMLElement => {
    const div = document.createElement('div');
    div.className = 'custom-icon-upload';
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

    const hrefInput = div.querySelector('#website-href') as HTMLInputElement;
    const fileInput = div.querySelector('#icon-file') as HTMLInputElement;
    const filePreview = div.querySelector('#file-preview') as HTMLDivElement;
    const uploadButton = div.querySelector('#upload-button') as HTMLButtonElement;

    const updateUploadButtonState = () => {
        uploadButton.disabled = !(hrefInput.value.trim() && fileInput.files && fileInput.files.length > 0);
    };

    hrefInput.addEventListener('input', updateUploadButtonState);
    
    fileInput.addEventListener('change', () => {
        updateUploadButtonState();
        filePreview.innerHTML = '';
        
        if (fileInput.files?.[0]) {
            const file = fileInput.files[0];
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                Object.assign(img.style, {
                    maxWidth: '100px',
                    maxHeight: '100px'
                });
                filePreview.appendChild(img);
            } else {
                filePreview.textContent = `File selected: ${file.name}`;
            }
        }
    });

    uploadButton.addEventListener('click', async () => {
        if (fileInput.files?.[0]) {
            const file = fileInput.files[0];
            try {
                const iconUrl = await doUpload(file);
                uploadCallback(hrefInput.value.trim(), iconUrl);
                showMessage('Icon uploaded successfully!');
                hrefInput.value = '';
                fileInput.value = '';
                filePreview.innerHTML = '';
                updateUploadButtonState();
            } catch (error) {
                console.error('Upload failed:', error);
                showMessage('Upload failed. Please try again.');
            }
        }
    });

    return div;
};

/**
 * 管理自定义图标的界面
 * @param customIcons 包含自定义图标信息的数组,每个元素包含链接地址和图标的 URL 地址
 * @param updatedCustomIcons 自定义图标信息更新后的回调函数,接收更新后的自定义图标信息数组作为参数
 * @param closeCallback 关闭管理界面的回调函数
 * @returns 包含管理界面元素的 HTMLElement 对象
 */
export const manageCustomIcons = (
    customIcons: { href: string; iconUrl: string }[],
    updatedCustomIcons: (customIcons: { href: string; iconUrl: string }[]) => void,
    closeCallback: () => void
): HTMLElement => {
    const container = document.createElement('div');
    container.className = 'custom-icon-manager';

    customIcons = [...customIcons];

    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: '0 20px',
        gap: '15px',
    });

    const deleteList: string[] = [];

    /**
     * 创建一个表示自定义图标的元素
     * @param icon 包含链接地址和图标的 URL 地址的对象
     * @param index 图标在自定义图标信息数组中的索引
     * @returns 包含图标预览、链接地址输入框和删除按钮的 div 元素
     */
    const createIconElement = (icon: { href: string; iconUrl: string }, index: number) => {
        const iconElement = document.createElement('div');
        iconElement.className = 'custom-icon-item';
        Object.assign(iconElement.style, {
            display: 'flex',
            gap: '15px',
            alignItems: 'center',
        });
        iconElement.innerHTML = `
            <img src="${icon.iconUrl}" alt="Custom Icon" class="custom-icon-preview" style="height: 25px;">
            <input type="text" class="custom-icon-href" value="${icon.href}" style="flex: 1;">
            <button class="custom-icon-delete b3-button b3-button--outline">Delete</button>
        `;

        const hrefInput = iconElement.querySelector('.custom-icon-href') as HTMLInputElement;
        const deleteButton = iconElement.querySelector('.custom-icon-delete') as HTMLButtonElement;

        hrefInput.addEventListener('change', () => {
            customIcons[index].href = hrefInput.value;
        });

        deleteButton.addEventListener('click', () => {
            const icon = customIcons[index];
            deleteList.push(icon.iconUrl);
            customIcons.splice(index, 1);
            iconElement.remove();
        });

        return iconElement;
    };

    const renderIcons = () => {
        container.innerHTML = '';
        customIcons.forEach((icon, index) => {
            container.appendChild(createIconElement(icon, index));
        });
    };

    renderIcons();

    const saveButton = document.createElement('button');
    saveButton.className = 'b3-button b3-button--text';
    saveButton.textContent = 'Save Changes';
    saveButton.addEventListener('click', async () => {
        updatedCustomIcons([...customIcons]);
        
        const deleteTasks = deleteList.map(iconUrl => 
            fetch('/api/file/removeFile', {
                method: 'POST',
                body: JSON.stringify({
                    path: `/data${iconUrl}`
                })
            })
        );
        
        await Promise.all(deleteTasks);
        closeCallback();
        showMessage('Custom icons updated successfully!');
    });

    container.appendChild(saveButton);

    return container;
};