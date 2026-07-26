import { Show, type ParentComponent } from 'solid-js';
import { ModeProvider, useSrsMode } from './index';
import { CreatorWorkspace } from '../creator/components/CreatorWorkspace';
import { FocusSession } from '../focus/components/FocusSession';

/**
 * ModeRouter — top-level component that switches between Creator Mode and Focus Mode.
 * Renders CreatorWorkspace when mode === 'creator', FocusSession when mode === 'focus'.
 * The 300ms cross-fade transition is handled inside ModeProvider.
 */
const ModeContent: ParentComponent<{ onClose: () => void }> = (props) => {
    const { mode, transitioning } = useSrsMode();

    return (
        <div
            class="srs-mode-router"
            classList={{ 'srs-mode-router--transitioning': transitioning() }}
        >
            <Show when={mode() === 'creator'}>
                <CreatorWorkspace onClose={props.onClose} />
            </Show>
            <Show when={mode() === 'focus'}>
                <FocusSession />
            </Show>
        </div>
    );
};

export function ModeRouter(props: { onClose: () => void; initialMode?: 'creator' | 'focus' }) {
    return (
        <ModeProvider initialMode={props.initialMode ?? 'creator'}>
            <ModeContent onClose={props.onClose} />
        </ModeProvider>
    );
}
