import { createContext, useContext, createSignal, type ParentComponent } from 'solid-js';

export type SrsMode = 'creator' | 'focus';

interface ModeContextValue {
    mode: () => SrsMode;
    enterFocus: () => void;
    enterCreator: () => void;
    /** true while the cross-mode transition animation is running */
    transitioning: () => boolean;
}

const ModeContext = createContext<ModeContextValue>();

export const useSrsMode = (): ModeContextValue => {
    const ctx = useContext(ModeContext);
    if (!ctx) throw new Error('useSrsMode must be used within ModeRouter');
    return ctx;
};

export const ModeProvider: ParentComponent<{ initialMode?: SrsMode }> = (props) => {
    const [mode, setMode] = createSignal<SrsMode>(props.initialMode ?? 'creator');
    const [transitioning, setTransitioning] = createSignal(false);

    // Check prefers-reduced-motion once at module scope
    const prefersReducedMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const switchMode = (target: SrsMode) => {
        if (mode() === target) return;
        if (prefersReducedMotion) {
            setMode(target);
            return;
        }
        setTransitioning(true);
        // 300ms cross-fade transition; swap mode at midpoint (150ms)
        setTimeout(() => setMode(target), 150);
        setTimeout(() => setTransitioning(false), 300);
    };

    const value: ModeContextValue = {
        mode,
        enterFocus: () => switchMode('focus'),
        enterCreator: () => switchMode('creator'),
        transitioning,
    };

    return (
        <ModeContext.Provider value={value}>
            {props.children}
        </ModeContext.Provider>
    );
};
