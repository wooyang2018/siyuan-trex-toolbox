import { createSignal, Show, For, onMount, onCleanup } from 'solid-js';
import { useSrsMode } from '../../mode-router';
import { DeckTree } from './DeckTree';
import { CardList } from './CardList';
import { CardEditor } from './CardEditor';
import { refreshNativeCards, getCardsByDeckId } from '../../core/card-repository';
import { getRiffDecks, lsNotebooks } from '@/api';
import type { ParsedFlashcard } from '../../viewer/card-parser';
import '../index.scss';

const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';
const BUILTIN_DECK_NAME = '内置卡包';

interface DeckOption { id: string; name: string; }
interface NotebookOption { id: string; name: string; }

export function CreatorWorkspace(props: { onClose: () => void }) {
    const { enterFocus } = useSrsMode();

    const [decks, setDecks] = createSignal<DeckOption[]>([]);
    const [selectedDeckId, setSelectedDeckId] = createSignal<string>('');
    const [notebooks, setNotebooks] = createSignal<NotebookOption[]>([]);
    const [selectedNotebookId, setSelectedNotebookId] = createSignal<string>('');
    const [selectedCard, setSelectedCard] = createSignal<ParsedFlashcard | null>(null);
    const [selectedBlockId, setSelectedBlockId] = createSignal<string>('');
    const [searchText, setSearchText] = createSignal('');
    const [loading, setLoading] = createSignal(true);

    onMount(async () => {
        setLoading(true);
        try {
            await refreshNativeCards();
            await Promise.all([loadDecks(), loadNotebooks()]);
        } finally {
            setLoading(false);
        }
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
            if (!selectedDeckId() || !opts.some(d => d.id === selectedDeckId())) {
                setSelectedDeckId(opts[0]?.id || '');
            }
        } catch (e) {
            console.error('[CreatorWorkspace] loadDecks failed:', e);
            setDecks([{ id: BUILTIN_DECK_ID, name: BUILTIN_DECK_NAME }]);
            setSelectedDeckId(BUILTIN_DECK_ID);
        }
    };

    const loadNotebooks = async () => {
        try {
            const resp = await lsNotebooks();
            const openNbs = (resp?.notebooks || []).filter((nb: any) => !nb.closed);
            const opts = openNbs.map((nb: any) => ({ id: nb.id, name: nb.name }));
            setNotebooks(opts);
            if (opts.length > 0 && !selectedNotebookId()) {
                setSelectedNotebookId(opts[0].id);
            }
        } catch (e) {
            console.error('[CreatorWorkspace] loadNotebooks failed:', e);
        }
    };

    const handleDecksChanged = async () => {
        await loadDecks();
    };

    const handleSelectCard = (card: ParsedFlashcard | null, blockId: string) => {
        setSelectedCard(card);
        setSelectedBlockId(blockId);
    };

    const handleSearch = (text: string) => {
        setSearchText(text);
    };

    const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            const target = e.target as HTMLElement;
            if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') {
                (target as HTMLElement).blur();
                return;
            }
            props.onClose();
        }
    };

    onMount(() => document.addEventListener('keydown', handleKey));
    onCleanup(() => document.removeEventListener('keydown', handleKey));

    return (
        <div class="srs-creator-workspace">
            <div class="srs-creator-topbar">
                <div class="srs-creator-topbar__brand">
                    <span class="srs-creator-logo">🎴</span>
                    <span class="srs-creator-topbar__title">闪卡管理</span>
                </div>
                <div class="srs-creator-topbar__search">
                    <input
                        class="b3-text-field srs-creator-search-input"
                        type="text"
                        placeholder="搜索卡片…"
                        value={searchText()}
                        onInput={(e) => handleSearch(e.currentTarget.value)}
                    />
                </div>
                <div class="srs-creator-topbar__actions">
                    <button class="b3-button b3-button--outline srs-creator-focus-btn" onClick={() => enterFocus()}>
                        ▶ 学习
                    </button>
                    <Show when={notebooks().length > 0}>
                        <select class="b3-select srs-creator-nb-select" title="笔记本" value={selectedNotebookId()} onChange={(e) => setSelectedNotebookId(e.currentTarget.value)}>
                            <For each={notebooks()}>{nb => <option value={nb.id}>{nb.name}</option>}</For>
                        </select>
                    </Show>
                    <button class="b3-button b3-button--outline" onClick={props.onClose}>✕</button>
                </div>
            </div>

            <div class="srs-creator-body">
                <div class="srs-creator-left">
                    <DeckTree
                        decks={decks()}
                        selectedDeckId={selectedDeckId()}
                        onSelectDeck={setSelectedDeckId}
                        onDecksChanged={handleDecksChanged}
                    />
                </div>
                <div class="srs-creator-center">
                    <Show when={!loading()} fallback={<div class="srs-creator-loading srs-loading-card">正在加载卡包…</div>}>
                    <CardList
                            deckId={selectedDeckId()}
                            notebookId={selectedNotebookId()}
                            onSelectCard={handleSelectCard}
                            searchText={searchText()}
                        />
                    </Show>
                </div>
                <div class="srs-creator-right">
                    <CardEditor card={selectedCard()} blockId={selectedBlockId()} />
                </div>
            </div>
        </div>
    );
}
