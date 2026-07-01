/**
 * Native quick card listener
 * Listens to SiYuan native quick make card and attaches SRS display metadata when needed.
 */
import type FMiscPlugin from "@/index";
import { CardType } from '@/types/srs';
import { createCard, getCardsByBlockId, refreshNativeCards } from '../../core/card-repository';
import { getBlockKramdown } from '@/api';
import { extractClozes } from '../creators/cloze';

let eventBusUnbind: (() => void) | null = null;

async function handleRiffCardEvent(event: any): Promise<void> {
    const detail = event.detail;
    if (!detail) return;
    const blockId = detail.blockId || detail.id;
    if (!blockId) return;
    try {
        await refreshNativeCards();
        const result = await getBlockKramdown(blockId);
        const kramdown = result?.kramdown || '';
        const existing = getCardsByBlockId(blockId);
        if (existing.length > 0) return;
        const clozes = extractClozes(kramdown);
        if (clozes.length > 0) {
            for (const cloze of clozes) {
                await createCard({
                    blockId, rootId: '', type: CardType.Cloze,
                    deckId: 'default', front: cloze.front, back: cloze.back,
                    clozeIndex: cloze.clozeIndex,
                });
            }
        } else {
            const content = kramdown.replace(/\n/g, ' ').trim();
            if (content) {
                await createCard({
                    blockId, rootId: '', type: CardType.QA,
                    deckId: 'default', front: '回忆以下内容：', back: content,
                });
            }
        }
    } catch (e) {
        console.error('[SRS-Cards] Native quick card listener error:', e);
    }
}

export function startNativeListener(plugin: FMiscPlugin): void {
    if (eventBusUnbind) return;
    const handler = (event: any) => handleRiffCardEvent(event);
    (plugin.eventBus as any).on('riffcard-created', handler);
    eventBusUnbind = () => (plugin.eventBus as any).off('riffcard-created', handler);
}

export function stopNativeListener(): void {
    if (eventBusUnbind) { eventBusUnbind(); eventBusUnbind = null; }
}
