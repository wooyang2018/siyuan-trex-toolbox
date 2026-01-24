import { defaultModelId, useModel } from "../setting/store";
import { appendLog } from "../MessageLogger";
import { adpatInputMessage, adaptChatOptions, adaptResponseReferences, TReference, userCustomizedPreprocessor, adaptChunkMessage, adaptResponseMessage } from './adpater';

interface StreamChunkData {
    content: string;
    reasoning_content: string;
    references?: TReference[];
    tool_calls?: IToolCallResponse[];
    usage?: {
        completion_tokens: number;
        prompt_tokens: number;
        total_tokens: number;
    };
}

const buildReferencesText = (refers: CompletionResponse['references']): string => {
    if (!refers) return '';
    return '**References**:\n' + refers.filter(ref => Boolean(ref.url)).map((ref, index) => {
        return `${index + 1}. [${ref.title || ref.url}](${ref.url})`;
    }).join('\n');
}

const handleStreamChunk = (line: string): (StreamChunkData | { usage: any }) | null => {
    appendLog({ type: 'chunk', data: line });
    if (line.includes('[DONE]') || !line.startsWith('data:')) {
        return null;
    }

    try {
        const responseData = JSON.parse(line.slice(5).trim());
        if (responseData.error && !responseData.choices) {
            const error = `**[Error]** \`\`\`json\n${JSON.stringify(responseData.error)}\`\`\``;
            return {
                content: error,
                reasoning_content: ''
            };
        }

        const result = {
            content: '',
            reasoning_content: '',
            usage: null
        };

        if (responseData.usage) {
            result['usage'] = responseData.usage;
        }
        result['references'] = adaptResponseReferences(responseData);

        if (responseData.choices && responseData.choices.length > 0) {
            const delta = responseData.choices[0].delta || {};
            return {...result, ...adaptChunkMessage(delta)};
        }
        return result;
    } catch (e) {
        console.warn('Failed to parse stream data:', e);
        return null;
    }
}

const handleStreamResponse = async (
    response: Response,
    options: NonNullable<Parameters<typeof complete>[1]> & { t0: number }
): Promise<CompletionResponse> => {
    if (!response.body) {
        throw new Error('Response body is null');
    }

    const responseContent: CompletionResponse = {
        content: '',
        reasoning_content: '',
        usage: null,
        time: {
            latency: null,
            throughput: null
        },
        tool_calls: [],
    };

    let references: TReference[] = null;


    const transformStream = new TransformStream({
        transform: (chunk: string, controller) => {
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            lines.forEach(line => {
                const result = handleStreamChunk(line);
                if (result) {
                    controller.enqueue(result);
                }
            });
        }
    });

    const stream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(transformStream);

    const reader = stream.getReader();
    const checkAbort = options?.abortControler?.signal
        ? () => options.abortControler.signal.aborted
        : () => false;

    let t1 = null;

    const toolCallsMap = new Map<number, IToolCallResponse>();

    try {
        while (true) {
            const readResult = await reader.read();
            if (!t1) t1 = new Date().getTime();
            if (readResult.done) break;

            if (checkAbort()) {
                await reader.cancel();
                responseContent.content += `\n **[Error]** Request aborted`;
                break;
            }

            if ('usage' in readResult.value && readResult.value.usage) {
                responseContent.usage = readResult.value.usage;
            }

            const { content, reasoning_content, tool_calls } = readResult.value as StreamChunkData;

            if (content) {
                responseContent.content += content;
            }

            if (reasoning_content) {
                responseContent.reasoning_content += reasoning_content;
            }

            if (tool_calls) {
                tool_calls.forEach(call => {
                    if (toolCallsMap.has(call.index)) {
                        const existing = toolCallsMap.get(call.index);
                        existing.function.arguments += call.function.arguments;
                    } else {
                        toolCallsMap.set(call.index, { ...call });
                    }
                });
                responseContent.tool_calls = Array.from(toolCallsMap.values());
            }

            let streamingMsg = '';
            if (responseContent.reasoning_content) {
                streamingMsg += `<think>\n${responseContent.reasoning_content}\n</think>\n`;
            }
            if (responseContent.content) {
                streamingMsg += responseContent.content;
            }

            options.streamMsg?.(streamingMsg, responseContent.tool_calls);

            const refers = adaptResponseReferences(readResult.value as StreamChunkData);
            if (refers) {
                references = references || [];
                refers.forEach(ref => {
                    if (!references.some(existing => existing.url === ref.url)) {
                        references.push(ref);
                    }
                });
            }
        }
    } catch (error) {
        responseContent.content += `\n **[Error]** ${error}`;
        responseContent.ok = false;
    }
    const t2 = new Date().getTime();

    responseContent['time'] = {
        latency: t1 - options.t0,
    }

    if (responseContent['usage']?.completion_tokens) {
        const completion_tokens = responseContent['usage'].completion_tokens;
        const seconds = (t2 - t1) / 1000;
        responseContent['time'].throughput = completion_tokens / seconds;
    }

    if (references && references.length) {
        responseContent.content += '\n\n' + buildReferencesText(references);
    }

    return responseContent;
}

