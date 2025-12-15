import type { Meta, StoryObj } from '@storybook/react';
import { forwardRef, useRef } from 'react';

import { cn } from '../lib/utils';
import { AnimatedBeam } from './animated-beam';

const meta: Meta<typeof AnimatedBeam> = {
  title: 'MagicUI/AnimatedBeam',
  component: AnimatedBeam,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
An animated beam of light which travels along a path between two elements.

**Use cases:**
- Showcasing integrations between services
- Visualizing data flow between components
- Creating connection diagrams
- Animated architecture diagrams

**How it works:**
1. Create refs for the container, source element, and target element
2. Pass those refs to the AnimatedBeam component
3. The beam automatically calculates the path between elements
4. A gradient animates along the path continuously

**Credits:** Based on [MagicUI AnimatedBeam](https://magicui.design/docs/components/animated-beam)
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    containerRef: {
      description: 'Ref to the container element that bounds the SVG',
      table: {
        type: { summary: 'RefObject<HTMLElement>' },
        category: 'Required',
      },
    },
    fromRef: {
      description: 'Ref to the element where the beam starts',
      table: {
        type: { summary: 'RefObject<HTMLElement>' },
        category: 'Required',
      },
    },
    toRef: {
      description: 'Ref to the element where the beam ends',
      table: {
        type: { summary: 'RefObject<HTMLElement>' },
        category: 'Required',
      },
    },
    curvature: {
      description:
        'How much the beam curves. Positive = curve up, negative = curve down, 0 = straight line',
      control: { type: 'range', min: -200, max: 200, step: 10 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '0' },
        category: 'Path',
      },
    },
    reverse: {
      description: 'Reverse the animation direction (beam flows from B to A visually)',
      control: 'boolean',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
        category: 'Animation',
      },
    },
    duration: {
      description: 'Animation duration in seconds. Randomized by default for natural feel',
      control: { type: 'range', min: 1, max: 10, step: 0.5 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: 'Math.random() * 3 + 4' },
        category: 'Animation',
      },
    },
    delay: {
      description: 'Delay before animation starts (seconds)',
      control: { type: 'range', min: 0, max: 5, step: 0.1 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '0' },
        category: 'Animation',
      },
    },
    pathColor: {
      description: 'Color of the static background path',
      control: 'color',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'gray' },
        category: 'Styling',
      },
    },
    pathWidth: {
      description: 'Width of the beam path in pixels',
      control: { type: 'range', min: 1, max: 8, step: 1 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '2' },
        category: 'Styling',
      },
    },
    pathOpacity: {
      description: 'Opacity of the static background path',
      control: { type: 'range', min: 0, max: 1, step: 0.1 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '0.2' },
        category: 'Styling',
      },
    },
    gradientStartColor: {
      description: 'Start color of the animated gradient beam',
      control: 'color',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: '#ffaa40' },
        category: 'Styling',
      },
    },
    gradientStopColor: {
      description: 'End color of the animated gradient beam',
      control: 'color',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: '#9c40ff' },
        category: 'Styling',
      },
    },
    startXOffset: {
      description: 'X offset from the center of the start element',
      control: { type: 'range', min: -50, max: 50, step: 1 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '0' },
        category: 'Position',
      },
    },
    startYOffset: {
      description: 'Y offset from the center of the start element',
      control: { type: 'range', min: -50, max: 50, step: 1 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '0' },
        category: 'Position',
      },
    },
    endXOffset: {
      description: 'X offset from the center of the end element',
      control: { type: 'range', min: -50, max: 50, step: 1 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '0' },
        category: 'Position',
      },
    },
    endYOffset: {
      description: 'Y offset from the center of the end element',
      control: { type: 'range', min: -50, max: 50, step: 1 },
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '0' },
        category: 'Position',
      },
    },
    className: {
      description: 'Additional CSS classes for the SVG element',
      control: 'text',
      table: {
        type: { summary: 'string' },
        category: 'Styling',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof AnimatedBeam>;

// Helper component for circle nodes
const Circle = forwardRef<HTMLDivElement, { className?: string; children?: React.ReactNode }>(
  ({ className, children }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'z-10 flex size-12 items-center justify-center rounded-full border-2 border-border bg-background p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]',
          className
        )}
      >
        {children}
      </div>
    );
  }
);
Circle.displayName = 'Circle';

// Simple A → B beam
const DefaultDemo = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative flex h-[200px] w-[400px] items-center justify-between rounded-lg border bg-background p-10"
      ref={containerRef}
    >
      <Circle ref={fromRef}>A</Circle>
      <Circle ref={toRef}>B</Circle>
      <AnimatedBeam containerRef={containerRef} fromRef={fromRef} toRef={toRef} />
    </div>
  );
};

