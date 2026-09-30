import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { cmsDate } from './lib/time';

const cmsDateField = z.union([z.date(), z.string()]).transform(cmsDate);

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    date: cmsDateField,
  }),
});

const photos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/photos' }),
  schema: z.object({
    date: cmsDateField,
    images: z
      .array(z.object({ image: z.string(), alt: z.string() }))
      .min(1),
  }),
});

export const collections = { notes, photos };
