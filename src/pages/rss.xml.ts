import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { byTranslatedDesc, translatedAt } from '../utils/translation';

const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export async function GET(context: APIContext) {
  const translations = await getCollection('translations');
  const sorted = translations.sort(byTranslatedDesc);

  return rss({
    title: 'TranslateLM',
    description: 'AI 领域优质文章翻译',
    site: context.site ?? 'http://localhost:4321/',
    items: sorted.map((entry) => ({
      title: entry.data.title,
      pubDate: translatedAt(entry),
      description: entry.data.originalTitle,
      link: `${baseUrl}translations/${entry.id}/`,
      categories: entry.data.tags,
    })),
    customData: '<language>zh-CN</language>',
  });
}
