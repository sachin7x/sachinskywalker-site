import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://sachinskywalker.com',
  integrations: [sitemap(), tailwind(), mdx()],
  markdown: { shikiConfig: { theme: 'github-dark' } },
});
