function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return escapeHtml(trimmed);
  return '#';
}

/**
 * Safe minimal markdown-to-HTML formatter (escapes all raw HTML first).
 * Supports **bold**, *italic*, `code`, [label](https://...), and bullet lists.
 */
export function renderSafeMarkdown(input: string): string {
  if (!input.trim()) return '';
  const escaped = escapeHtml(input);
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;

  const formatInline = (line: string): string =>
    line
      .replace(/`([^`]+)`/g, '<code class="rounded bg-[var(--muted-bg)] px-1.5 py-0.5 font-mono text-[12px]">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[var(--text)]">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_m, label: string, url: string) =>
          `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer" class="text-[var(--accent-text)] underline underline-offset-2">${label}</a>`,
      );

  for (const rawLine of lines) {
    const bullet = rawLine.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        out.push('<ul class="my-1.5 list-disc space-y-1 pl-5">');
        inList = true;
      }
      out.push(`<li>${formatInline(bullet[1])}</li>`);
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      if (rawLine.trim()) {
        out.push(`<p class="my-1.5">${formatInline(rawLine)}</p>`);
      }
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

