<script lang="ts">
  import type { AuditEntry, Severity } from "./lib/index";

  export let entries: AuditEntry[] = [];
  export let onResolve: (entry: AuditEntry) => void;
  export let onOpenSettings: () => void;
  export let loading = false;

  $: openEntries = entries.filter(e => e.status === "open");
  $: resolvedEntries = entries.filter(e => e.status === "resolved");

  const severityConfig: Record<Severity, { label: string; color: string; bg: string }> = {
    info: { label: "Info", color: "#3370FF", bg: "rgba(51, 112, 255, 0.08)" },
    suggest: { label: "Suggest", color: "#34B369", bg: "rgba(52, 179, 105, 0.08)" },
    warn: { label: "Warn", color: "#F5A623", bg: "rgba(245, 166, 35, 0.08)" },
    error: { label: "Error", color: "#E8383D", bg: "rgba(232, 56, 61, 0.08)" },
  };

  function formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${mo}-${day} ${hh}:${mm}`;
    } catch {
      return iso;
    }
  }

  function extractComment(body: string): string {
    const m = body.replace(/^#\s*Comment\s*/i, "").split(/^#\s*Resolution/im)[0]?.trim() ?? "";
    return m.length > 120 ? m.slice(0, 120) + "..." : m;
  }
</script>

<div class="an-panel">
  <!-- Header -->
  <div class="an-header">
    <div class="an-brand">
      <svg class="an-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      <span class="an-title">Audit Note</span>
    </div>
    <div class="an-header-right">
      <span class="an-count">{openEntries.length} open</span>
      <button class="an-settings-btn" on:click={onOpenSettings} title="设置">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Loading -->
  {#if loading}
    <div class="an-loading">
      <div class="an-spinner"></div>
      <span>Loading...</span>
    </div>
  {:else if openEntries.length === 0}
    <!-- Empty state -->
    <div class="an-empty">
      <svg class="an-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <div class="an-empty-text">当前文档无待处理审计</div>
    </div>
  {:else}
    <!-- Entry list -->
    <div class="an-list">
      {#each openEntries as entry (entry.id)}
        <div class="an-card" style="--sev-color: {severityConfig[entry.severity].color}; --sev-bg: {severityConfig[entry.severity].bg}">
          <div class="an-card-severity-bar"></div>
          <div class="an-card-body">
            <div class="an-card-top">
              <span class="an-severity-badge" style="color: {severityConfig[entry.severity].color}; background: {severityConfig[entry.severity].bg}">
                {severityConfig[entry.severity].label}
              </span>
              <span class="an-card-time">{formatTime(entry.created)}</span>
            </div>
            <div class="an-card-comment">{extractComment(entry.body)}</div>
            {#if entry.anchor_text}
              <div class="an-card-anchor">"{entry.anchor_text.length > 80 ? entry.anchor_text.slice(0, 80) + '...' : entry.anchor_text}"</div>
            {/if}
            <div class="an-card-actions">
              <button class="an-resolve-btn" on:click={() => onResolve(entry)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                标记已解决
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .an-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .an-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--an-border);
    user-select: none;
  }

  .an-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .an-brand-icon {
    width: 18px;
    height: 18px;
    color: var(--an-accent);
  }

  .an-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--an-text);
  }

  .an-count {
    font-size: 11px;
    color: var(--an-muted);
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--an-panel-soft);
    border: 1px solid var(--an-border);
  }

  .an-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .an-settings-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--an-border);
    border-radius: 6px;
    background: transparent;
    color: var(--an-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .an-settings-btn:hover {
    color: var(--an-text);
    border-color: var(--an-accent);
    background: var(--an-panel-soft);
  }

  .an-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    color: var(--an-muted);
    font-size: 13px;
  }

  .an-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--an-border);
    border-top-color: var(--an-accent);
    border-radius: 50%;
    animation: anSpin 0.8s linear infinite;
  }

  @keyframes anSpin {
    to { transform: rotate(360deg); }
  }

  .an-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    gap: 12px;
  }

  .an-empty-icon {
    width: 40px;
    height: 40px;
    color: #34B369;
    opacity: 0.6;
  }

  .an-empty-text {
    font-size: 13px;
    color: var(--an-muted);
  }

  .an-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .an-card {
    display: flex;
    border-radius: 8px;
    border: 1px solid var(--an-border);
    background: var(--an-panel);
    overflow: hidden;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .an-card:hover {
    border-color: color-mix(in srgb, var(--sev-color, var(--an-accent)) 30%, var(--an-border));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .an-card-severity-bar {
    width: 4px;
    flex-shrink: 0;
    background: var(--sev-color, var(--an-border));
  }

  .an-card-body {
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .an-card-top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .an-severity-badge {
    display: inline-flex;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .an-card-time {
    font-size: 10px;
    color: var(--an-muted);
    font-family: var(--an-font-mono);
    margin-left: auto;
  }

  .an-card-comment {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--an-text);
    word-break: break-word;
  }

  .an-card-anchor {
    font-size: 11px;
    color: var(--an-muted);
    font-style: italic;
    line-height: 1.45;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--an-bg);
    border-left: 2px solid var(--an-border);
  }

  .an-card-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 2px;
  }

  .an-resolve-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid var(--an-border);
    border-radius: 6px;
    background: transparent;
    color: var(--an-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .an-resolve-btn:hover {
    color: #34B369;
    border-color: color-mix(in srgb, #34B369 40%, var(--an-border));
    background: rgba(52, 179, 105, 0.06);
  }
</style>
