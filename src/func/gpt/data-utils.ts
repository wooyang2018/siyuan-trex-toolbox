import { assembleContext2Prompt } from "./context-provider";
import { formatSingleItem } from "./persistence";

/**
 * 解析获取 content 的内容，返回 text 和 images 两个部分
 */
export const adaptIMessageContentGetter = (content: TMessageContent) => {
    if (typeof content === 'string') {
        return {
            'text': content,
            'images': null
        }
    }

    return {
        'text': content.filter((item) => item.type === 'text').map((item) => item.text).join('\n'),
        'images': content.filter((item) => item.type === 'image_url').map((item) => item.image_url?.url)
    }
}


export const adaptIMessageContentSetter = (content: TMessageContent, text: string): TMessageContent => {
    if (typeof content === 'string') {
        return text;
    }

    const newContent: TMessageContent = content.map((item) => {
        if (item.type === 'text') {
            return { ...item, text: text };
        }
        return item;
    });

    if (!newContent.some(item => item.type === 'text')) {
        newContent.push({ type: 'text', text: text });
    }

    return newContent;
}

/**
 * 向 IMessage content 追加文本内容
 */
export const adaptIMessageContentAppender = (content: IMessage['content'], appendText: string): IMessage['content'] => {
    if (typeof content === 'string') {
        return content + appendText;
    }

    return [
        ...content,
        {
            type: 'text' as const,
            text: appendText
        }
    ];
}

export const convertImgsToBase64Url = async (images: Blob[]): Promise<IMessageContent[]> => {
    return await Promise.all(images.map(async (image) => {
        const base64data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(image);
        });
        return {
            type: "image_url",
            image_url: {
                url: `data:image/jpeg;base64,${base64data}`
            }
        } as IMessageContent;
    }));
};


export const mergeMultiVesion = (item: IChatSessionMsgItem): string => {
    const allVersions = Object.values(item.versions || {});
    if (!allVersions.length) return adaptIMessageContentGetter(item.message.content).text;
    let mergedContent = '以下是对同一个问题的不同回复:\n\n';
    allVersions.forEach((v, index) => {
        if (v.content) {
            mergedContent += formatSingleItem(
                item.message.role.toUpperCase(),
                adaptIMessageContentGetter(v.content).text, {
                version: (index + 1).toString(),
                author: v.author
            }
            );
            mergedContent += '\n\n';
        }
    });
    return mergedContent;
}


/**
 * 将当前 `message` 存储到 `versions` 中，并生成一个新的版本 ID。
 * 如果 `currentVersion` 已存在，则使用它作为版本 ID；否则生成一个新的版本 ID（例如使用时间戳）。
 */
export const stageMsgItemVersion = (item: IChatSessionMsgItem, version?: string): IChatSessionMsgItem => {
    if (item.message) {
        const versionId = version ?? (item.currentVersion ?? Date.now().toString());
        item.versions = item.versions || {};
        item.versions[versionId] = {
            content: item.message.content,
            reasoning_content: item.message.reasoning_content || '',
            author: item.author,
            timestamp: item.timestamp,
            token: item.token,
            time: item.time
        };
        item.currentVersion = versionId;
    }
    return item;
};

/**
 * 将 `versions` 中的某个版本应用到当前 `message`。
 * 更新 `message` 的内容、作者、时间戳和 token 为选中版本的值。
 */
export const applyMsgItemVersion = (item: IChatSessionMsgItem, version: string): IChatSessionMsgItem => {
    if (item.versions && item.versions[version]) {
        const selectedVersion = item.versions[version];
        item.message.content = selectedVersion.content;
        if (selectedVersion.reasoning_content) {
            item.message.reasoning_content = selectedVersion.reasoning_content;
        } else if (item.message.reasoning_content) {
            item.message.reasoning_content = '';
        }
        selectedVersion.author && (item.author = selectedVersion.author);
        selectedVersion.timestamp && (item.timestamp = selectedVersion.timestamp);
        selectedVersion.token && (item.token = selectedVersion.token);
        selectedVersion.time && (item.time = selectedVersion.time);
        item.currentVersion = version;
    }
    return item;
};


export const isMsgItemWithMultiVersion = (item: IChatSessionMsgItem): boolean => {
    return item.versions !== undefined && Object.keys(item.versions).length > 1;
}

export const mergeInputWithContext = (input: string, contexts: IProvidedContext[]) => {
    const result = {
        content: input,
        userPromptSlice: [0, input.length] as [number, number]
    }
    if (contexts && contexts?.length > 0) {
        const prompts = assembleContext2Prompt(contexts);
        if (prompts) {
            const contextLength = prompts.length + 2;
            result.userPromptSlice = [contextLength, contextLength + input.length];
            result.content = `${prompts}\n\n${input}`;
        }
    }
    return result;
}
