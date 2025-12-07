import { isStrBlank } from "./string-util";

export const hasClosestBySelector = (
    element: Node,
    selector: string,
    top = false
): HTMLElement | false => {
    if (!element) {
        return false;
    }

    if (element.nodeType === 3) { // 文本节点
        element = element.parentElement;
    }

    let e = element as HTMLElement;
    let isClosest = false;
    // 当 top 为 true 时，遍历到 BODY 停止。 否则遍历到 protyle-wysiwyg 结束。
    while (e && !isClosest && (top ? e.tagName !== "BODY" : !e.classList.contains("protyle-wysiwyg"))) {
        if (e.matches(selector)) {
            isClosest = true;
        } else {
            e = e.parentElement;
        }
    }

    return isClosest ? e : false;
};

// 将字符串转换为 DOM 元素
export function stringToElement(htmlString): Element {
    if (isStrBlank(htmlString)) {
        return null;
    }
    try {
        // 使用 DOMParser 解析字符串
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        // 返回解析后的文档的根元素
        return doc.body.firstChild as Element;
    } catch {
        return null;
    }
}