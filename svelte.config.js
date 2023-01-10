import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/kit/vite';
import importAssets from 'svelte-preprocess-import-assets';

const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: [vitePreprocess(), importAssets()],

  kit: {
    adapter: adapter(),
  },
};

export default config;
