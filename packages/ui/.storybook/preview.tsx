import type { Preview, Decorator } from '@storybook/react-vite';
import '../src/styles/index.css';
import { ThemeWrapper } from './ThemeWrapper';
import { THEME_COMBINATIONS, type ThemeKey } from './theme-config';

const withThemeClasses: Decorator = (Story, context) => {
  const themeKey = (context.globals.theme as ThemeKey) || 'light-base';

  return (
    <ThemeWrapper themeKey={themeKey}>
      <Story />
    </ThemeWrapper>
  );
};

/** Icons for toolbar display (keyed by theme combination) */
const THEME_ICONS: Record<ThemeKey, string> = {
  'light-base': 'sun',
  'dark-base': 'moon',
  'light-hacker': 'cpu',
  'dark-hacker': 'lightning',
};

/** Generate toolbar items from THEME_COMBINATIONS to avoid drift */
const themeToolbarItems = (Object.keys(THEME_COMBINATIONS) as ThemeKey[]).map((key) => ({
  value: key,
  title: key
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' '),
  icon: THEME_ICONS[key],
}));

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Theme combination (color scheme + variant)',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: themeToolbarItems,
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light-base',
  },
  decorators: [withThemeClasses],
  parameters: {
    options: {
      storySort: {
        order: ['Primitives', 'MagicUI'],
        method: 'alphabetical',
      },
    },
    backgrounds: { disable: true },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
