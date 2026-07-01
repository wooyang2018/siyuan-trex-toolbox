/**
 * SRS Cards — Shared utilities for card creators
 */

/**
 * Strip SiYuan IAL (Inline Attribute List) lines from kramdown.
 * IAL lines look like: {: id="20240101120000-abcdef" updated="20240101120000"}
 * They appear on their own line after block content.
 *
 * Also strips trailing empty lines left after IAL removal.
 */
export function stripIAL(kramdown: string): string {
    return kramdown
        .split('\n')
        .filter(line => !line.trim().startsWith('{:'))
        .join('\n')
        .trimEnd();
}
