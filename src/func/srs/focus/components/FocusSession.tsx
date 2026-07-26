import { createSignal, createMemo, Show, onMount, onCleanup } from 'solid-js';
import { FocusProgress } from './FocusProgress';
import { FocusCardRenderer } from './FocusCardRenderer';
import { FocusSummary } from './FocusSummary';
import { useSrsMode } from '../../mode-router';
import {
    startReview,
    getCurrentCardData,
    revealCard,
    rateCard,
    skipCard,
    getReviewStats,
    getLastSummary,
    endReview,
    undoLastRating,
    canUndo,
} from '../../review/review-controller';
import type { CardRenderData, ReviewSummaryData } from '../../review/types';
import type { Rating } from '@/types/srs';

type FocusPhase = 'question' | 'hint' | 'answer' | 'rating' | 'done';

/**
 * FocusSession — 沉浸式学习会话主组件（五阶段状态机）
 *
 * 阶段流转：question → hint（可选）→ answer → rating → done → 下一张(question)
 * 进入后隐藏所有管理 UI，纯白背景沉浸学习。
 */
export function FocusSession() {
    const { enterCreator } = useSrsMode();

    const [phase, setPhase] = createSignal<FocusPhase>('question');
    const [cardData, setCardData] = createSignal<CardRenderData | null>(null);
    const [summary, setSummary] = createSignal<ReviewSummaryData | null>(null);
    const [empty, setEmpty] = createSignal(false);
    const [loading, setLoading] = createSignal(true);
    const [tick, setTick] = createSignal(0);
    const [animationClass, setAnimationClass] = createSignal('srs-slide-in-right');
    const [lastWasCorrect, setLastWasCorrect] = createSignal<boolean | undefined>(undefined);

    const stats = createMemo(() => {
        if (phase() === 'done') return null;
        tick();
        return getReviewStats();
    });

    const undoFlag = createMemo(() => phase() !== 'done' && canUndo());

    const prepare = async () => {
        setLoading(true);
        setEmpty(false);
        setSummary(getLastSummary());
        const s = await startReview('retrieval', 'dialog');
        if (!s) {
            setEmpty(true);
            setLoading(false);
            setPhase('done');
            return;
        }
        setCardData(getCurrentCardData());
        setPhase('question');
        setLoading(false);
        setAnimationClass('srs-slide-in-right');
    };

    onMount(prepare);

    let timerId: ReturnType<typeof setInterval> | null = null;
    onMount(() => {
        timerId = setInterval(() => setTick((t) => t + 1), 1000);
    });
    onCleanup(() => {
        if (timerId) clearInterval(timerId);
        if (phase() !== 'done') endReview();
    });

    const finish = () => {
        setSummary(getLastSummary());
        setCardData(null);
        setPhase('done');
    };

    const goToNextCard = (direction: 'next' | 'prev' = 'next') => {
        setAnimationClass(direction === 'next' ? 'srs-slide-in-right' : 'srs-slide-in-left');
        setLastWasCorrect(undefined);
        setPhase('question');
    };

    const handleReveal = (wasCorrect?: boolean) => {
        setLastWasCorrect(wasCorrect);
        revealCard();
        setCardData(getCurrentCardData());
        setPhase('answer');
    };

    const handleHint = () => {
        setPhase('hint');
    };

    const handleRate = async (rating: number, wasCorrect?: boolean) => {
        setPhase('rating');
        const next = await rateCard(rating as Rating, wasCorrect);
        if (!next) {
            finish();
            return;
        }
        setCardData(next);
        goToNextCard('next');
    };

    const handleSkip = () => {
        const next = skipCard();
        if (!next) {
            finish();
            return;
        }
        setCardData(next);
        goToNextCard('next');
    };

    const handleUndo = async () => {
        const next = await undoLastRating();
        if (next) {
            setCardData(next);
            setPhase('question');
        }
    };

    const handleRestart = () => {
        prepare();
    };

    const handleExit = () => {
        enterCreator();
    };

    const isInputFocused = (e: KeyboardEvent): boolean => {
        const target = e.target as HTMLElement | null;
        if (!target) return false;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    };

    const handleKey = (e: KeyboardEvent) => {
        if (isInputFocused(e)) return;
        if (phase() === 'done') {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleExit();
            }
            return;
        }
        if (!cardData()) return;

        switch (e.key) {
            case ' ':
            case 'ArrowRight':
                e.preventDefault();
                if (phase() === 'question') {
                    handleReveal();
                } else if (phase() === 'answer') {
                    handleSkip();
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                handleUndo();
                break;
            case 'Enter':
                e.preventDefault();
                if (phase() === 'question') handleReveal();
                break;
            case 'h':
            case 'H':
                e.preventDefault();
                if (phase() === 'question') handleHint();
                break;
            case '1':
            case '2':
            case '3':
            case '4':
                if (phase() === 'answer') {
                    e.preventDefault();
                    handleRate(Number(e.key), lastWasCorrect());
                }
                break;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                handleExit();
                break;
        }
    };

    // Use capture phase so we intercept Esc before SiYuan Dialog's own handler closes the dialog
    onMount(() => document.addEventListener('keydown', handleKey, true));
    onCleanup(() => document.removeEventListener('keydown', handleKey, true));

    const currentDisplay = () => {
        if (loading()) return null;
        if (empty() || phase() === 'done') return null;
        return cardData();
    };

    const progressCurrent = () => {
        const s = stats();
        if (s) return s.currentIndex + (phase() === 'answer' || phase() === 'rating' ? 1 : 0);
        return 0;
    };
    const progressTotal = () => stats()?.total ?? 0;

    return (
        <div class="srs-focus-root">
            <div class="srs-focus-session">
                {/* 顶部进度条 + 退出按钮 */}
                <div class="srs-focus-topbar">
                    <Show when={phase() !== 'done' && stats()}>
                        <FocusProgress
                            current={progressCurrent()}
                            total={progressTotal()}
                        />
                    </Show>
                    <button
                        class="srs-focus-exit-btn"
                        onClick={handleExit}
                        title="返回管理模式"
                    >
                        Esc 返回管理
                    </button>
                </div>

                {/* 中间卡片区域 */}
                <div class="srs-focus-card-area">
                    <Show when={loading()}>
                        <div class="srs-focus-loading">正在同步思源闪卡与复习队列...</div>
                    </Show>

                    <Show when={phase() === 'done'}>
                        <FocusSummary summary={summary()} onRestart={handleRestart} />
                    </Show>

                    <Show when={currentDisplay()}>
                        <div class="srs-focus-card">
                            <FocusCardRenderer
                                data={cardData()!}
                                phase={() => phase() as string}
                                onReveal={handleReveal}
                                onRate={handleRate}
                                animationClass={animationClass()}
                            />
                        </div>
                    </Show>
                </div>

                {/* 底部操作区 */}
                <Show when={phase() !== 'done' && cardData()}>
                    <div class="srs-focus-actions">
                        <Show when={undoFlag()}>
                            <button
                                class="srs-focus-phase-btn srs-focus-phase-btn--outline"
                                onClick={handleUndo}
                            >
                                撤销 <kbd>←</kbd>
                            </button>
                        </Show>
                        <button
                            class="srs-focus-phase-btn srs-focus-phase-btn--outline"
                            onClick={handleSkip}
                        >
                            跳过
                        </button>
                        <Show when={phase() === 'question'}>
                            <span class="srs-focus-hint-text">
                                <kbd>Enter</kbd> 显示答案 · <kbd>H</kbd> 提示 · <kbd>Esc</kbd> 退出
                            </span>
                        </Show>
                        <Show when={phase() === 'answer'}>
                            <span class="srs-focus-hint-text">
                                <kbd>1</kbd> 不会 · <kbd>2</kbd> 困难 · <kbd>3</kbd> 一般 · <kbd>4</kbd> 简单
                            </span>
                        </Show>
                    </div>
                </Show>
            </div>
        </div>
    );
}
