import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { remarkAutoTypeTable } from 'fumadocs-typescript';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkAutoTypeTable],
  },
});
