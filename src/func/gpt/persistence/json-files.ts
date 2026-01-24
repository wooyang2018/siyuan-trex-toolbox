import { thisPlugin, api, matchIDFormat, confirmDialog, formatDateTime } from "@frostime/siyuan-plugin-kits";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { adaptIMessageContentGetter } from "@gpt/data-utils";

const rootName = 'chat-history' as const;
const SNAPSHOT_FILE = 'chat-history-snapshot.json' as const;
const SNAPSHOT_SCHEMA = '1.0' as const;
const PREVIEW_LENGTH = 500 as const;

export const updateHistoryFileMetadata = async (
    id: IChatSessionHistory['id'],
    metadata: Partial<Pick<IChatSessionHistory, 'title' | 'tags' | 'timestamp' | 'updated'>>,
    updateSnapshot: boolean = true
): Promise<void> => {
    const ALLOWED_KEYS = ['title', 'tags', 'timestamp', 'updated'];
    const history = await getFromJson(id);
    if (!history) {
        console.warn(`History with ID ${id} not found.`);
        return;
    }
    Object.keys(metadata).forEach(key => {
        if (ALLOWED_KEYS.includes(key)) {
            history[key] = metadata[key];
        } else {
            console.warn(`Key ${key} is not allowed to update.`);
        }
    });
    await saveToJson(history, updateSnapshot);
};

interface IVersionCheckResult {
    hasConflict: boolean;
    currentVersion?: number;
    snapshotVersion?: number;
}

const checkVersionConflict = async (
    sessionId: string,
    currentUpdated?: number
): Promise<IVersionCheckResult> => {
    const snapshot = await readSnapshot();
    const snapshotSession = snapshot?.sessions.find(s => s.id === sessionId);
    const snapshotUpdated = snapshotSession?.updated;

    if (currentUpdated && snapshotUpdated && currentUpdated < snapshotUpdated) {
        return {
            hasConflict: true,
            currentVersion: currentUpdated,
            snapshotVersion: snapshotUpdated
        };
    }

    return { hasConflict: false };
};

const showVersionConflictDialog = async (
    conflictInfo: IVersionCheckResult
): Promise<boolean> => {
    return new Promise((resolve) => {
        confirmDialog({
            title: "版本冲突警告",
            content: `
检测到版本冲突：

当前要保存的版本：${formatDateTime('yyyy-MM-dd HH:mm:ss', new Date(conflictInfo.currentVersion))}
已存档的版本：${formatDateTime('yyyy-MM-dd HH:mm:ss', new Date(conflictInfo.snapshotVersion))}

当前版本比已存档版本要旧，保存可能会覆盖较新的数据。

是否确认保存？
            `.trim(),
            confirm: () => resolve(true),
            cancel: () => resolve(false)
        });
    });
};

export const saveToJson = async (history: IChatSessionHistory, updateSnapshot: boolean = true): Promise<void> => {
    if (history.updated) {
        const versionCheckResult = await checkVersionConflict(history.id, history.updated);
        if (versionCheckResult.hasConflict) {
            const userConfirmed = await showVersionConflictDialog(versionCheckResult);
            if (!userConfirmed) {
                return;
            }
        }
    }

    const plugin = thisPlugin();
    const filepath = `${rootName}/${history.id}.json`;
    await plugin.saveData(filepath, { ...history });

    if (updateSnapshot) {
        await updateSessionInSnapshot(history);
    }
};

export const tryRecoverFromJson = async (filePath: string): Promise<any> => {
    const blob = await api.getFileBlob(filePath);
    if (!blob) {
        return null;
    }
    try {
        const text = await blob.text();
        return JSON.parse(text);
    } catch (e) {
        console.warn(`Failed to parse json file: ${filePath}`, e);
        return null;
    }
};

export const listFromJsonSnapshot = async (): Promise<IChatSessionSnapshot[]> => {
    let snapshot = await readSnapshot();

    if (!snapshot || snapshot.schema !== SNAPSHOT_SCHEMA) {
        snapshot = await rebuildHistorySnapshot();
    }

    return snapshot.sessions;
};

export const listFromJsonFull = async (): Promise<IChatSessionHistory[]> => {
    return await listFromJsonLegacy();
};

