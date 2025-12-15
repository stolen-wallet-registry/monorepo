import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
const __dirname = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    getAbsolutePath('@chromatic-com/storybook'),
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-docs'),
  ],
  framework: getAbsolutePath('@storybook/react-vite'),
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src'),
        },
      },
    });
  },
};
export default config;
