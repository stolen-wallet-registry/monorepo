import path from 'node:path';

const webDir = path.join(process.cwd(), 'apps/web');

export default {
  '*.{ts,tsx,js,json,md}': 'prettier --write',
  'apps/web/**/*.{ts,tsx}': (files) => {
    // lint-staged passes absolute paths; eslint must be run from the web app
    // directory where its flat config lives, so re-anchor them relative to it.
    const filePaths = files.map((f) => path.relative(webDir, f)).join(' ');
    return `cd apps/web && eslint --fix ${filePaths}`;
  },
};
