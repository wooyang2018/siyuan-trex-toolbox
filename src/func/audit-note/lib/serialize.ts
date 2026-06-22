import { AuditEntrySchema, type AuditEntry } from "./schema";

/**
 * Render an AuditEntry as body content only (no YAML frontmatter).
 * The body contains the `# Comment` and optional `# Resolution` sections.
 */
export function toBody(entry: AuditEntry): string {
  const bodyText = entry.body && entry.body.trim().length > 0 ? entry.body : defaultBody();
  return bodyText.trimEnd() + "\n";
}

/**
 * Build an AuditEntry from custom-* attributes and body text.
 */
export function fromAttrsAndBody(attrs: Record<string, string>, body: string): AuditEntry {
  const targetLinesRaw = attrs["custom-target-lines"] ?? "[]";
  let targetLines: [number, number] = [1, 1];
  try {
    const parsed = JSON.parse(targetLinesRaw);
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "number" && typeof parsed[1] === "number") {
      targetLines = parsed as [number, number];
    }
  } catch {
    // fallback to default
  }

  return AuditEntrySchema.parse({
    id: attrs["custom-id"] ?? "",
    target: attrs["custom-target"] ?? "",
    target_lines: targetLines,
    anchor_before: attrs["custom-anchor-before"] ?? "",
    anchor_text: attrs["custom-anchor-text"] ?? "",
    anchor_after: attrs["custom-anchor-after"] ?? "",
    severity: attrs["custom-severity"] ?? "info",
    author: attrs["custom-author"] ?? "",
    source: attrs["custom-source"] ?? "trex-toolbox",
    created: attrs["custom-created"] ?? new Date().toISOString(),
    status: attrs["custom-status"] ?? "open",
    body: body ?? "",
  });
}

function defaultBody(): string {
  return `# Comment\n\n<!-- describe the feedback here -->\n\n# Resolution\n\n<!-- filled in when the audit is processed -->\n`;
}

/**
 * Replace the Resolution section in a body string.
 */
export function replaceResolution(body: string, newBlock: string): string {
  const re = /# Resolution[\s\S]*$/;
  if (re.test(body)) {
    return body.replace(re, `# Resolution\n\n${newBlock}`);
  }
  return `${body.trimEnd()}\n\n# Resolution\n\n${newBlock}`;
}
