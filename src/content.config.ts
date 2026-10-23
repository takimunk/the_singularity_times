import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const link = z.url();

// One Markdown file per issue in /issues. The body is the lead story's text.
const issues = defineCollection({
  loader: glob({ pattern: '*.md', base: './issues' }),
  schema: z.object({
    number: z.number().int().nonnegative(),
    date: z.coerce.date(),
    pages: z.number().int().positive().default(1),
    lead: z.object({
      headline: z.string(),
      deck: z.string(),
      byline: z.string().optional(),
      art: z
        .object({
          src: z.string(),
          alt: z.string(),
          caption: z.string().optional(),
          width: z.number().int().positive().optional(),
          height: z.number().int().positive().optional(),
        })
        .optional(),
      placeholder: z.boolean().default(false),
    }),
    // A quest the reader copies into their own agent.
    prompt: z.object({ text: z.string(), copies: z.number().int().nonnegative().optional() }),
    exponential: z
      .object({
        title: z.string(),
        series: z.array(z.tuple([z.number(), z.number()])).min(3),
        source: z.string(),
        sourceUrl: link.optional(),
        draft: z.boolean().default(false),
      })
      .optional(),
    // Other authors' posts: embedded by URL with credit, never re-uploaded.
    fromX: z
      .array(z.object({ url: link, author: z.string(), handle: z.string(), text: z.string(), date: z.coerce.date().optional() }))
      .default([]),
    hackerNews: z
      .array(z.object({ title: z.string(), url: link, points: z.number().int(), comments: z.number().int() }))
      .default([]),
    interview: z
      .object({ title: z.string(), url: link, duration: z.string().optional(), quote: z.string().optional(), note: z.string().optional() })
      .optional(),
    interactive: z.object({ id: z.string(), title: z.string(), text: z.string() }).optional(),
    artworks: z
      .array(z.object({ title: z.string(), author: z.string(), url: link, image: z.string().optional() }))
      .default([]),
    // Masthead ears: Coinbase spot products and Polymarket market slugs.
    coins: z.array(z.string()).default(['BTC', 'ETH']),
    predictions: z.array(z.string()).default([]),
  }),
});

export const collections = { issues };
