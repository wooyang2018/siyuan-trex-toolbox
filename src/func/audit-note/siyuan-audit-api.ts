/**
 * Audit Note 思源 API 封装
 *
 * 替代原 web 项目中的 siyuan-sisyphus CLI 调用，直接使用 trex-toolbox
 * 的 src/api 层（或 fetchSyncPost）与思源 HTTP API 交互。
 */

import { fetchSyncPost } from "siyuan";
import {
  computeAnchor,
  filenameFor,
  fromAttrsAndBody,
  makeId,
  toBody,
  replaceResolution,
  type AuditEntry,
  type Severity,
} from "./lib/index";

// ─── 低层 API 请求封装 ────────────────────────────────────

async function request<T = any>(url: string, payload: any): Promise<T | null> {
  const response = await fetchSyncPost(url, payload);
  if (response?.code !== 0) {
    console.warn("[AuditNote] API failed", url, response);
    return null;
  }
  return response.data as T;
}

// ─── 思源 API 简易封装（仅本模块使用） ──────────────────────

async function sqlQuery<T = any>(stmt: string): Promise<T[]> {
  const rows = await request<any[]>("/api/query/sql", { stmt });
  return rows ?? [];
}

async function getBlockAttrs(id: string): Promise<Record<string, string>> {
  const attrs = await request<Record<string, string>>("/api/attr/getBlockAttrs", { id });
  return attrs ?? {};
}

async function setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void> {
  await request("/api/attr/setBlockAttrs", { id, attrs });
}

async function getBlockKramdown(id: string): Promise<string> {
  const data = await request<{ kramdown?: string }>("/api/block/getBlockKramdown", { id });
  return data?.kramdown || "";
}

async function getHPathByID(id: string): Promise<string> {
  const data = await request<string>("/api/filetree/getHPathByID", { id });
  return data || "";
}

async function createDocWithMd(notebook: string, path: string, markdown: string): Promise<string> {
  const docId = await request<string>("/api/filetree/createDocWithMd", { notebook, path, markdown });
  return docId ?? "";
}

async function updateBlock(id: string, markdown: string): Promise<void> {
  await request("/api/block/updateBlock", { id, dataType: "markdown", data: markdown });
}

// ─── 配置接口 ──────────────────────────────────────────────

export interface AuditNoteConfig {
  /** 存放 audit 文档的笔记本 ID */
  notebookId: string;
}

const DEFAULT_CONFIG: AuditNoteConfig = {
  notebookId: "",
};

let config = { ...DEFAULT_CONFIG };

export function setAuditConfig(cfg: Partial<AuditNoteConfig>) {
  config = { ...config, ...cfg };
}

export function getAuditConfig(): AuditNoteConfig {
  return config;
}

// ─── 公共接口 ──────────────────────────────────────────────

/**
 * 列出所有已打开的笔记本
 */
export async function listNotebooks(): Promise<{ id: string; name: string }[]> {
  const data = await request<{ notebooks: { id: string; name: string; closed: boolean }[] }>(
    "/api/notebook/lsNotebooks",
    {},
  );
  return (data?.notebooks ?? []).filter(nb => !nb.closed).map(nb => ({ id: nb.id, name: nb.name }));
}

/**
 * 列出审计条目
 * @param targetDocId 目标文档 ID（用于过滤只显示该文档的审计）
 * @param mode "open" | "resolved" | "all"
 */
