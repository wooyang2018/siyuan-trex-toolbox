import { createSignal, Show, For, createEffect, onCleanup } from 'solid-js';
import type { ParsedFlashcard } from '../../viewer/card-parser';
import { openSourceBlock } from '../../module';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';

export function CardEditor(props: { card: ParsedFlashcard | null; blockId: string }) {
    const [opacity, setOpacity] = createSignal(1);
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;

    // Fade animation on card switch (100ms)
    createEffect(() => {
        const card = props.card;
        const blockId = props.blockId;
        // Trigger fade-out → swap → fade-in
        setOpacity(0);
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
            setOpacity(1);
        }, 100);
    });

    const handleEditFront = () => {
        if (props.blockId) openSourceBlock(props.blockId);
    };

    const handleEditBack = () => {
        if (props.blockId) openSourceBlock(props.blockId);
    };

    onCleanup(() => {
        if (fadeTimer) clearTimeout(fadeTimer);
    });

    return (
        <div class="srs-card-editor" style={{ opacity: opacity(), transition: 'opacity 100ms ease' }}>
            <Show when={props.card} fallback={
                <div class="srs-card-editor__empty srs-empty-card">
                    <p class="srs-card-editor__empty-icon">📝</p>
                    <p>选择一张卡片以查看详情</p>
                    <p class="srs-card-editor__empty-hint">从左侧卡片列表点击任意卡片</p>
                </div>
            }>
                {(card) => (
                    <div class="srs-card-editor__content">
                        <div class="srs-card-editor__header">
                            <span class={`srs-card-type-badge srs-card-type-badge--${card().type}`}>
                                {CARD_TYPE_LABELS[card().type] ?? card().type}
                            </span>
                        </div>

                        <div class="srs-card-editor__section">
                            <div class="srs-card-editor__section-label">Front（正面）</div>
                            <div class="srs-card-editor__preview srs-card-editor__preview--front" onClick={handleEditFront}>
                                <Show when={card().options.length > 0} fallback={
                                    <pre class="srs-card-editor__pre">{card().question}</pre>
                                }>
                                    <pre class="srs-card-editor__pre">{card().question}</pre>
                                    <div class="srs-card-editor__options">
                                        <For each={card().options}>{(opt) => (
                                            <div class="srs-card-editor__option" classList={{ 'srs-card-editor__option--correct': opt.correct }}>
                                                <span class="srs-card-editor__option-label">{opt.label}.</span>
                                                <span class="srs-card-editor__option-text">{opt.text}</span>
                                            </div>
                                        )}</For>
                                    </div>
                                </Show>
                            </div>
                        </div>

                        <div class="srs-card-editor__section">
                            <div class="srs-card-editor__section-label">Back（背面）</div>
                            <div class="srs-card-editor__preview srs-card-editor__preview--back" onClick={handleEditBack}>
                                <Show when={card().answer} fallback={<span class="srs-card-editor__placeholder">（无答案）</span>}>
                                    <pre class="srs-card-editor__pre">{card().answer}</pre>
                                </Show>
                                <Show when={card().explanation}>
                                    <div class="srs-card-editor__explanation">
                                        <span class="srs-card-editor__explanation-label">解析：</span>
                                        {card().explanation}
                                    </div>
                                </Show>
                            </div>
                        </div>

                        <Show when={props.blockId}>
                            <div class="srs-card-editor__block-id">
                                Block ID: <code>{props.blockId}</code>
                            </div>
                        </Show>
                    </div>
                )}
            </Show>
        </div>
    );
}