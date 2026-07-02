import { createSignal, Show, onMount, For } from 'solid-js';
import type { CardState, SRSCard } from '@/types/srs';
import { CardType } from '@/types/srs';
import { getFilteredCards, exportCardsToJson, exportCardsToCsv, getAllDecks } from '../browser-controller';
import type { BrowserFilter, BrowserTaskFilter, DeckInfo } from '../types';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';
import { DeckSidebar } from './DeckSidebar';
import { StatsBar } from './StatsBar';
import { CardTable } from './CardTable';
import { CardDetailPanel } from './CardDetailPanel';
import { BrowserTaskFilters } from './BrowserTaskFilters';

const BROWSER_TYPE_OPTIONS: Array<[CardType, string]> = [
    [CardType.Cloze, CARD_TYPE_LABELS[CardType.Cloze]],
    [CardType.QA, CARD_TYPE_LABELS[CardType.QA]],
    [CardType.SingleChoice, CARD_TYPE_LABELS[CardType.SingleChoice]],
    [CardType.MultiChoice, CARD_TYPE_LABELS[CardType.MultiChoice]],
];

const STATE_OPTIONS: Array<{ value: '' | CardState; label: string }> = [
    { value: '', label: '全部状态' },
    { value: 'new', label: '新卡' },
    { value: 'learning', label: '学习中' },
    { value: 'review', label: '复习中' },
    { value: 'relearning', label: '重学中' },
];

