// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Replace with the real domain once it is bought.
  site: 'https://the-singularity-times.pages.dev',
  output: 'static',
  build: { inlineStylesheets: 'always' },
  // Never inline bundled <script>s into HTML: the CSP (public/_headers) allows only 'self' scripts.
  vite: { build: { assetsInlineLimit: 0 } },
});