export const Default: Story = {
  render: () => <DefaultDemo />,
  parameters: {
    docs: {
      description: {
        story: 'Basic unidirectional beam flowing from element A to element B.',
      },
    },
  },
};

// Bidirectional beam
const BidirectionalDemo = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative flex h-[200px] w-[400px] items-center justify-between rounded-lg border bg-background p-10"
      ref={containerRef}
    >
      <Circle ref={fromRef}>A</Circle>
      <Circle ref={toRef}>B</Circle>
      <AnimatedBeam containerRef={containerRef} fromRef={fromRef} toRef={toRef} />
      <AnimatedBeam containerRef={containerRef} fromRef={fromRef} toRef={toRef} reverse />
    </div>
  );
};

export const Bidirectional: Story = {
  render: () => <BidirectionalDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Two beams flowing in opposite directions. Use two AnimatedBeam components with one having `reverse={true}`.',
      },
    },
  },
};

// Multiple inputs to single output
const MultipleInputsDemo = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const input1Ref = useRef<HTMLDivElement>(null);
  const input2Ref = useRef<HTMLDivElement>(null);
  const input3Ref = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative flex h-[300px] w-[400px] items-center justify-between rounded-lg border bg-background p-10"
      ref={containerRef}
    >
      <div className="flex flex-col justify-between gap-8">
        <Circle ref={input1Ref}>1</Circle>
        <Circle ref={input2Ref}>2</Circle>
        <Circle ref={input3Ref}>3</Circle>
      </div>
      <Circle ref={outputRef} className="size-16">
        OUT
      </Circle>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={input1Ref}
        toRef={outputRef}
        curvature={-75}
      />
      <AnimatedBeam containerRef={containerRef} fromRef={input2Ref} toRef={outputRef} />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={input3Ref}
        toRef={outputRef}
        curvature={75}
      />
    </div>
  );
};

export const MultipleInputs: Story = {
  render: () => <MultipleInputsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Multiple sources converging to a single destination. Use `curvature` prop to create curved paths that avoid overlap.',
      },
    },
  },
};

// Multiple outputs from single input
const MultipleOutputsDemo = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const output1Ref = useRef<HTMLDivElement>(null);
  const output2Ref = useRef<HTMLDivElement>(null);
  const output3Ref = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative flex h-[300px] w-[400px] items-center justify-between rounded-lg border bg-background p-10"
      ref={containerRef}
    >
      <Circle ref={inputRef} className="size-16">
        IN
      </Circle>
      <div className="flex flex-col justify-between gap-8">
        <Circle ref={output1Ref}>1</Circle>
        <Circle ref={output2Ref}>2</Circle>
        <Circle ref={output3Ref}>3</Circle>
      </div>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={inputRef}
        toRef={output1Ref}
        curvature={-75}
      />
      <AnimatedBeam containerRef={containerRef} fromRef={inputRef} toRef={output2Ref} />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={inputRef}
        toRef={output3Ref}
        curvature={75}
      />
    </div>
  );
};

export const MultipleOutputs: Story = {
  render: () => <MultipleOutputsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Single source distributing to multiple destinations. Great for showing data distribution patterns.',
      },
    },
  },
};

// Custom colors
const CustomColorsDemo = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative flex h-[200px] w-[400px] items-center justify-between rounded-lg border bg-zinc-900 p-10"
      ref={containerRef}
    >
      <Circle ref={fromRef} className="border-blue-500 bg-blue-950 text-blue-400">
        ETH
      </Circle>
      <Circle ref={toRef} className="border-green-500 bg-green-950 text-green-400">
        BASE
      </Circle>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={fromRef}
        toRef={toRef}
        gradientStartColor="#3b82f6"
        gradientStopColor="#22c55e"
        pathColor="#3b82f6"
        pathOpacity={0.3}
      />
    </div>
  );
};

export const CustomColors: Story = {
  render: () => <CustomColorsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Custom gradient colors to match your brand or theme. Set `gradientStartColor`, `gradientStopColor`, and `pathColor`.',
      },
    },
  },
};

// Curved paths demonstration
const CurvedPathsDemo = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative flex h-[300px] w-[400px] items-center justify-between rounded-lg border bg-background p-10"
      ref={containerRef}
    >
      <Circle ref={leftRef}>L</Circle>
      <Circle ref={rightRef}>R</Circle>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={leftRef}
        toRef={rightRef}
        curvature={100}
        gradientStartColor="#ef4444"
        gradientStopColor="#f97316"
        pathColor="#ef4444"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={leftRef}
        toRef={rightRef}
        curvature={-100}
        gradientStartColor="#22c55e"
        gradientStopColor="#3b82f6"
        pathColor="#22c55e"
      />
    </div>
  );
};

export const CurvedPaths: Story = {
  render: () => <CurvedPathsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Use positive and negative `curvature` values to create arcing paths. Positive curves up, negative curves down.',
      },
    },
  },
};
