import { createSignal, Show, onCleanup, onMount } from 'solid-js';
import { CardRenderer } from './CardRenderer';
import { RatingBar } from './RatingBar';
import { QueueIndicator } from './QueueIndicator';
import { ReviewStartPanel } from './ReviewStartPanel';
import { ReviewSummary } from './ReviewSummary';
import { startReview, getCurrentCardData, revealCard, rateCard, skipCard, getReviewStats, getLastSummary, endReview, undoLastRating, canUndo } from '../review-controller';
import { openSourceBlock } from '../../module';
import { formatElapsed } from '../../shared/format';
import type { QueueType } from '@/types/srs';
import type { CardRenderData, ReviewStats, ReviewSummaryData } from '../types';
import { EmptyState } from '../../shared/components/EmptyState';

export function ReviewView(props: { queueType: QueueType; onClose: () => void }) {
    const [phase, setPhase] = createSignal<'loading' | 'ready' | 'reviewing' | 'done' | 'empty'>('loading');
    const [cardData, setCardData] = createSignal<CardRenderData | null>(null);
    const [stats, setStats] = createSignal<ReviewStats | null>(null);
    const [summary, setSummary] = createSignal<ReviewSummaryData | null>(null);
    const [undoFlag, setUndoFlag] = createSignal(false);

    const prepare = async () => {
        const s = await startReview(props.queueType, 'dialog');
        if (!s) { setPhase('empty'); return; }
        setCardData(getCurrentCardData());
        setStats(getReviewStats());
        setPhase('ready');
    };

    onMount(prepare);

    let timer: ReturnType<typeof setInterval> | null = null;
    onMount(() => {
        timer = setInterval(() => {
            if (phase() === 'reviewing') {
                setStats(getReviewStats());
                setUndoFlag(canUndo());
            }
        }, 1000);
    });
    onCleanup(() => { if (timer) clearInterval(timer); });

    onCleanup(() => {
        if (phase() !== 'done') endReview();
    });

    const begin = () => setPhase('reviewing');

    const finish = () => {
        setSummary(getLastSummary());
        setCardData(null);
        setStats(null);
        setPhase('done');
    };

    const handleReveal = () => {
        revealCard();
        setCardData(getCurrentCardData());
    };

    const handleRate = async (rating: number) => {
        if (!cardData()?.isRevealed) return;
        const next = await rateCard(rating as 1 | 2 | 3 | 4);
        if (!next) { finish(); return; }
        setCardData(next);
        setStats(getReviewStats());
        setUndoFlag(canUndo());
    };

    const handleSkip = () => {
        const next = skipCard();
        if (!next) { finish(); return; }
        setCardData(next);
        setStats(getReviewStats());
        setUndoFlag(canUndo());
    };

    const handleUndo = async () => {
        const next = await undoLastRating();
        if (next) {
            setCardData(next);
            setStats(getReviewStats());
            setUndoFlag(canUndo());
        }
    };

    const handleJumpSource = () => {
        const card = cardData()?.card;
        if (card) openSourceBlock(card.blockId);
    };

    const handleKey = (e: KeyboardEvent) => {
        if (phase() !== 'reviewing') return;
        if (e.key === ' ') { e.preventDefault(); if (!cardData()?.isRevealed) handleReveal(); }
        else if (['1', '2', '3', '4'].includes(e.key)) handleRate(Number(e.key));
        else if (e.key === 'Escape') props.onClose();
        else if (e.key === 'Backspace' || e.key === 'u' || e.key === 'U') { e.preventDefault(); handleUndo(); }
    };

    onMount(() => document.addEventListener('keydown', handleKey));
    onCleanup(() => document.removeEventListener('keydown', handleKey));

    return (
        <div class="srs-review-container srs-shell-gradient">
            <div class="srs-review-topbar">
                <div class="srs-review-topbar__left">
                    <QueueIndicator queueType={props.queueType} />
                    <Show when={stats()}>
                        <span class="srs-review-position">第 {stats()!.currentIndex + 1} / {stats()!.total} 张</span>
                        <span class="srs-review-progress">{stats()!.reviewed} 已评分 · {stats()!.remaining} 剩余</span>
                        <Show when={phase() === 'reviewing'}>
                            <span class="srs-review-timer">{formatElapsed(stats()!.elapsedTime)}</span>
                        </Show>
                    </Show>
                </div>
                <div class="srs-review-topbar__actions">
                    <Show when={phase() === 'reviewing'}>
                        <button class="b3-button b3-button--outline srs-undo-btn" disabled={!undoFlag()} onClick={handleUndo}>撤销</button>
                        <button class="b3-button b3-button--outline" onClick={handleSkip}>跳过</button>
                    </Show>
                    <button class="b3-button b3-button--outline" onClick={props.onClose}>关闭</button>
                </div>
            </div>
            <Show when={stats()}>
                <div class="srs-progress-track"><div class="srs-progress-fill" style={{ width: `${Math.round((stats()!.progress || 0) * 100)}%` }} /></div>
            </Show>

            <div class="srs-card-area">
                <Show when={phase() === 'loading'}>
                    <div class="srs-loading-card">正在同步思源闪卡与复习队列...</div>
                </Show>
                <Show when={phase() === 'empty'}>
                    <EmptyState title="当前没有可复习的卡片" description="所有卡片可能已经完成，或当前队列暂无到期卡片。" action={<button class="b3-button b3-button--outline" style={{ 'margin-top': '16px' }} onClick={props.onClose}>关闭</button>} />
                </Show>
                <Show when={phase() === 'ready'}>
                    <ReviewStartPanel stats={stats()} onStart={begin} />
                </Show>
                <Show when={phase() === 'reviewing' && cardData()}>
                    <CardRenderer data={cardData()!} onReveal={handleReveal} onJumpSource={handleJumpSource} />
                </Show>
                <Show when={phase() === 'done'}>
                    <ReviewSummary summary={summary()} onRestart={prepare} onClose={props.onClose} />
                </Show>
            </div>
            <Show when={phase() === 'reviewing' && cardData()?.isRevealed}>
                <RatingBar intervals={cardData()!.intervals} onRate={handleRate} />
            </Show>
        </div>
    );
}