export function BrowserView() {
    const [cards, setCards] = createSignal<SRSCard[]>([]);
    const [selectedDeck, setSelectedDeck] = createSignal<string | null>(null);
    const [selectedDeckName, setSelectedDeckName] = createSignal('');
    const [selectedCard, setSelectedCard] = createSignal<SRSCard | null>(null);
    const [decks, setDecks] = createSignal<DeckInfo[]>([]);
    const [filter, setFilter] = createSignal<BrowserFilter>({ task: 'all' });
    const [taskFilter, setTaskFilter] = createSignal<BrowserTaskFilter>('all');
    const [refreshTrigger, setRefreshTrigger] = createSignal(0);
    const [showExportMenu, setShowExportMenu] = createSignal(false);

    const refresh = async () => {
        const f = { ...filter() };
        if (selectedDeck()) f.deckId = selectedDeck()!;
        else delete f.deckId;
        const filtered = await getFilteredCards(f);
        setCards(filtered);
        setRefreshTrigger(t => t + 1);
        return filtered;
    };
    const refreshDecks = async () => setDecks(await getAllDecks());
    onMount(async () => {
        await refreshDecks();
        await refresh();
    });

    const handleSelectDeck = (deckId: string | null, deck?: DeckInfo | null) => {
        setSelectedDeck(deckId);
        setSelectedDeckName(deck?.name || '');
        setSelectedCard(null);
        setFilter(f => {
            const nf = { ...f };
            delete nf.deckId;
            return nf;
        });
        queueMicrotask(() => { refresh(); });
    };

    const handleFilterChange = (key: keyof BrowserFilter, value: string) => {
        setFilter(f => {
            const newFilter = { ...f };
            if (value) (newFilter as any)[key] = value;
            else delete (newFilter as any)[key];
            return newFilter;
        });
        queueMicrotask(() => { refresh(); });
    };

    const handleSearch = (text: string) => {
        setFilter(f => ({ ...f, searchText: text || undefined }));
        queueMicrotask(() => { refresh(); });
    };

    const handleDueOnlyChange = (checked: boolean) => {
        setFilter(f => {
            const nf = { ...f };
            if (checked) nf.dueOnly = true;
            else delete nf.dueOnly;
            return nf;
        });
        queueMicrotask(() => { refresh(); });
    };

    const handleTaskChange = (task: BrowserTaskFilter) => {
        setTaskFilter(task);
        setFilter(f => {
            const nf = { ...f };
            if (task === 'all') delete nf.task;
            else nf.task = task;
            return nf;
        });
        queueMicrotask(() => { refresh(); });
    };

    const handleExport = (format: 'json' | 'csv') => {
        const data = format === 'json' ? exportCardsToJson() : exportCardsToCsv();
        const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `srs-cards-${new Date().toISOString().slice(0, 10)}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        setShowExportMenu(false);
    };

    const handleDetailSaved = async () => {
        const selectedId = selectedCard()?.id;
        const nextCards = await refresh();
        await refreshDecks();
        if (selectedId) {
            setSelectedCard(nextCards.find(card => card.id === selectedId) ?? null);
        }
    };

    const handleCardsChanged = async () => {
        await refresh();
        await refreshDecks();
    };

    return (
        <div class="srs-browser-container srs-shell-gradient">
            <DeckSidebar
                selectedDeck={selectedDeck()}
                decks={decks()}
                onSelectDeck={handleSelectDeck}
                onDecksChange={setDecks}
                onRefresh={refresh}
            />

            <div class="srs-browser-main">
                <div class="srs-browser-hero">
                    <div>
                        <div class="srs-section-title">卡片资产运营台</div>
                        <div class="srs-section-subtitle">用健康度、风险和到期压力管理你的长期记忆资产。</div>
                    </div>
                    <div class="srs-browser-hero__actions">
                        <div class="srs-export-group">
                            <button class="b3-button b3-button--outline" onClick={() => setShowExportMenu(!showExportMenu())}>导出</button>
                            <Show when={showExportMenu()}>
                                <div class="srs-export-popover">
                                    <button class="b3-button b3-button--text" onClick={() => handleExport('json')}>JSON</button>
                                    <button class="b3-button b3-button--text" onClick={() => handleExport('csv')}>CSV</button>
                                </div>
                            </Show>
                        </div>
                        <button class="b3-button b3-button--outline" onClick={refresh}>刷新</button>
                    </div>
                </div>
                <StatsBar refreshTrigger={refreshTrigger()} />
                <BrowserTaskFilters value={taskFilter()} onChange={handleTaskChange} />

                <div class="srs-filter-bar srs-panel">
                    <select class="b3-select" onChange={e => handleFilterChange('cardType', e.currentTarget.value)}>
                        <option value="">全部类型</option>
                        <For each={BROWSER_TYPE_OPTIONS}>{entry => <option value={entry[0]}>{entry[1]}</option>}</For>
                    </select>
                    <select class="b3-select" onChange={e => handleFilterChange('state', e.currentTarget.value)}>
                        <For each={STATE_OPTIONS}>{opt => <option value={opt.value}>{opt.label}</option>}</For>
                    </select>
                    <label class="srs-filter-check">
                        <input type="checkbox" checked={filter().dueOnly || false} onChange={e => handleDueOnlyChange(e.currentTarget.checked)} />
                        <span>仅看到期</span>
                    </label>
                    <input
                        class="b3-text-field srs-search-input"
                        type="text"
                        placeholder="搜索卡片内容或标签..."
                        value={filter().searchText || ''}
                        onInput={e => handleSearch(e.currentTarget.value)}
                    />
                    <Show when={selectedDeck()}>
                        <span class="srs-deck-filter-tag">
                            牌组: {selectedDeckName() || selectedDeck()}
                            <button class="srs-clear-filter" onClick={() => handleSelectDeck(null, null)}>x</button>
                        </span>
                    </Show>
                    <div style={{ 'flex': '1' }} />
                </div>

                <div class="srs-browser-workspace">
                    <CardTable
                        cards={cards()}
                        decks={decks()}
                        selectedCardId={selectedCard()?.id ?? null}
                        onCardClick={(card) => setSelectedCard(card)}
                        onBeforeMove={() => refreshDecks()}
                        onRefresh={handleCardsChanged}
                    />
                    <Show when={selectedCard()}>
                        <CardDetailPanel
                            card={selectedCard()}
                            decks={decks()}
                            onClose={() => setSelectedCard(null)}
                            onSaved={handleDetailSaved}
                        />
                    </Show>
                </div>
            </div>
        </div>
    );
}