export const getFromJson = async (id: string): Promise<IChatSessionHistory> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${rootName}/`;
    const filepath = `${dir}${id}.json`;
    const content = await tryRecoverFromJson(filepath);
    return content as IChatSessionHistory;
};

export const removeFromJson = async (id: string): Promise<void> => {
    const plugin = thisPlugin();
    const filepath = `${rootName}/${id}.json`;
    await plugin.removeData(filepath);
    await removeSessionFromSnapshot(id);
};

/**
 * 生成单个会话的快照数据
 */
const generateSessionSnapshot = (history: IChatSessionHistory): IChatSessionSnapshot => {
    // 过滤出真正的消息项
    const messageItems = history.items.filter(item =>
        item.type === 'message' && item.message?.content
    );

    // 提取预览内容
    const previewParts: string[] = [];
    let totalLength = 0;

    for (const item of messageItems.slice(0, 3)) { // 只取前3条消息
        const { text } = adaptIMessageContentGetter(item.message.content);
        const authorPrefix = `${item.author || 'unknown'}: `;
        const contentToAdd = authorPrefix + text.replace(/\n/g, ' ').trim();

        if (totalLength + contentToAdd.length > PREVIEW_LENGTH) {
            const remainingLength = PREVIEW_LENGTH - totalLength;
            if (remainingLength > authorPrefix.length) {
                previewParts.push(contentToAdd.substring(0, remainingLength) + '...');
            }
            break;
        }

        previewParts.push(contentToAdd);
        totalLength += contentToAdd.length;
    }

    // 获取最后一条消息信息
    const lastMessage = messageItems[messageItems.length - 1];

    return {
        type: 'snapshot',
        id: history.id,
        title: history.title,
        timestamp: history.timestamp,
        updated: history.updated,
        tags: history.tags,
        preview: previewParts.join('\n'),
        messageCount: messageItems.length,
        lastMessageAuthor: lastMessage?.author || 'unknown',
        lastMessageTime: lastMessage?.timestamp || history.timestamp
    };
};


export const snapshotSignal = createSignalRef<IHistorySnapshot | null>(null);

const readSnapshot = async (): Promise<IHistorySnapshot | null> => {
    try {
        const dir = `data/storage/petal/${thisPlugin().name}/`;
        const content = await tryRecoverFromJson(`${dir}${SNAPSHOT_FILE}`);
        snapshotSignal.value = content as IHistorySnapshot;
        return content as IHistorySnapshot;
    } catch (e) {
        console.warn('Failed to read snapshot file:', e);
        return null;
    }
};

const writeSnapshot = async (snapshot: IHistorySnapshot): Promise<void> => {
    snapshotSignal.value = snapshot;
    const plugin = thisPlugin();
    await plugin.saveData(SNAPSHOT_FILE, snapshot);
};

export const rebuildHistorySnapshot = async (): Promise<IHistorySnapshot> => {
    console.log('Rebuilding history snapshot...');
    const histories = await listFromJsonLegacy();

    const sessions = histories.map(generateSessionSnapshot);

    const snapshot: IHistorySnapshot = {
        schema: SNAPSHOT_SCHEMA,
        lastUpdated: Date.now(),
        sessions: sessions.sort((a, b) => {
            const aTime = a.updated || a.timestamp;
            const bTime = b.updated || b.timestamp;
            return bTime - aTime;
        })
    };

    await writeSnapshot(snapshot);
    return snapshot;
};

export const updateSessionInSnapshot = async (history: IChatSessionHistory): Promise<void> => {
    let snapshot = await readSnapshot();

    if (!snapshot) {
        snapshot = await rebuildHistorySnapshot();
        return;
    }

    const sessionSnapshot = generateSessionSnapshot(history);
    const existingIndex = snapshot.sessions.findIndex(s => s.id === history.id);

    if (existingIndex >= 0) {
        snapshot.sessions[existingIndex] = sessionSnapshot;
    } else {
        snapshot.sessions.unshift(sessionSnapshot);
    }

    snapshot.sessions.sort((a, b) => {
        const aTime = a.updated || a.timestamp;
        const bTime = b.updated || b.timestamp;
        return bTime - aTime;
    });

    snapshot.lastUpdated = Date.now();
    await writeSnapshot(snapshot);
};

export const updateSnapshotSession = async (sessionSnapshot: IChatSessionSnapshot): Promise<void> => {
    let snapshot = await readSnapshot();

    if (!snapshot) {
        snapshot = await rebuildHistorySnapshot();
        return;
    }

    const existingIndex = snapshot.sessions.findIndex(s => s.id === sessionSnapshot.id);

    if (existingIndex >= 0) {
        snapshot.sessions[existingIndex] = sessionSnapshot;
    } else {
        snapshot.sessions.unshift(sessionSnapshot);
    }

    snapshot.sessions.sort((a, b) => {
        const aTime = b.updated || b.timestamp;
        const bTime = a.updated || a.timestamp;
        return bTime - aTime;
    });

    await writeSnapshot(snapshot);
};

const removeSessionFromSnapshot = async (sessionId: string): Promise<void> => {
    const snapshot = await readSnapshot();
    if (!snapshot) return;

    snapshot.sessions = snapshot.sessions.filter(s => s.id !== sessionId);
    snapshot.lastUpdated = Date.now();
    await writeSnapshot(snapshot);
};

const listFromJsonLegacy = async (): Promise<IChatSessionHistory[]> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${rootName}/`;
    const files = await api.readDir(dir);
    if (!files) return [];

    let filename = files.filter(f => !f.isDir).map(f => f.name).filter(f => f.endsWith('.json'));
    filename = filename.filter(f => {
        const name = f.split('.').slice(0, -1);
        return matchIDFormat(name[0]);
    });

    const promises = filename.map(async f => {
        const content = await tryRecoverFromJson(`${dir}${f}`);
        if (!content) return null;
        return content;
    });
    const storages: any[] = await Promise.all(promises);
    return storages.filter(s => s) as IChatSessionHistory[];
};
