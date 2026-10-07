import { defineConfig } from 'astro/config';
import { remarkTags } from './src/lib/tags.mjs';

export default defineConfig({
  site: 'https://feed.casabona.org',
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: { remarkPlugins: [remarkTags] },
});
