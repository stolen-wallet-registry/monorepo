import type { Meta, StoryObj } from '@storybook/react';

import { FooterCTA, Footer } from './FooterCTA';

const footerCTAMeta = {
  title: 'Landing/FooterCTA',
  component: FooterCTA,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof FooterCTA>;

export default footerCTAMeta;
type FooterCTAStory = StoryObj<typeof footerCTAMeta>;

export const Default: FooterCTAStory = {};

export const WithFooter: FooterCTAStory = {
  render: () => (
    <>
      <FooterCTA />
      <Footer />
    </>
  ),
};
