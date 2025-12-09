export default {
  '*.{ts,tsx,js,json,md}': 'prettier --write',
  'apps/web/**/*.{ts,tsx}': (files) => {
    // Run eslint from the web app directory where the config lives
    const filePaths = files.map((f) => f.replace('apps/web/', '')).join(' ');
    return `cd apps/web && eslint --fix ${filePaths}`;
  },
};
