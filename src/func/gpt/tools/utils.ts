const fs = window?.require?.('fs');
const path = window?.require?.('path');
const os = window?.require?.('os');

const MAX_LOG_NUMBER = 100 as const;

export const tempRoot = (): string => {
    return path.join(os.tmpdir(), 'siyuan_temp');
};

export const safeCreateDir = (dir: string): void => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

export interface ToolCallInfo {
    name: string;
    args: Record<string, any>;
}

const createTempfile = (
    toolKey: string,
    ext: string = 'log',
    content?: string,
    toolCallInfo?: ToolCallInfo
): string => {
    const tempDir = tempRoot();
    safeCreateDir(tempDir);
    const suffix = Math.random().toString(16).slice(2, 10);
    const filePath = path.join(tempDir, `${toolKey}_${Date.now()}_${suffix}.${ext}`);

    if (typeof content !== 'string') {
        content = JSON.stringify(content);
    }

    if (content !== undefined) {
        let finalContent = content;

        const args = toolCallInfo?.args || {};
        const argsString = Object.entries(args)
            .map(([key, value]) => `${key}:${JSON.stringify(value).length > 100 ? '\n' : ' '}${value}`)
            .join('\n');
        if (toolCallInfo) {
            const header = [
                `------ Tool Call: ${toolCallInfo.name} ------`,
                argsString,
                `------ Tool Call Result ------`,
                ''
            ].join('\n');
            finalContent = header + content;
        }

        fs.writeFileSync(filePath, finalContent, 'utf-8');
    }
    return filePath;
};

const createTempdir = (name: string, subfiles?: Record<string, string>): string => {
    const tempDir = path.join(tempRoot(), name);
    safeCreateDir(tempDir);

    if (subfiles) {
        Object.entries(subfiles).forEach(([filename, content]) => {
            const filePath = path.join(tempDir, filename);
            fs.writeFileSync(filePath, content, 'utf-8');
        });
    }

    return tempDir;
};


export const pruneOldTempToollogFiles = (): void => {
    if (!fs || !path || !os) {
        return;
    }
    const tempDir = tempRoot();
    if (!fs.existsSync(tempDir)) {
        return;
    }
    const files = fs.readdirSync(tempDir)
        .map(file => ({
            name: file,
            time: fs.statSync(path.join(tempDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
    if (files.length > MAX_LOG_NUMBER) {
        const filesToDelete = files.slice(MAX_LOG_NUMBER);
        filesToDelete.forEach(file => {
            fs.unlinkSync(path.join(tempDir, file.name));
        });
    }
}

export const DEFAULT_LIMIT_CHAR = 7000 as const;

export const normalizeLimit = (limit?: number, defaultLimit: number = DEFAULT_LIMIT_CHAR): number => {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
        return defaultLimit;
    }
    return limit <= 0 ? Number.POSITIVE_INFINITY : limit;
};

export interface TruncateResult {
    content: string;
    isTruncated: boolean;
    originalLength: number;
    shownLength: number;
    omittedLength: number;
}

export const truncateContent = (content: string, maxLength: number): TruncateResult => {
    if (!Number.isFinite(maxLength) || maxLength <= 0 || content.length <= maxLength) {
        return {
            content,
            isTruncated: false,
            originalLength: content.length,
            shownLength: content.length,
            omittedLength: 0
        };
    }

    const headLength = Math.floor(maxLength / 2);
    const tailLength = maxLength - headLength;
    const head = content.slice(0, headLength);
    const tail = content.slice(-tailLength);
    const omitted = content.length - maxLength;

    return {
        content: `${head}\n\n...输出过长，省略 ${omitted} 个字符...\n\n${tail}`,
        isTruncated: true,
        originalLength: content.length,
        shownLength: maxLength,
        omittedLength: omitted
    };
};


export interface ProcessToolOutputOptions {
    toolKey: string;
    content: string;
    toolCallInfo?: ToolCallInfo;
    truncateForLLM?: boolean | number;
}

export interface ProcessToolOutputResult {
    output: string;
    tempFilePath: string;
    isTruncated: boolean;
    originalLength: number;
    shownLength: number;
    omittedLength: number;
}

export const processToolOutput = (options: ProcessToolOutputOptions): ProcessToolOutputResult => {
    const {
        toolKey,
        content,
        toolCallInfo,
        truncateForLLM = false
    } = options;

    const tempFilePath = createTempfile(toolKey, 'log', content, toolCallInfo);

    const shouldProcessForLLM = truncateForLLM !== false;

    let maxLength: number;
    if (!shouldProcessForLLM) {
        maxLength = Number.POSITIVE_INFINITY;
    } else if (truncateForLLM === true) {
        maxLength = DEFAULT_LIMIT_CHAR;
    } else {
        maxLength = truncateForLLM;
    }

    const truncResult = truncateContent(content, maxLength);

    let output: string;
    if (shouldProcessForLLM) {
        const lines: string[] = [];

        if (toolCallInfo?.name) {
            lines.push(`工具: ${toolCallInfo.name}`);
        }

        lines.push(`完整输出已保存至: ${tempFilePath}`);
        lines.push(`原始长度: ${truncResult.originalLength} 字符`);

        if (truncResult.isTruncated) {
            lines.push(`显示长度: ${truncResult.shownLength} 字符 (省略了 ${truncResult.omittedLength} 字符)`);
        }

        lines.push('');
        lines.push(truncResult.content);

        output = lines.join('\n');
    } else {
        output = truncResult.content;
    }

    return {
        output,
        tempFilePath,
        isTruncated: truncResult.isTruncated,
        originalLength: truncResult.originalLength,
        shownLength: truncResult.shownLength,
        omittedLength: truncResult.omittedLength
    };
};

export const formatWithLineNumber = (
    content: string,
    startLine: number = 1,
    highlightLine?: number
): string => {
    const lines = content.split('\n');
    const maxLineNum = startLine + lines.length - 1;
    const padding = maxLineNum.toString().length;

    return lines.map((line, index) => {
        const lineNum = startLine + index;
        const isHighlight = highlightLine === lineNum;
        const prefix = isHighlight ? '→' : ' ';
        return `${prefix}${lineNum.toString().padStart(padding)}: ${line}`;
    }).join('\n');
};

export const formatFileSize = (size: number): string => {
    if (size < 1024) {
        return size.toFixed(2) + ' B';
    } else if (size < 1024 * 1024) {
        return (size / 1024).toFixed(2) + ' KB';
    } else if (size < 1024 * 1024 * 1024) {
        return (size / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
        return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
};
