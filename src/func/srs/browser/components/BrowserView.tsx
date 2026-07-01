/**
 * BrowserView — Main card manager layout
 * Left: deck sidebar | Center: stats + filter + table | Modal: card detail
 */
import { createSignal, Show, onMount, For } from 'solid-js';
import type { SRSCard } from '@/types/srs';
import { CardType } from '@/types/srs';
import { getFilteredCards, exportCardsToJson, exportCardsToCsv } from '../browser-controller';
import type { BrowserFilter } from '../types';
import { DeckSidebar } from './DeckSidebar';
import { StatsBar } from './StatsBar';
import { CardTable } from './CardTable';
import { CardDetailModal } from './CardDetailModal';
import { BrowserTaskFilters } from './BrowserTaskFilters';
import type { BrowserTaskFilter } from '../types';

const BROWSER_TYPE_OPTIONS: [string, string][] = [
    [CardType.Cloze, '填空'],
    [CardType.QA, '问答'],
    [CardType.SingleChoice, '单选'],
    [CardType.MultiChoice, '多选'],
];

const STATE_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'new', label: '新卡' },
    { value: 'learning', label: '学习中' },
    { value: 'review', label: '复习中' },
    { value: 'relearning', label: '重学中' },
];

export function BrowserView() {
    const [cards, setCards] = createSignal<SRSCard[]>([]);
    const [selectedDeck, setSelectedDeck] = createSignal<string | null>(null);
    const [selectedCard, setSelectedCard] = createSignal<SRSCard | null>(null);
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
    };
    onMount(refresh);

    const handleSelectDeck = (deckId: string | null) => {
        setSelectedDeck(deckId);
        // Clear deckId from filter — refresh() will set it from selectedDeck()
        setFilter(f => {
            const nf = { ...f };
            delete nf.deckId;
            return nf;
        });
        // Use queueMicrotask to ensure signals are updated before refresh
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

    return (
        <div class="srs-browser-container srs-shell-gradient">
            <DeckSidebar
                selectedDeck={selectedDeck()}
                onSelectDeck={handleSelectDeck}
                onRefresh={refresh}
            />

            <div class="srs-browser-main">
                <div class="srs-browser-hero">
                    <div>
                        <div class="srs-section-title">卡片资产运营台</div>
                        <div class="srs-section-subtitle">用健康度、风险和到期压力管理你的长期记忆资产。</div>
                    </div>
                    <div class="srs-browser-hero__actions">
                        <button class="b3-button b3-button--outline" onClick={() => setShowExportMenu(!showExportMenu())}>导出</button>
                        <button class="b3-button b3-button--outline" onClick={refresh}>刷新</button>
                    </div>
                </div>
                <StatsBar refreshTrigger={refreshTrigger()} />
                <BrowserTaskFilters value={taskFilter()} onChange={handleTaskChange} />

                <div class="srs-filter-bar srs-panel">
                    <select class="b3-select" onChange={e => handleFilterChange('cardType', e.currentTarget.value)}>
                        <option value="">全部类型</option>
                        <For each={BROWSER_TYPE_OPTIONS}>{(entry: [string, string]) => <option value={entry[0]}>{entry[1]}</option>}</For>
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
                            牌组: {selectedDeck()}
                            <button class="srs-clear-filter" onClick={() => handleSelectDeck(null)}>x</button>
                        </span>
                    </Show>
                    <div style={{ 'flex': '1' }} />
                </div>

                <Show when={showExportMenu()}>
                    <div class="srs-export-menu">
                        <button class="b3-button b3-button--text" onClick={() => handleExport('json')}>导出 JSON</button>
                        <button class="b3-button b3-button--text" onClick={() => handleExport('csv')}>导出 CSV</button>
                    </div>
                </Show>

                <CardTable
                    cards={cards()}
                    onCardClick={(card) => setSelectedCard(card)}
                    onRefresh={refresh}
                />
            </div>

            <CardDetailModal
                card={selectedCard()}
                onClose={() => setSelectedCard(null)}
                onSaved={refresh}
            />
        </div>
    );
}
