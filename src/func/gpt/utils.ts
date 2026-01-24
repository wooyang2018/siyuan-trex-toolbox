import { sql } from "@/api";

export const addScript = (path: string, id: string): Promise<boolean> => {
    return new Promise((resolve) => {
        if (document.getElementById(id)) {
            resolve(false);
            return false;
        }
        const scriptElement = document.createElement("script");
        scriptElement.src = path;
        scriptElement.async = true;
        document.head.appendChild(scriptElement);
        scriptElement.onload = () => {
            if (document.getElementById(id)) {
                scriptElement.remove();
                resolve(false);
                return false;
            }
            scriptElement.id = id;
            resolve(true);
        };
    });
};


export const addStyle = (url: string, id: string): void => {
    if (!document.getElementById(id)) {
        const styleElement = document.createElement("link");
        styleElement.id = id;
        styleElement.rel = "stylesheet";
        styleElement.type = "text/css";
        styleElement.href = url;
        const pluginsStyle = document.querySelector("#pluginsStyle");
        if (pluginsStyle) {
            pluginsStyle.before(styleElement);
        } else {
            document.getElementsByTagName("head")[0].appendChild(styleElement);
        }
    }
};

/**
 * Converts GPT-style math formulas to Markdown format
 * - Converts inline formulas from \(...\) to $...$
 * - Converts block formulas from \[...\] to $$...$$
 */
export const convertMathFormulas = (text: string): string => {
    let result = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
        return `\n$$\n${formula.trim()}\n$$\n`;
    });

    result = result.replace(/\\\((.*?)\\\)/g, (match, formula) => {
        return `$${formula.trim()}$`;
    });

    return result;
}


export const id2block = async (...ids: BlockId[]): Promise<Block[]> => {
    const idList = ids.map((id) => `'${id}'`);
    const sqlCode = `select * from blocks where id in (${idList.join(",")})`;
    const data = await sql(sqlCode);
    return data;
}
