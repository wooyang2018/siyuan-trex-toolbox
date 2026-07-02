import { createSignal, Show, For, onMount, onCleanup, createMemo, createEffect } from 'solid-js';
import type { ParsedFlashcard } from '../card-parser';
import { parseFlashcard } from '../card-parser';
import { CardType } from '@/types/srs';
import { FlashcardRenderer } from './FlashcardRenderer';
import { CardMapRail } from './CardMapRail';
import { ViewerSummary } from './ViewerSummary';
import { refreshNativeCards, getCardsByDeckId, getAllCards } from '../../core/card-repository';
import { getRiffDecks, sql, getBlockKramdown, getBlockAttrs, lsNotebooks } from '@/api';

interface DeckOption { id: string; name: string; }
interface NotebookOption { id: string; name: string; }
interface DocOption { id: string; hpath: string; name: string; }

const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';
const BUILTIN_DECK_NAME = 'Built-in Deck';

export function ViewerView(props: { onClose: () => void }) {
    const [decks, setDecks] = createSignal<DeckOption[]>([]);
    const [selectedDeck, setSelectedDeck] = createSignal<string>('');
    const [notebooks, setNotebooks] = createSignal<NotebookOption[]>([]);
    const [selectedNotebook, setSelectedNotebook] = createSignal<string>('');
    const [docs, setDocs] = createSignal<DocOption[]>([]);
    const [selectedDoc, setSelectedDoc] = createSignal<string>('');
    const [cards, setCards] = createSignal<ParsedFlashcard[]>([]);
    const [currentIndex, setCurrentIndex] = createSignal(0);
    const [answered, setAnswered] = createSignal<Set<number>>(new Set());
    const [completed, setCompleted] = createSignal(false);
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal('');

    onMount(async () => {
        await refreshNativeCards();
        await Promise.all([loadDecks(), loadNotebooks()]);
    });

    const loadDecks = async () => {
        try {
            const riffDecks = await getRiffDecks();
            const opts: DeckOption[] = [{ id: BUILTIN_DECK_ID, name: BUILTIN_DECK_NAME }];
            for (const d of riffDecks) {
                const id = String(d.id ?? d.ID ?? d.deckID ?? '');
                const name = String(d.name ?? d.Name ?? d.id ?? '');
                if (id && id !== BUILTIN_DECK_ID) opts.push({ id, name });
            }
            setDecks(opts);
            const wikiDeck = opts.find(d => d.name === 'wiki-cards');
            setSelectedDeck(wikiDeck?.id || BUILTIN_DECK_ID);
        } catch (e) {
            console.error('[SRS-Viewer] loadDecks failed:', e);
            setDecks([{ id: BUILTIN_DECK_ID, name: BUILTIN_DECK_NAME }]);
            setSelectedDeck(BUILTIN_DECK_ID);
        }
    };

    const loadNotebooks = async () => {
        try {
            const notebooksResp = await lsNotebooks();
            const openNbs = (notebooksResp?.notebooks || []).filter((nb: any) => !nb.closed);
            const opts: NotebookOption[] = openNbs.map((nb: any) => ({ id: nb.id, name: nb.name }));
            setNotebooks(opts);
            const wikiNb = opts.find(nb => nb.name === 'llm-wiki');
            setSelectedNotebook(wikiNb?.id || opts[0]?.id || '');
        } catch (e) {
            console.error('[SRS-Viewer] loadNotebooks failed:', e);
        }
    };

    createEffect(() => {
        const nbId = selectedNotebook();
        const deckId = selectedDeck();
        if (nbId && deckId) loadDocsForNotebook(nbId, deckId);
    });

    const loadDocsForNotebook = async (notebookId: string, deckId: string) => {
        try {
            await refreshNativeCards();
            const deckCards = deckId ? getCardsByDeckId(deckId) : getAllCards();
            const cardBlockIds = deckCards.map(c => c.blockId).filter(Boolean);
            if (cardBlockIds.length === 0) { setDocs([]); setSelectedDoc(''); return; }
            const blockIdList = cardBlockIds.map(id => `'${id}'`).join(',');
            const rows = await sql(`SELECT DISTINCT d.id, d.hpath, d.name FROM blocks d INNER JOIN blocks b ON b.root_id = d.id WHERE d.box = '${notebookId}' AND d.type = 'd' AND b.id IN (${blockIdList}) ORDER BY d.hpath LIMIT 200`);
            const opts: DocOption[] = (rows || []).map((r: any) => ({ id: r.id, hpath: r.hpath, name: r.name }));
            setDocs(opts);
            const testDoc = opts.find(d => d.hpath === '/concepts/_flashcard-type-test');
            setSelectedDoc(testDoc?.id || opts[0]?.id || '');
        } catch (e) {
            console.error('[SRS-Viewer] loadDocsForNotebook failed:', e);
            setDocs([]);
        }
    };

    createEffect(() => {
        const deckId = selectedDeck();
        const docId = selectedDoc();
        if (deckId && docId) loadCards();
    });

    const loadCards = async () => {
        setLoading(true);
        setError('');
        setCompleted(false);
        setAnswered(new Set<number>());
        try {
            const deckId = selectedDeck();
            if (!deckId) { setError('请先选择一个卡包'); setCards([]); return; }
            await refreshNativeCards();
            let deckCards = getCardsByDeckId(deckId);
            const docId = selectedDoc();
            if (docId) {
                const childBlockIds = await getChildBlockIds(docId);
                const blockIdSet = new Set(childBlockIds);
                blockIdSet.add(docId);
                deckCards = deckCards.filter(c => blockIdSet.has(c.blockId));
            }
            if (deckCards.length === 0) {
                const docName = docs().find(d => d.id === selectedDoc())?.hpath || '';
                setError(docName ? `"${docName}" 下没有找到卡片` : '该卡包没有卡片');
                setCards([]);
                return;
            }
            const parsed: ParsedFlashcard[] = [];
            for (const card of deckCards) {
                try {
                    const [kramdownResult, attrsResult] = await Promise.all([getBlockKramdown(card.blockId), getBlockAttrs(card.blockId)]);
                    const markdown = kramdownResult?.kramdown || card.front || '';
                    const cardType = attrsResult?.['custom-card-type'] || inferTypeFromContent(markdown);
                    parsed.push(parseFlashcard(markdown, cardType));
                } catch (e) {
                    console.error('[SRS-Viewer] parse card failed:', card.blockId, e);
                    parsed.push({ type: 'unknown', question: card.front || card.blockId, answer: card.back || '', options: [], explanation: '', raw: card.front || '' });
                }
            }
            setCards(parsed);
            setCurrentIndex(0);
        } catch (e) {
            console.error('[SRS-Viewer] loadCards failed:', e);
            setError(`加载卡片失败: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    const getChildBlockIds = async (rootId: string): Promise<string[]> => {
        try {
            const rows = await sql(`SELECT id FROM blocks WHERE root_id='${rootId}' LIMIT 500`);
            return (rows || []).map((r: any) => r.id).filter(Boolean);
        } catch { return []; }
    };

    const inferTypeFromContent = (content: string): string => {
        if (/【单选题】/.test(content)) return CardType.SingleChoice;
        if (/【多选题】/.test(content)) return CardType.MultiChoice;
        if (/==.+?==/.test(content)) return CardType.Cloze;
        return CardType.QA;
    };

    const handleNext = () => {
        if (currentIndex() < cards().length - 1) setCurrentIndex(currentIndex() + 1);
        else setCompleted(true);
    };
    const handlePrev = () => { if (currentIndex() > 0) setCurrentIndex(currentIndex() - 1); };
    const markAnswered = () => setAnswered(s => new Set([...s, currentIndex()]));
    const stats = createMemo(() => ({ total: cards().length, progress: cards().length ? (currentIndex() + 1) / cards().length : 0 }));

    const handleKey = (e: KeyboardEvent) => {
        if (completed()) return;
        const target = e.target as HTMLElement;
        if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); handleNext(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
        else if (e.key === 'Escape') { props.onClose(); }
    };

    onMount(() => document.addEventListener('keydown', handleKey));
    onCleanup(() => document.removeEventListener('keydown', handleKey));

    return (
        <div class="srs-viewer-container srs-shell-gradient">
            <div class="srs-viewer-toolbar srs-panel">
                <div class="srs-viewer-toolbar__title"><div class="srs-section-title">闪卡地图</div><div class="srs-section-subtitle">按页面与卡包组织互动答题路径。</div></div>
                <div class="srs-viewer-selector-group"><label class="srs-viewer-label">笔记本</label><select class="b3-select srs-viewer-nb-select" value={selectedNotebook()} onChange={e => { setSelectedNotebook(e.currentTarget.value); setSelectedDoc(''); }}><For each={notebooks()}>{nb => <option value={nb.id}>{nb.name}</option>}</For></select></div>
                <div class="srs-viewer-selector-group"><label class="srs-viewer-label">页面</label><select class="b3-select srs-viewer-doc-select" value={selectedDoc()} onChange={e => setSelectedDoc(e.currentTarget.value)}><option value="">（全部）</option><For each={docs()}>{doc => <option value={doc.id}>{doc.hpath}</option>}</For></select></div>
                <div class="srs-viewer-selector-group"><label class="srs-viewer-label">卡包</label><select class="b3-select srs-viewer-deck-select" value={selectedDeck()} onChange={e => setSelectedDeck(e.currentTarget.value)}><For each={decks()}>{deck => <option value={deck.id}>{deck.name}</option>}</For></select></div>
                <button class="b3-button b3-button--outline" onClick={loadCards} disabled={loading()}>{loading() ? '加载中...' : '刷新'}</button>
                <button class="b3-button b3-button--outline" onClick={props.onClose}>关闭</button>
            </div>

            <Show when={stats().total > 0 && !completed()}>
                <div class="srs-viewer-progress"><div class="srs-progress-track"><div class="srs-progress-fill" style={{ width: `${Math.round(stats().progress * 100)}%` }} /></div><span>{currentIndex() + 1} / {stats().total}</span></div>
            </Show>

            <div class="srs-viewer-workspace" classList={{ 'srs-viewer-workspace--summary': completed() }}>
                <Show when={cards().length > 0 && !completed()}><CardMapRail cards={cards()} current={currentIndex()} answered={answered()} onJump={setCurrentIndex} /></Show>
                <div class="srs-viewer-card-area">
                    <Show when={loading()} fallback={<Show when={cards().length > 0} fallback={<div class="srs-viewer-empty srs-empty-card"><p>{error() || '暂无卡片，请选择页面和卡包后加载'}</p></div>}>
                        <Show when={!completed()} fallback={<ViewerSummary cards={cards()} answered={answered()} onRestart={() => { setCompleted(false); setCurrentIndex(0); setAnswered(new Set<number>()); }} />}>
                            <FlashcardRenderer card={cards()[currentIndex()]} index={currentIndex()} total={cards().length} onNext={handleNext} onPrev={handlePrev} onAnswered={markAnswered} />
                        </Show>
                    </Show>}>
                        <div class="srs-viewer-loading srs-loading-card">正在构建互动答题路径...</div>
                    </Show>
                </div>
            </div>
        </div>
    );
}
