/**
 * 番茄钟提示音
 *
 * @description 用 WebAudio 现场合成两声短促提示音，避免额外音频资源与打包体积。
 *              浏览器自动播放策略要求 AudioContext 必须在用户手势后创建或 resume，
 *              因此由「开始」等点击动作调用 unlock()，结束时只做播放。
 */
import type { Phase } from "./engine";

let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) {
        try {
            ctx = new Ctor();
        } catch (error) {
            console.warn("[Pomodoro] 无法创建 AudioContext:", error);
            return null;
        }
    }
    return ctx;
};

/** 在用户手势里调用，解除自动播放限制 */
export const unlockAudio = (): void => {
    const audio = getCtx();
    if (audio && audio.state === "suspended") {
        void audio.resume().catch(() => undefined);
    }
};

const beep = (audio: AudioContext, at: number, freq: number, gainValue: number): void => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(gainValue, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(at);
    osc.stop(at + 0.32);
};

/**
 * 播放阶段结束提示音。
 * 专注结束用上行两声（提醒休息），休息结束用下行两声（提醒回到工作）。
 */
export const playChime = (finishedPhase: Phase): void => {
    const audio = getCtx();
    if (!audio) return;
    const start = () => {
        const t0 = audio.currentTime + 0.02;
        const [first, second] =
            finishedPhase === "focus" ? [660, 880] : [880, 660];
        beep(audio, t0, first, 0.22);
        beep(audio, t0 + 0.26, second, 0.22);
    };
    if (audio.state === "suspended") {
        audio.resume().then(start).catch(() => undefined);
        return;
    }
    start();
};

export const disposeAudio = (): void => {
    if (!ctx) return;
    void ctx.close().catch(() => undefined);
    ctx = null;
};
