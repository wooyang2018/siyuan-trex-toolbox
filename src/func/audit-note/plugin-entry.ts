/**
 * Audit Note 插件入口（trex-toolbox 模块化版）
 *
 * 负责：
 *   - Dock 面板注册
 *   - 块菜单集成（"添加标注" 菜单项）
 *   - 选中文本 → 唤起反馈对话框
 *   - 面板挂载/卸载
 */

import { Dialog, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import AuditNotePanel from "./AuditNotePanel.svelte";
import FeedbackDialog from "./FeedbackDialog.svelte";
import {
  listAudits,
  createAudit,
  resolveAudit,
  getDocMarkdown,
  getDocHPath,
  setAuditConfig,
  getAuditConfig,
} from "./siyuan-audit-api";
import type { AuditEntry, Severity } from "./lib/index";
import { AUDIT_NOTE_SVG_SYMBOL, ICON_ID } from "./icon";

const DOCK_TYPE = "-audit-note-dock";

type PanelApp = InstanceType<typeof AuditNotePanel>;

const SETTINGS_FILE = "audit-note-settings.json";

interface AuditNoteSettings {
  notebookId: string;
  author: string;
}

const defaultSettings: AuditNoteSettings = {
  notebookId: "",
  author: "trex-toolbox",
};

interface ModuleState {
  plugin: FMiscPlugin | null;
  settings: AuditNoteSettings;
  panels: Set<PanelApp>;
  onClickBlockIcon: ((event: any) => void) | null;
  onOpenMenuContent: ((event: any) => void) | null;
  registered: boolean;
}

const state: ModuleState = {
  plugin: null,
  settings: { ...defaultSettings },
  panels: new Set(),
  onClickBlockIcon: null,
  onOpenMenuContent: null,
  registered: false,
};

// =============================================================================
// 模块生命周期
// =============================================================================

export async function load(plugin: FMiscPlugin): Promise<void> {
  state.plugin = plugin;
  state.settings = await loadSettings(plugin);
  applySettings();

  if (!state.registered) {
    plugin.addIcons(AUDIT_NOTE_SVG_SYMBOL);
    registerDock(plugin);
    registerCommand(plugin);
    state.registered = true;
  }

  registerEventListeners(plugin);
}

export function unload(plugin?: FMiscPlugin): void {
  const p = plugin || state.plugin;
  unregisterEventListeners(p);

  for (const panel of Array.from(state.panels)) {
    try {
      panel.$destroy();
    } catch (e) {
      console.warn("[AuditNote] panel destroy failed", e);
    }
  }
  state.panels.clear();
  state.plugin = null;
}

// =============================================================================
// 配置管理
// =============================================================================

async function loadSettings(plugin: FMiscPlugin): Promise<AuditNoteSettings> {
  try {
    const data = await plugin.loadData(SETTINGS_FILE);
    return { ...defaultSettings, ...(data || {}) };
  } catch {
    return { ...defaultSettings };
  }
}

function applySettings() {
  setAuditConfig({
    notebookId: state.settings.notebookId,
    author: state.settings.author,
  });
}

async function saveSettings(plugin: FMiscPlugin, next: AuditNoteSettings): Promise<void> {
  state.settings = next;
  applySettings();
  await plugin.saveData(SETTINGS_FILE, next);
}

// =============================================================================
// Dock 注册与切换
// =============================================================================

function registerDock(plugin: FMiscPlugin) {
  plugin.addDock({
    config: {
      position: "RightBottom",
      size: { width: 400, height: 0 },
      icon: ICON_ID,
      title: "Audit Note",
    },
    type: DOCK_TYPE,
    data: {},
    init: function (dock: any) {
      const el = (dock?.element || this.element) as HTMLElement;
      if (!el) return;
      el.classList.add("audit-note-dock");
      const panel = mountPanel(el);
      (el as any).__audit_panel = panel;
    },
    destroy: function () {
      const el = this.element as HTMLElement;
      if (!el) return;
      const panel = (el as any).__audit_panel as PanelApp | undefined;
      if (panel) {
        try {
          panel.$destroy();
        } catch (e) {
          console.warn("[AuditNote] dock destroy failed", e);
        }
        state.panels.delete(panel);
      }
    },
  });
}

function toggleDock(forceState: "open" | "close") {
  const selector = `.dock__item[data-type$="${DOCK_TYPE}"], .dock__item[data-hotkeylangid$="${DOCK_TYPE}"]`;
  const dockBtn = document.querySelector(selector) as HTMLElement | null;
  if (!dockBtn) return;
  const panelEl = document.querySelector(".audit-note-dock") as HTMLElement | null;
  const isVisible = !!(panelEl && panelEl.getClientRects().length > 0 && panelEl.offsetHeight > 0);
  if (forceState === "open" && !isVisible) {
    dockBtn.click();
  } else if (forceState === "close" && isVisible) {
    dockBtn.click();
  }
}

// =============================================================================
// 命令 / 快捷键
// =============================================================================

function registerCommand(plugin: FMiscPlugin) {
  plugin.addCommand({
    langKey: "openAuditNote",
    langText: "打开 Audit Note",
    hotkey: "⌥⇧A",
    callback: () => {
      toggleDock("open");
    },
  });
}

// =============================================================================
// 事件监听（块菜单 / 内容菜单）
// =============================================================================

function registerEventListeners(plugin: FMiscPlugin) {
  state.onClickBlockIcon = onClickBlockIcon;
  state.onOpenMenuContent = onOpenMenuContent;
  plugin.eventBus.on("click-blockicon", state.onClickBlockIcon);
  plugin.eventBus.on("open-menu-content", state.onOpenMenuContent);
}

function unregisterEventListeners(plugin?: FMiscPlugin | null) {
  if (!plugin) return;
  if (state.onClickBlockIcon) {
    plugin.eventBus.off("click-blockicon", state.onClickBlockIcon);
    state.onClickBlockIcon = null;
  }
  if (state.onOpenMenuContent) {
    plugin.eventBus.off("open-menu-content", state.onOpenMenuContent);
    state.onOpenMenuContent = null;
  }
}

function getDetail(eventOrDetail: any) {
  return eventOrDetail?.detail || eventOrDetail || {};
}

function addMenuItem(menu: any, label: string, callback: () => void) {
  if (!menu?.addItem) return;
  menu.addItem({
    icon: ICON_ID,
    label,
    click: callback,
  });
}

function onClickBlockIcon(eventOrDetail: any) {
  const detail = getDetail(eventOrDetail);
  addMenuItem(detail.menu, "添加标注", () => {
    const blocks = Array.from((detail.blockElements || []) as HTMLElement[]);
    const id = extractBlockIdFromElement(blocks[0]);
    if (id) {
      openFeedbackForDoc(id);
    }
  });
}

function onOpenMenuContent(eventOrDetail: any) {
  const detail = getDetail(eventOrDetail);
  addMenuItem(detail.menu, "添加标注", () => {
    const id =
      extractBlockIdFromElement(detail.element) ||
      extractBlockIdFromElement(detail.protyle?.element) ||
      detail.protyle?.block?.id ||
      detail.protyle?.options?.blockId ||
      "";
    if (id) {
      openFeedbackForDoc(id);
    } else {
      showMessage("未识别到文档 ID");
    }
  });
}

// =============================================================================
// 反馈对话框
// =============================================================================

function openFeedbackForDoc(docId: string) {
  const plugin = state.plugin;
  if (!plugin) return;

  // Check configuration
  const cfg = getAuditConfig();
  if (!cfg.notebookId) {
    showMessage("请先在设置中配置 Audit Notebook ID");
    return;
  }

  // Get selected text from current selection
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || "";

  let feedbackPanel: InstanceType<typeof FeedbackDialog> | undefined;
  const dialog = new Dialog({
    title: "新建标注",
    content: `<div id="AuditNoteFeedback" style="height: 100%;"></div>`,
    width: "480px",
    destroyCallback: () => {
      feedbackPanel?.$destroy();
    },
  });

  feedbackPanel = new FeedbackDialog({
    target: dialog.element.querySelector("#AuditNoteFeedback") as HTMLElement,
    props: {
      selectedText,
      onCancel: () => dialog.destroy(),
      onSubmit: async (data: { severity: Severity; comment: string }) => {
        dialog.destroy();
        await handleCreateAudit(docId, selectedText, data);
      },
    },
  });
}

async function handleCreateAudit(
  docId: string,
  selectedText: string,
  data: { severity: Severity; comment: string },
) {
  const plugin = state.plugin;
  if (!plugin) return;

  try {
    // Get the document markdown
    const markdown = await getDocMarkdown(docId);
    if (!markdown.trim()) {
      showMessage("无法获取文档内容");
      return;
    }

    // Compute character offsets from selected text
    const { selStart, selEnd } = findSelectionOffsets(markdown, selectedText);

    await createAudit({
      targetDocId: docId,
      rawMarkdown: markdown,
      selStart,
      selEnd,
      comment: data.comment,
      severity: data.severity,
    });

    showMessage("标注已创建");
    // Refresh panels
    refreshAllPanels();
  } catch (err) {
    console.error("[AuditNote] create audit failed", err);
    showMessage(`创建标注失败: ${err}`);
  }
}

/**
 * Find the character offsets of selectedText in markdown.
 * Falls back to [0, 0] if not found.
 */
function findSelectionOffsets(markdown: string, selectedText: string): { selStart: number; selEnd: number } {
  if (!selectedText) return { selStart: 0, selEnd: 0 };
  const idx = markdown.indexOf(selectedText);
  if (idx >= 0) {
    return { selStart: idx, selEnd: idx + selectedText.length };
  }
  // Try finding a substring match
  const lines = selectedText.split("\n").filter(l => l.trim());
  if (lines.length > 0) {
    const firstLine = lines[0]!.trim();
    const idx2 = markdown.indexOf(firstLine);
    if (idx2 >= 0) {
      return { selStart: idx2, selEnd: idx2 + firstLine.length };
    }
  }
  return { selStart: 0, selEnd: 0 };
}

// =============================================================================
// 解决审计
// =============================================================================

export async function handleResolveAudit(entry: AuditEntry) {
  const plugin = state.plugin;
  if (!plugin) return;

  // Use prompt via Dialog
  let resolutionPanel: any;
  let resolutionText = "";
  const dialog = new Dialog({
    title: "标记已解决",
    content: `<div id="AuditNoteResolve" style="height: 100%;"></div>`,
    width: "400px",
    destroyCallback: () => {
      resolutionPanel?.$destroy?.();
    },
  });

  const container = dialog.element.querySelector("#AuditNoteResolve") as HTMLElement;
  if (!container) return;

  // Simple resolve dialog using inline HTML
  container.innerHTML = `
    <div class="an-resolve-dialog">
      <div class="an-resolve-label">解决说明</div>
      <textarea class="an-resolve-textarea" rows="3" placeholder="输入解决说明..."></textarea>
      <div class="an-resolve-actions">
        <button class="an-resolve-cancel">取消</button>
        <button class="an-resolve-submit">确认解决</button>
      </div>
    </div>
  `;

  const textarea = container.querySelector(".an-resolve-textarea") as HTMLTextAreaElement;
  const cancelBtn = container.querySelector(".an-resolve-cancel") as HTMLButtonElement;
  const submitBtn = container.querySelector(".an-resolve-submit") as HTMLButtonElement;

  cancelBtn.onclick = () => dialog.destroy();
  submitBtn.onclick = async () => {
    const resolution = textarea.value.trim() || "(no details)";
    dialog.destroy();
    try {
      await resolveAudit(entry.id, resolution);
      showMessage("审计已标记为已解决");
      refreshAllPanels();
    } catch (err) {
      console.error("[AuditNote] resolve audit failed", err);
      showMessage(`解决审计失败: ${err}`);
    }
  };
}

// =============================================================================
// 面板挂载与刷新
// =============================================================================

function mountPanel(target: HTMLElement): PanelApp {
  const panel = new AuditNotePanel({
    target,
    props: {
      entries: [],
      loading: true,
      onResolve: handleResolveAudit,
    },
  });

  state.panels.add(panel);

  // Initial load
  refreshPanel(panel);

  return panel;
}

async function refreshPanel(panel: PanelApp) {
  try {
    panel.$set({ loading: true });
    const currentDocId = findCurrentDocumentId();
    const entries = await listAudits(currentDocId || undefined);
    panel.$set({ entries, loading: false });
  } catch (err) {
    console.error("[AuditNote] refresh panel failed", err);
    panel.$set({ loading: false });
  }
}

function refreshAllPanels() {
  for (const panel of state.panels) {
    refreshPanel(panel);
  }
}

// =============================================================================
// DOM 工具函数
// =============================================================================

function extractBlockIdFromElement(element: Element | null | undefined): string {
  if (!element) return "";
  const target = element.closest("[data-node-id]");
  if (!(target instanceof HTMLElement)) return "";
  const id = target.getAttribute("data-node-id") || target.dataset.nodeId || "";
  return /^\d{14}-[a-z0-9]{7}$/.test(id) ? id : "";
}

function findCurrentDocumentId(): string {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.closest(".protyle") : null;
  if (active instanceof HTMLElement && !isElementHidden(active)) {
    const id = extractProtyleDocId(active);
    if (id) return id;
  }

  const center = document.querySelector(".layout__center");
  if (center instanceof HTMLElement) {
    const protyles = center.querySelectorAll(".protyle");
    for (const protyle of Array.from(protyles)) {
      if (protyle instanceof HTMLElement && !isElementHidden(protyle)) {
        const id = extractProtyleDocId(protyle);
        if (id) return id;
      }
    }
  }

  return "";
}

function isElementHidden(el: HTMLElement): boolean {
  let curr: HTMLElement | null = el;
  while (curr && curr !== document.body) {
    if (curr.classList.contains("fn__none") || curr.style.display === "none") {
      return true;
    }
    curr = curr.parentElement;
  }
  return false;
}

function extractProtyleDocId(protyle: HTMLElement): string {
  const candidates = [
    protyle.querySelector(".protyle-title[data-node-id]"),
    protyle.querySelector(".protyle-background[data-node-id]"),
    protyle.querySelector(".protyle-wysiwyg[data-node-id]"),
    protyle.querySelector("[data-node-id]"),
  ];

  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement) {
      const id = candidate.getAttribute("data-node-id") || candidate.dataset.nodeId || "";
      if (/^\d{14}-[a-z0-9]{7}$/.test(id)) return id;
    }
  }
  return "";
}
