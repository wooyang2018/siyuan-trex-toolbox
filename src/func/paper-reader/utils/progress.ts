/**
 * ProgressReporter — bridges action functions with SolidJS signals in the Dock UI.
 * Create one instance per action run, pass it down through the call chain.
 */
import type { IProgressReporter } from '../types';

export type ProgressCallback = (log: string | null, status: string | null, percent: number | null) => void;

export class ProgressReporter implements IProgressReporter {
    private _cancelled = false;
    readonly abortController: AbortController;
    private readonly callback: ProgressCallback;

    constructor(callback: ProgressCallback) {
        this.callback = callback;
        this.abortController = new AbortController();
    }

    log(msg: string): void {
        const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        this.callback(`[${ts}] ${msg}`, null, null);
    }

    updateStatus(text: string, percent: number): void {
        this.callback(null, text, percent);
    }

    get cancelled(): boolean {
        return this._cancelled;
    }

    cancel(): void {
        this._cancelled = true;
        this.abortController.abort();
    }
}
