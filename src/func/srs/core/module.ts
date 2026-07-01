/**
 * Internal SRS core initializer.
 *
 * It keeps FSRS scheduling, native riffcard projection, queue persistence and
 * settings loading behind the single public `SRS` module.
 */
import type FMiscPlugin from "@/index";
import { setPlugin, loadSettings, saveSettings } from "./storage";
import { initRepository } from "./card-repository";
import { initQueues } from "./queue-manager";
import { initBridge } from "./riffcard-bridge";
import type { SRSSettings } from "@/types/srs";
import { DEFAULT_SRS_SETTINGS } from "@/types/srs";
import "./index.scss";

export let enabled = false;

// ===== Shared state =====
let currentSettings: SRSSettings = { ...DEFAULT_SRS_SETTINGS };

export function getSettings(): SRSSettings {
    return currentSettings;
}

export async function updateSettings(updates: Partial<SRSSettings>): Promise<void> {
    currentSettings = { ...currentSettings, ...updates };
    await saveSettings(currentSettings);
}

export function isReady(): boolean {
    return enabled;
}

// ===== Module lifecycle =====

export async function load(plugin: FMiscPlugin): Promise<void> {
    if (enabled) return;
    enabled = true;

    setPlugin(plugin);

    try {
        // Load settings
        currentSettings = await loadSettings();

        // Initialize native riffcard repository projection and review log
        await initRepository();

        // Initialize queues (loads queues.json)
        await initQueues();

        // Initialize riffcard bridge (optional sync with native system)
        await initBridge(currentSettings);

        console.debug("[SRS-Core] Module loaded successfully");
    } catch (error) {
        console.error("[SRS-Core] Module load failed:", error);
        enabled = false;
        throw error;
    }
}

export function unload(_plugin?: FMiscPlugin): void {
    if (!enabled) return;
    enabled = false;
    console.debug("[SRS-Core] Module unloaded");
}
