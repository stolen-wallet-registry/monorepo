import type { Preview, Decorator } from '@storybook/react-vite';
import '../src/index.css';
import { ThemeWrapper } from './ThemeWrapper';
import type { ThemeKey } from './theme-config';

// Decorator that wraps stories in ThemeWrapper
const withThemeClasses: Decorator = (Story, context) => {
  const themeKey = (context.globals.theme as ThemeKey) || 'light-base';

  return (
    <ThemeWrapper themeKey={themeKey}>
      <Story />
    </ThemeWrapper>
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Theme combination (color scheme + variant)',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'light-base', title: 'Light Base', icon: 'sun' },
          { value: 'dark-base', title: 'Dark Base', icon: 'moon' },
          { value: 'light-hacker', title: 'Light Hacker', icon: 'cpu' },
          { value: 'dark-hacker', title: 'Dark Hacker', icon: 'lightning' },
        ],
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
        order: ['Primitives', 'Composed', 'MagicUI'],
      },
    },
    backgrounds: { disable: true }, // Use theme backgrounds instead
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
};

export default preview;
