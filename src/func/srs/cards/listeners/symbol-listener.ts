/**
 * Symbol listener - monitors block content changes and auto-creates cards
 */
import type FMiscPlugin from "@/index";
import type { SymbolListenerConfig } from '../types';
import { extractClozes } from '../creators/cloze';
import { createCard } from '../../core/card-repository';
import { CardType } from '@/types/srs';
import { getBlockKramdown } from '@/api';

let listenerConfig: SymbolListenerConfig = {
    enabled: false,
    symbols: ['==', '@@'],
    headingEnabled: false,
};

let eventBusUnbind: (() => void) | null = null;
let processingBlocks: Set<string> = new Set();

async function handleBlockChange(event: any): Promise<void> {
    if (!listenerConfig.enabled) return;
    const detail = event.detail;
    if (!detail?.data || !Array.isArray(detail.data)) return;
    for (const op of detail.data) {
        if (op.action !== 'update' && op.action !== 'insert') continue;
        const blockId = op.id;
        if (!blockId || processingBlocks.has(blockId)) continue;
        processingBlocks.add(blockId);
        try {
            await new Promise(r => setTimeout(r, 300));
            const result = await getBlockKramdown(blockId);
            const kramdown = result?.kramdown || '';
            if (!listenerConfig.headingEnabled) {
                if (/^#{1,6}\s/.test(kramdown.trim())) continue;
            }
            const clozes = extractClozes(kramdown, listenerConfig.symbols);
            for (const cloze of clozes) {
                await createCard({
                    blockId, rootId: '', type: CardType.Cloze,
                    deckId: 'default', front: cloze.front, back: cloze.back,
                    clozeIndex: cloze.clozeIndex,
                });
            }
        } catch (e) {
            console.error('[SRS-Cards] Symbol listener error:', e);
        } finally {
            processingBlocks.delete(blockId);
        }
    }
}

export function startListener(plugin: FMiscPlugin): void {
    if (eventBusUnbind) return;
    const handler = (event: any) => handleBlockChange(event);
    (plugin.eventBus as any).on('protyle-change', handler);
    eventBusUnbind = () => (plugin.eventBus as any).off('protyle-change', handler);
}

export function stopListener(): void {
    if (eventBusUnbind) { eventBusUnbind(); eventBusUnbind = null; }
}

export function updateConfig(config: Partial<SymbolListenerConfig>): void {
    listenerConfig = { ...listenerConfig, ...config };
}

export function getConfig(): SymbolListenerConfig {
    return { ...listenerConfig };
}
