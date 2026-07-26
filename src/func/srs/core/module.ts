/**
 * Internal SRS core initializer.
 *
 * It keeps native riffcard projection, queue persistence and
 * settings loading behind the single public `SRS` module.
 */
import type FMiscPlugin from "@/index";
import { setPlugin, loadSettings } from "./storage";
import { initRepository } from "./card-repository";
import { initQueues } from "./queue-manager";
import type { SRSSettings } from "@/types/srs";
import { DEFAULT_SRS_SETTINGS } from "@/types/srs";
import "./index.scss";

// ===== Shared state =====
let currentSettings: SRSSettings = { ...DEFAULT_SRS_SETTINGS };

export function getSettings(): SRSSettings {
    return currentSettings;
}

// ===== Module lifecycle =====

let coreLoaded = false;

export async function load(plugin: FMiscPlugin): Promise<void> {
    if (coreLoaded) return;
    coreLoaded = true;

    setPlugin(plugin);

    try {
        currentSettings = await loadSettings();
        await initRepository();
        await initQueues();
        console.debug("[SRS-Core] Module loaded successfully");
    } catch (error) {
        console.error("[SRS-Core] Module load failed:", error);
        coreLoaded = false;
        throw error;
    }
}

export function unload(_plugin?: FMiscPlugin): void {
    if (!coreLoaded) return;
    coreLoaded = false;
    console.debug("[SRS-Core] Module unloaded");
}