export async function listAudits(
  targetDocId?: string,
  mode: "open" | "resolved" | "all" = "open",
): Promise<AuditEntry[]> {
  const notebookId = config.notebookId;
  if (!notebookId) return [];

  const sanitized = notebookId.replace(/'/g, "''");
  const stmt = `SELECT id, hpath FROM blocks WHERE box='${sanitized}' AND type='d' AND hpath LIKE '/audit/%' ORDER BY updated DESC LIMIT 500`;
  const docs = await sqlQuery<{ id: string; hpath: string }>(stmt);

  const targetHpath = targetDocId ? await getHPathByID(targetDocId) : undefined;
  const entries: AuditEntry[] = [];

  for (const doc of docs) {
    const rel = normalizeRelPath(doc.hpath);
    // Skip the root audit folder and resolved sub-folder for "open" mode
    if (rel === "audit" || rel === "audit/resolved") continue;
    if (!matchesMode(rel, mode)) continue;

    try {
      const entry = await readAuditEntry(doc.id, rel);
      // Filter by target document if specified
      if (targetHpath && normalizeRelPath(entry.target) !== normalizeRelPath(targetHpath)) continue;
      entries.push(entry);
    } catch {
      // SiYuan's SQL index can briefly return deleted documents; skip them.
    }
  }

  entries.sort((a, b) => a.created.localeCompare(b.created));
  return entries;
}

/**
 * 创建审计条目
 */
export async function createAudit(params: {
  targetDocId: string;
  rawMarkdown: string;
  selStart: number;
  selEnd: number;
  comment: string;
  severity: Severity;
}): Promise<{ id: string; entry: AuditEntry }> {
  const notebookId = config.notebookId;
  if (!notebookId) throw new Error("AuditNote: notebookId not configured");

  const { targetDocId, rawMarkdown, selStart, selEnd, comment, severity } = params;
  const targetHpath = await getHPathByID(targetDocId);

  await ensureAuditRoot(notebookId);

  const anchor = computeAnchor(rawMarkdown, selStart, selEnd);
  const id = makeId();
  const slug = comment.trim().split(/\s+/).slice(0, 5).join(" ");
  const docName = filenameFor(id, slug).replace(/\.md$/i, "");
  const relPath = `audit/${docName}`;

  const entry: AuditEntry = {
    id,
    target: targetHpath,
    target_lines: anchor.target_lines,
    anchor_before: anchor.anchor_before,
    anchor_text: anchor.anchor_text,
    anchor_after: anchor.anchor_after,
    severity,
    source: "trex-toolbox",
    created: new Date().toISOString(),
    status: "open",
    body: `# Comment\n\n${comment.trim()}\n\n# Resolution\n\n<!-- filled in when the audit is processed -->\n`,
  };

  await createDocWithMd(notebookId, `/${relPath}`, toBody(entry));
  const docId = await lookupDocId(notebookId, relPath);
  if (docId) {
    await writeAuditAttrs(docId, entry);
  }

  return { id, entry };
}

/**
 * 标记审计为已解决
 */
export async function resolveAudit(auditId: string, resolution: string): Promise<void> {
  const notebookId = config.notebookId;
  if (!notebookId) throw new Error("AuditNote: notebookId not configured");

  const docs = await findAuditDocById(notebookId, auditId);
  if (!docs || docs.length === 0) throw new Error(`AuditNote: no audit with id ${auditId}`);

  const doc = docs[0]!;
  const rel = normalizeRelPath(doc.hpath);
  const entry = await readAuditEntry(doc.id, rel);

  const today = new Date().toISOString().slice(0, 10);
  const newBody = replaceResolution(
    entry.body,
    `${today} · accepted.\n${resolution.trim() || "(no details)"}\n`,
  );
  const resolvedEntry: AuditEntry = { ...entry, status: "resolved", body: newBody };

  await updateBlock(doc.id, toBody(resolvedEntry));
  await writeAuditAttrs(doc.id, resolvedEntry);
}

/**
 * 获取文档的 markdown 内容（用于 computeAnchor）
 */
export async function getDocMarkdown(docId: string): Promise<string> {
  return getBlockKramdown(docId);
}

/**
 * 获取文档的 hpath
 */
export async function getDocHPath(docId: string): Promise<string> {
  return getHPathByID(docId);
}

// ─── 内部辅助函数 ──────────────────────────────────────────

function normalizeRelPath(hpath: string): string {
  // hpath starts with "/", strip leading "/" to get relative path
  return hpath.startsWith("/") ? hpath.slice(1) : hpath;
}

function matchesMode(rel: string, mode: string): boolean {
  if (mode === "all") return true;
  if (mode === "resolved") return rel.startsWith("audit/resolved/");
  return !rel.startsWith("audit/resolved/");
}

async function ensureAuditRoot(notebookId: string): Promise<void> {
  const sanitized = notebookId.replace(/'/g, "''");
  const stmt = `SELECT id FROM blocks WHERE box='${sanitized}' AND type='d' AND hpath='/audit' LIMIT 1`;
  const rows = await sqlQuery<{ id: string }>(stmt);
  if (rows.length === 0) {
    await createDocWithMd(notebookId, "/audit", "# Audit\n");
  }
}

async function readAuditEntry(docId: string, rel: string): Promise<AuditEntry> {
  const attrs = await getBlockAttrs(docId);
  const body = await readBodyMarkdown(docId);
  return fromAttrsAndBody(attrs, body);
}

async function readBodyMarkdown(docId: string): Promise<string> {
  const kramdown = await getBlockKramdown(docId);
  if (!kramdown) return "";
  // Strip SiYuan auto-generated frontmatter
  const m = /^---\n[\s\S]*?\n---\n?/.exec(kramdown);
  return m ? kramdown.slice(m[0].length) : kramdown;
}

async function writeAuditAttrs(docId: string, entry: AuditEntry): Promise<void> {
  await setBlockAttrs(docId, {
    "custom-title": entry.id,
    "custom-category": "audit",
    "custom-tags": `audit,${entry.severity},${entry.status}`,
    "custom-sources": entry.target,
    "custom-summary": entry.body.replace(/^#\s*Comment\s*/i, "").split(/^#\s*Resolution/im)[0]?.trim() ?? "",
    "custom-id": entry.id,
    "custom-target": entry.target,
    "custom-target-lines": JSON.stringify(entry.target_lines),
    "custom-anchor-before": entry.anchor_before,
    "custom-anchor-text": entry.anchor_text,
    "custom-anchor-after": entry.anchor_after,
    "custom-severity": entry.severity,
    "custom-source": entry.source,
    "custom-created": entry.created,
    "custom-status": entry.status,
    "custom-updated": new Date().toISOString(),
  });
}

async function lookupDocId(notebookId: string, rel: string): Promise<string | null> {
  const sanitized = notebookId.replace(/'/g, "''");
  const hpathSanitized = `/${normalizeRelPath(rel)}`.replace(/'/g, "''");
  const stmt = `SELECT id FROM blocks WHERE box='${sanitized}' AND type='d' AND hpath='${hpathSanitized}' LIMIT 1`;
  const rows = await sqlQuery<{ id: string }>(stmt);
  return rows[0]?.id ?? null;
}

async function findAuditDocById(notebookId: string, auditId: string): Promise<{ id: string; hpath: string }[]> {
  const sanitized = notebookId.replace(/'/g, "''");
  const stmt = `SELECT id, hpath FROM blocks WHERE box='${sanitized}' AND type='d' AND hpath LIKE '/audit/%' AND name LIKE '${auditId.replace(/'/g, "''")}%' LIMIT 10`;
  return sqlQuery<{ id: string; hpath: string }>(stmt);
}
