import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One Markdown file per issue in /issues. The body is the lead story.
const issues = defineCollection({
  loader: glob({ pattern: '*.md', base: './issues' }),
  schema: z.object({
    number: z.number().int().nonnegative(),
    date: z.coerce.date(),
    headline: z.string(),
    dek: z.string(),
    leadArt: z
      .object({
        src: z.string(),
        alt: z.string(),
        credit: z.string().optional(),
        // Intrinsic size, so the page reserves the art's box before it loads.
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })
      .optional(),
    // Other authors' works: X post URLs, embedded, never re-uploaded.
    works: z
      .array(z.object({ url: z.string().url(), author: z.string(), note: z.string().optional() }))
      .default([]),
    prompt: z
      .object({
        question: z.string(),
        replyUrl: z.string().url().optional(),
        lastAnswers: z.array(z.object({ author: z.string(), text: z.string(), url: z.string().url() })).default([]),
      })
      .optional(),
    // Polymarket market slugs (polymarket.com/event/<slug>).
    markets: z.array(z.string()).default([]),
    visualization: z.string().optional(),
  }),
});

export const collections = { issues };
