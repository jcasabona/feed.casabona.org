import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://feed.casabona.org',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
