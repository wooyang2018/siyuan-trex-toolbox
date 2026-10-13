/**
 * Node 里没有 DOMParser。测试在导入元数据解析之前装上这个最小实现，
 * 只覆盖书签卡片会查询的 title / meta / link。
 */
class MetaElement {
    tag: string;
    attrs: Record<string, string>;
    textContent: string;

    constructor(tag: string, attrs: Record<string, string>, text: string) {
        this.tag = tag;
        this.attrs = attrs;
        this.textContent = text;
    }

    getAttribute(name: string): string | null {
        return this.attrs[name.toLowerCase()] ?? null;
    }

    matches(selector: string): boolean {
        const found = selector.match(/^([a-z]+)(?:\[([a-z:-]+)="([^"]*)"\])?$/i);
        if (!found) return false;
        if (this.tag !== found[1].toLowerCase()) return false;
        if (!found[2]) return true;
        return (this.attrs[found[2].toLowerCase()] || "") === found[3];
    }
}

class MetaDocument {
    title: string;
    nodes: MetaElement[];

    constructor(nodes: MetaElement[], title: string) {
        this.nodes = nodes;
        this.title = title;
    }

    querySelector(selector: string): MetaElement | null {
        return this.nodes.find((node) => node.matches(selector)) || null;
    }
}

function parseAttrs(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let found: RegExpExecArray | null;
    while ((found = re.exec(raw))) {
        attrs[found[1].toLowerCase()] = found[2] ?? found[3] ?? found[4] ?? "";
    }
    return attrs;
}

class TestDOMParser {
    parseFromString(html: string): MetaDocument {
        const nodes: MetaElement[] = [];
        let title = "";
        const re = /<\s*(meta|link|title)\b([^>]*?)\/?\s*>(?:([\s\S]*?)<\/\s*\1\s*>)?/gi;
        let found: RegExpExecArray | null;
        while ((found = re.exec(html))) {
            const tag = found[1].toLowerCase();
            const el = new MetaElement(tag, parseAttrs(found[2] || ""), (found[3] || "").trim());
            nodes.push(el);
            if (tag === "title" && !title) title = el.textContent;
        }
        return new MetaDocument(nodes, title);
    }
}

if (typeof globalThis.DOMParser === "undefined") {
    (globalThis as unknown as { DOMParser: typeof TestDOMParser }).DOMParser = TestDOMParser;
}
