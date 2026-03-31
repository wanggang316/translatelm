import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const translations = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/translations' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    originalUrl: z.string().url().optional(),
    originalTitle: z.string().optional(),
    author: z.string().optional(),
    source: z.string().optional(),
  }),
});

export const collections = { translations };
