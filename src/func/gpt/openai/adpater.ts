import { visualModel } from "../setting";
import { type complete } from "./complete";


/**
 * 用户自定义的预处理器, 可以在发送 complete 请求之前，对消息进行处理
 */
export const userCustomizedPreprocessor = {
    preprocess: (payload: {
        model: string;
        modelDisplayName: string;
        url: string;
        option: IChatOption;
    }) => {

    }
};

export const adpatInputMessage = (input: Parameters<typeof complete>[0], options: {
    model: string;
}): IMessage[] => {
    let messages: IMessage[] = [];
    if (typeof input === 'string') {
        messages = [{
            "role": "user",
            "content": input
        }];
    } else {
        const ALLOWED_FIELDS = ['role', 'content', 'tool_call_id', 'tool_calls'] as const;
        messages = input.map(item => {
            const result = {};
            Object.keys(item).forEach(key => {
                if (ALLOWED_FIELDS.includes(key as any)) {
                    result[key] = item[key];
                }
            });
            return result as IMessage;
        });
    }

    if (options) {
        const model = options?.model;
        if (!visualModel().includes(model)) {
            let hasImage = false;
            messages.forEach(item => {
                if (typeof item.content !== 'string') {
                    const content = item.content.filter(content => content.type === 'text');
                    hasImage = content.length !== item.content.length;
                    item.content = content;
                }
            });
            if (hasImage) {
                console.warn(`注意: 模型 ${model} 不支持图片消息!已在内部自动过滤图片信息。`);
            }
        }
    }

    return messages;
}

export const adaptChatOptions = (target: {
    chatOption: IChatOption;
    model: string;
    apiUrl: string
}): IChatOption => {
    let { model, apiUrl, chatOption } = target;

    const deleteIfEqual = (target: Record<string, any>, key: string, value = 0) => {
        if (target[key] === value) {
            delete target[key];
        }
    }

    chatOption = structuredClone(chatOption);
    Object.keys(chatOption).forEach(key => {
        if (chatOption[key] === null || chatOption[key] === undefined) {
            delete chatOption[key];
        }
    });

    deleteIfEqual(chatOption, 'frequency_penalty', 0);
    deleteIfEqual(chatOption, 'presence_penalty', 0);
    deleteIfEqual(chatOption, 'max_tokens', 0);
    deleteIfEqual(chatOption, 'top_p', 1);

    model = model.toLocaleLowerCase();

    const isDoubao = model.match(/doubao/);
    if (isDoubao) {
        if (chatOption.temperature > 1) {
            chatOption.temperature = 1;
        }
    }

    return chatOption;
}


export type TReference = {
    title?: string;
    url: string;
};

/**
 * Adapts various reference formats from API responses into a standardized format
 */
export const adaptResponseReferences = (responseData: any): TReference[] | undefined => {
    if (!responseData) return undefined;

    const mapper = (item: any): TReference | null => {
        if (item === null || item === undefined || item === '') return null;
        if (typeof item === 'string') {
            return { url: item, title: item };
        }
        if (item.url) {
            return {
                title: item.title || item.url,
                url: item.url
            };
        }
        return null;
    }

    const testExtract = (key: string) => {
        if (responseData[key] && Array.isArray(responseData[key])) {
            return responseData[key].map(mapper).filter(Boolean);
        }
        return undefined;
    }

    const keysToTry = ['references', 'citations'] as const;
    return keysToTry.map(key => testExtract(key)).find(result => result !== undefined);
}


/**
 * 处理响应消息，提取内容、推理内容和工具调用
 */
export const adaptResponseMessage = (message: Record<string, string>): {
    content: string;
    reasoning_content?: string;
    tool_calls?: IToolCallResponse[];
} => {
    const result: any = {
        content: message['content'] || '',
        reasoning_content: ''
    };

    if (message['reasoning_content']) {
        result.reasoning_content = message['reasoning_content'];
    } else if (message['reasoning']) {
        result.reasoning_content = message['reasoning'];
    }

    if (message['tool_calls']) {
        result.tool_calls = message['tool_calls'];
    }

    return result;
}

/**
 * 处理流式响应的数据块
 */
export const adaptChunkMessage = (messageInChoices: Record<string, any>): {
    content: string;
    reasoning_content?: string;
    tool_calls?: IToolCallResponse[];
} => {
    return adaptResponseMessage(messageInChoices);
}
