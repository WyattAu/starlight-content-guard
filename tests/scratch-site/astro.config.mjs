import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';
import starlightContentGuard from '@wyatt/starlight-content-guard';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Scratch Site',
      sidebar: [{ label: 'Guide', autogenerate: { directory: 'guide' } }],
    }),
    mdx(),
    starlightContentGuard(),
  ],
});