const handleNormalResponse = async (response: Response, options: { t0: number }): Promise<CompletionResponse> => {
    const data = await response.json();
    const t1 = new Date().getTime();
    const latency = t1 - options.t0;

    appendLog({ type: 'response', data });
    if (data.error && !data.data) {
        return {
            usage: null,
            content: JSON.stringify(data.error),
            reasoning_content: '',
            ok: false
        };
    }

    const results = adaptResponseMessage(data.choices[0].message) as CompletionResponse;
    results.usage = data.usage;

    const references = adaptResponseReferences(data);
    if (references && references.length) {
        results.content += '\n\n' + buildReferencesText(references);
    }
    results['time'] = {
        latency
    }
    if (data.usage?.completion_tokens) {
        const completion_tokens = data.usage.completion_tokens;
        const seconds = completion_tokens / 1000;
        results['time'].throughput = completion_tokens / seconds;
    }

    return results;
}


export const complete = async (input: string | IMessage[], options?: {
    model?: IGPTModel,
    systemPrompt?: string,
    stream?: boolean,
    streamMsg?: (msg: string, toolCalls?: IToolCallResponse[]) => void,
    streamInterval?: number,
    option?: IChatOption
    abortControler?: AbortController
}): Promise<CompletionResponse> => {

    let response: Response;

    try {
        const { url, model, apiKey, modelToUse } = options?.model ?? useModel(defaultModelId() || 'siyuan');
        const messages = adpatInputMessage(input, { model });

        if (options?.systemPrompt) {
            messages.unshift({
                role: "system",
                content: options.systemPrompt
            });
        }

        let chatOption = options?.option ?? {};
        chatOption = adaptChatOptions({
            chatOption,
            model,
            apiUrl: url
        });

        if (options?.stream !== undefined) {
            chatOption.stream = options.stream;
        }

        const chatInputs = {
            model: modelToUse || model,
            modelDisplayName: model,
            url: url,
            option: chatOption
        }

        if (options.stream) {
            chatInputs.option.stream_options = {
                include_usage: true
            };
        }


        if (userCustomizedPreprocessor?.preprocess) {
            userCustomizedPreprocessor.preprocess(chatInputs);
        }


        const payload = {
            model: chatInputs.model,
            messages: messages,
            ...chatInputs.option
        };

        appendLog({ type: 'request', data: payload });

        const t0 = new Date().getTime();

        response = await fetch(chatInputs.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(payload),
            signal: options?.abortControler?.signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            if (errorData) {
                appendLog({ type: 'response', data: errorData });
                return {
                    usage: null,
                    content: JSON.stringify(errorData)
                }
            } else {
                const data = await response.text().catch(() => '');
                return {
                    usage: null,
                    content: `[Error] HTTP error! status: ${response.status}\n${data}`,
                    ok: false
                }
            }
        }

        return options?.stream
            ? handleStreamResponse(response, {...options, t0})
            : handleNormalResponse(response, { t0 });

    } catch (error) {
        return {
            content: `[Error] Failed to request openai api, ${error}`,
            usage: null,
            ok: false
        };
    }
}