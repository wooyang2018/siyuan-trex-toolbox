<script lang="ts">
  import type { Severity } from "./lib/index";

  export let selectedText = "";
  export let onSubmit: (data: { severity: Severity; comment: string }) => void;
  export let onCancel: () => void;

  let severity: Severity = "suggest";
  let comment = "";

  const severities: { value: Severity; label: string; color: string }[] = [
    { value: "info", label: "Info", color: "#3370FF" },
    { value: "suggest", label: "Suggest", color: "#34B369" },
    { value: "warn", label: "Warn", color: "#F5A623" },
    { value: "error", label: "Error", color: "#E8383D" },
  ];

  $: canSubmit = comment.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ severity, comment: comment.trim() });
  }
</script>

<div class="an-feedback">
  <!-- Header -->
  <div class="an-fb-header">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
    <span>新建标注</span>
  </div>

  <!-- Selected text preview -->
  {#if selectedText}
    <div class="an-fb-preview">
      <div class="an-fb-preview-label">选中文本</div>
      <div class="an-fb-preview-text">"{selectedText.length > 200 ? selectedText.slice(0, 200) + '...' : selectedText}"</div>
    </div>
  {/if}

  <!-- Severity selection -->
  <div class="an-fb-section">
    <div class="an-fb-label">严重程度</div>
    <div class="an-fb-severities">
      {#each severities as sev (sev.value)}
        <button
          class="an-fb-sev-btn"
          class:active={severity === sev.value}
          style="--sev-color: {sev.color}"
          on:click={() => severity = sev.value}
        >
          <span class="an-fb-sev-dot"></span>
          {sev.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Comment input -->
  <div class="an-fb-section">
    <div class="an-fb-label">评论</div>
    <textarea
      class="an-fb-textarea"
      bind:value={comment}
      placeholder="输入你的反馈..."
      rows="4"
    ></textarea>
  </div>

  <!-- Actions -->
  <div class="an-fb-actions">
    <button class="an-fb-cancel" on:click={onCancel}>取消</button>
    <button class="an-fb-submit" disabled={!canSubmit} on:click={handleSubmit}>保存</button>
  </div>
</div>

<style>
  .an-feedback {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    color: var(--an-text);
    font-size: 13px;
  }

  .an-fb-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--an-text);
  }

  .an-fb-header svg {
    color: var(--an-accent);
  }

  .an-fb-preview {
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--an-bg);
    border: 1px solid var(--an-border);
  }

  .an-fb-preview-label {
    font-size: 11px;
    color: var(--an-muted);
    margin-bottom: 6px;
    font-weight: 500;
  }

  .an-fb-preview-text {
    font-size: 12px;
    line-height: 1.5;
    color: var(--an-text);
    font-family: var(--an-font-mono);
    word-break: break-all;
    max-height: 120px;
    overflow-y: auto;
  }

  .an-fb-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .an-fb-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--an-muted);
  }

  .an-fb-severities {
    display: flex;
    gap: 6px;
  }

  .an-fb-sev-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border: 1px solid var(--an-border);
    border-radius: 6px;
    background: transparent;
    color: var(--an-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .an-fb-sev-btn:hover {
    border-color: var(--sev-color);
    color: var(--sev-color);
  }

  .an-fb-sev-btn.active {
    border-color: var(--sev-color);
    background: color-mix(in srgb, var(--sev-color) 10%, var(--an-panel));
    color: var(--sev-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--sev-color) 12%, transparent);
  }

  .an-fb-sev-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sev-color);
    opacity: 0.5;
    transition: opacity 0.15s ease;
  }

  .an-fb-sev-btn.active .an-fb-sev-dot {
    opacity: 1;
  }

  .an-fb-textarea {
    width: 100%;
    min-height: 80px;
    padding: 10px 12px;
    border: 1px solid var(--an-border);
    border-radius: 8px;
    background: var(--an-panel);
    color: var(--an-text);
    font-size: 13px;
    font-family: inherit;
    line-height: 1.5;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }

  .an-fb-textarea:focus {
    border-color: var(--an-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--an-accent) 12%, transparent);
  }

  .an-fb-textarea::placeholder {
    color: var(--an-muted);
    opacity: 0.6;
  }

  .an-fb-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .an-fb-cancel {
    padding: 6px 16px;
    border: 1px solid var(--an-border);
    border-radius: 6px;
    background: transparent;
    color: var(--an-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .an-fb-cancel:hover {
    color: var(--an-text);
    background: var(--an-panel-soft);
  }

  .an-fb-submit {
    padding: 6px 16px;
    border: 0;
    border-radius: 6px;
    background: var(--an-accent);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .an-fb-submit:hover:not(:disabled) {
    opacity: 0.9;
  }

  .an-fb-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
