import { thisPlugin } from "@frostime/siyuan-plugin-kits";

const KEEP_N_CACHE_ITEM = 36 as const;

export const updateCacheFile = async (): Promise<void> => {
    let histories = listFromLocalStorage();
    if (!histories || histories.length === 0) return;

    histories.sort((a, b) => {
        if (a.updated && b.updated) {
            return b.updated - a.updated;
        }
        return b.timestamp - a.timestamp;
    });

    histories = histories.slice(0, KEEP_N_CACHE_ITEM);

    const plugin = thisPlugin();
    await plugin.saveBlob('gpt-chat-cache.json', histories);
};

export const restoreCache = async (): Promise<void> => {
    const plugin = thisPlugin();
    const blob = await plugin.loadBlob('gpt-chat-cache.json');
    const data = await blob?.text();
    if (!blob || !data) return;
    let histories: any[] | { code: number } = JSON.parse(data);
    if (!histories || (histories as { code: number }).code === 404) return;
    histories = histories as IChatSessionHistory[];
    if (histories.length === 0) return;
    histories.sort((a, b) => {
        if (a.updated && b.updated) {
            return b.updated - a.updated;
        }
        return b.timestamp - a.timestamp;
    });

    const isExist = (key: string): boolean => {
        return Object.keys(localStorage).some(k => k === key);
    };

    let kept = 0;
    for (let i = 0; i < histories.length && kept < KEEP_N_CACHE_ITEM; i++) {
        const key = `gpt-chat-${histories[i].id}`;
        if (!isExist(key)) {
            localStorage.setItem(key, JSON.stringify(histories[i]));
            kept++;
        }
    }
};

export const saveToLocalStorage = (history: IChatSessionHistory): void => {
    const historyWithType = { ...history, type: 'history' as const };
    const key = `gpt-chat-${history.id}`;
    localStorage.setItem(key, JSON.stringify(historyWithType));
};

export const listFromLocalStorage = (): IChatSessionHistory[] => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('gpt-chat-'));
    return keys.map(key => {
        const data = JSON.parse(localStorage.getItem(key));
        return { ...data, type: 'history' as const };
    });
};

export const removeFromLocalStorage = (id: string): void => {
    const key = `gpt-chat-${id}`;
    localStorage.removeItem(key);
};
