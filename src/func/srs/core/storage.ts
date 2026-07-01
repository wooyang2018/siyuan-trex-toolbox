/**
 * SRS Core — Storage layer
 * Handles persistence for plugin settings, queues, drill logs and review logs.
 * Flashcards themselves are stored exclusively in SiYuan native riffcard decks.
 */
import type FMiscPlugin from '@/index';
import type {
    SRSQueue,
    SRSSettings,
    ReviewLogEntry,
} from '@/types/srs';
import { DEFAULT_SRS_SETTINGS } from '@/types/srs';

// ===== Storage keys =====
const STORAGE_KEYS = {
    queues: 'srs-queues.json',
    settings: 'srs-settings.json',
    reviewLog: 'srs-review-log.json',
} as const;

// ===== Plugin ref =====
let pluginRef: FMiscPlugin | null = null;

export function setPlugin(plugin: FMiscPlugin): void {
    pluginRef = plugin;
}

export function getPlugin(): FMiscPlugin | null {
    return pluginRef;
}

export function requirePlugin(): FMiscPlugin {
    if (!pluginRef) {
        throw new Error('[SRS] Plugin not initialized');
    }
    return pluginRef;
}

// ===== Generic load/save =====
async function loadData<T>(key: string): Promise<T | null> {
    if (!pluginRef) {
        console.error('[SRS] loadData: plugin not ready');
        return null;
    }
    const raw = await pluginRef.loadData(key);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function saveData(key: string, data: unknown): Promise<void> {
    if (!pluginRef) {
        console.error('[SRS] saveData: plugin not ready');
        return;
    }
    await pluginRef.saveData(key, data);
}

// ===== Queues =====
export async function loadQueues(): Promise<Record<string, SRSQueue>> {
    const data = await loadData<Record<string, SRSQueue>>(STORAGE_KEYS.queues);
    return data ?? {};
}

export async function saveQueues(queues: Record<string, SRSQueue>): Promise<void> {
    await saveData(STORAGE_KEYS.queues, queues);
}

// ===== Settings =====
export async function loadSettings(): Promise<SRSSettings> {
    const data = await loadData<Partial<SRSSettings>>(STORAGE_KEYS.settings);
    if (!data) return { ...DEFAULT_SRS_SETTINGS };
    return { ...DEFAULT_SRS_SETTINGS, ...data };
}

export async function saveSettings(settings: SRSSettings): Promise<void> {
    await saveData(STORAGE_KEYS.settings, settings);
}

// ===== Review Log (for FSRS optimizer) =====
export async function loadReviewLog(): Promise<ReviewLogEntry[]> {
    const data = await loadData<ReviewLogEntry[]>(STORAGE_KEYS.reviewLog);
    return Array.isArray(data) ? data : [];
}

export async function saveReviewLog(log: ReviewLogEntry[]): Promise<void> {
    await saveData(STORAGE_KEYS.reviewLog, log);
}

// ===== Utility =====

/**
 * Get today's review date boundary (based on dayStartHour setting).
 * Returns a timestamp; cards with nextReview < this timestamp are "due today".
 */
export function getTodayBoundary(dayStartHour: number): number {
    const now = new Date();
    const boundary = new Date(now);
    boundary.setHours(dayStartHour, 0, 0, 0);
    if (now.getHours() < dayStartHour) {
        boundary.setDate(boundary.getDate() - 1);
    }
    return boundary.getTime();
}
