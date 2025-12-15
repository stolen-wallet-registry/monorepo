import type { Meta, StoryObj } from '@storybook/react';

import { Globe } from './Globe';

const meta: Meta<typeof Globe> = {
  title: 'Landing/Globe',
  component: Globe,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="relative h-[600px] w-[600px] bg-black">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Globe>;

export const Default: Story = {};

export const DarkMode: Story = {
  args: {
    config: {
      width: 800,
      height: 800,
      onRender: () => {},
      devicePixelRatio: 2,
      phi: 0,
      theta: 0.3,
      dark: 1, // Dark mode
      diffuse: 0.4,
      mapSamples: 16000,
      mapBrightness: 1.2,
      baseColor: [0.3, 0.3, 0.3],
      markerColor: [251 / 255, 100 / 255, 21 / 255],
      glowColor: [0.1, 0.1, 0.1],
      markers: [
        { location: [14.5995, 120.9842], size: 0.03 },
        { location: [19.076, 72.8777], size: 0.1 },
        { location: [40.7128, -74.006], size: 0.1 },
        { location: [51.5074, -0.1278], size: 0.08 },
        { location: [35.6762, 139.6503], size: 0.07 },
      ],
    },
  },
};

export const CustomMarkers: Story = {
  args: {
    config: {
      width: 800,
      height: 800,
      onRender: () => {},
      devicePixelRatio: 2,
      phi: 0,
      theta: 0.3,
      dark: 0,
      diffuse: 0.4,
      mapSamples: 16000,
      mapBrightness: 1.2,
      baseColor: [1, 1, 1],
      markerColor: [0.1, 0.8, 0.1], // Green markers
      glowColor: [1, 1, 1],
      markers: [
        // Major crypto hubs
        { location: [37.7749, -122.4194], size: 0.15 }, // San Francisco
        { location: [1.3521, 103.8198], size: 0.12 }, // Singapore
        { location: [22.3193, 114.1694], size: 0.1 }, // Hong Kong
        { location: [52.52, 13.405], size: 0.08 }, // Berlin
        { location: [25.2048, 55.2708], size: 0.1 }, // Dubai
      ],
    },
  },
};
