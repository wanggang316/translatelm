import type { CollectionEntry } from 'astro:content';

type Translation = CollectionEntry<'translations'>;

/** Translation timestamps in entry ids are written in this zone. */
const TRANSLATION_TIME_ZONE = 'Asia/Shanghai';
const TRANSLATION_UTC_OFFSET_HOURS = 8;

const ID_TIMESTAMP = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})/;

/**
 * When the article was translated, parsed from the entry id
 * (`yyyyMMdd-HHmmss-SSS-<slug>`). Falls back to the frontmatter `date`
 * for ids without the timestamp prefix.
 */
export function translatedAt(entry: Translation): Date {
  const m = ID_TIMESTAMP.exec(entry.id);
  if (!m) return entry.data.date;
  const [, y, mo, d, h, mi, s, ms] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - TRANSLATION_UTC_OFFSET_HOURS, mi, s, ms));
}

/** Most recently translated first; ties broken by id descending. */
export function byTranslatedDesc(a: Translation, b: Translation): number {
  const diff = translatedAt(b).getTime() - translatedAt(a).getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Day-granular zh-CN date, always rendered in the translation zone. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TRANSLATION_TIME_ZONE,
  });
}
