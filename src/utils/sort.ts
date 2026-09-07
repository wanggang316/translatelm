import type { CollectionEntry } from 'astro:content';

type Translation = CollectionEntry<'translations'>;

/**
 * Newest first by frontmatter `date`. `date` is day-granular, so same-day
 * entries fall back to `id` (filename, prefixed with the translation
 * timestamp) descending, i.e. most recently translated first.
 */
export function byDateDesc(a: Translation, b: Translation): number {
  const diff = b.data.date.getTime() - a.data.date.getTime();
  if (diff !== 0) return diff;
  return b.id.localeCompare(a.id);
}
