/**
 * Estimate reading time for mixed CJK/Latin markdown.
 * CJK characters read at ~400 chars/min, Latin words at ~200 wpm.
 */
export function readingTimeMinutes(body: string): number {
  const cjkChars = (body.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g) ?? []).length;
  const latinWords = body
    .replace(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(cjkChars / 400 + latinWords / 200));
}
