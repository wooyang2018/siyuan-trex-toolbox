/**
 * Auto card creation - monitors editing and auto-creates cards
 */
import type FMiscPlugin from "@/index";
import type { AutoCardConfig, AutoCardPattern } from './types';
import { createCard } from '../core/card-repository';
import { getBlockKramdown } from '@/api';

let autoConfig: AutoCardConfig = { enabled: false, patterns: [] };
let eventBusUnbind: (() => void) | null = null;
let processingBlocks: Set<string> = new Set();

async function handleEditEvent(event: any): Promise<void> {
    if (!autoConfig.enabled || autoConfig.patterns.length === 0) return;
    const detail = event.detail;
    if (!detail?.data || !Array.isArray(detail.data)) return;
    for (const op of detail.data) {
        if (op.action !== 'update') continue;
        const blockId = op.id;
        if (!blockId || processingBlocks.has(blockId)) continue;
        processingBlocks.add(blockId);
        try {
            await new Promise(r => setTimeout(r, 500));
            const result = await getBlockKramdown(blockId);
            const kramdown = result?.kramdown || '';
            for (const pattern of autoConfig.patterns) {
                if (!pattern.active) continue;
                if (new RegExp(pattern.pattern, 'g').test(kramdown)) {
                    await createCard({
                        blockId, rootId: '', type: pattern.cardType,
                        deckId: 'default', front: kramdown.slice(0, 200), back: kramdown,
                    });
                    break;
                }
            }
        } catch (e) {
            console.error('[SRS-Cards] Auto card error:', e);
        } finally {
            processingBlocks.delete(blockId);
        }
    }
}

export function startAutoCard(plugin: FMiscPlugin): void {
    if (eventBusUnbind) return;
    const handler = (event: any) => handleEditEvent(event);
    (plugin.eventBus as any).on('protyle-change', handler);
    eventBusUnbind = () => (plugin.eventBus as any).off('protyle-change', handler);
}

export function stopAutoCard(): void {
    if (eventBusUnbind) { eventBusUnbind(); eventBusUnbind = null; }
}

export function updateAutoConfig(config: Partial<AutoCardConfig>): void {
    autoConfig = { ...autoConfig, ...config };
}

export function getAutoConfig(): AutoCardConfig { return { ...autoConfig }; }
export function addPattern(pattern: AutoCardPattern): void { autoConfig.patterns.push(pattern); }
export function removePattern(id: string): void { autoConfig.patterns = autoConfig.patterns.filter(p => p.id !== id); }
