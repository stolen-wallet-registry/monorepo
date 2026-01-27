/**
 * Operator Submit Guide
 *
 * cli documentation and step-by-step guide for operators.
 * Only visible to approved operators.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Badge } from '@swr/ui';
import { Check, Copy, ExternalLink, Terminal, FileJson, Upload, Shield } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language = 'bash' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available or permission denied
      console.warn('Failed to copy to clipboard');
    }
  };

  return (
    <div className="relative group">
      <pre className="bg-muted rounded-md p-4 overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

interface StepProps {
  number: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Step({ number, title, icon, children }: StepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
          {number}
        </div>
        <div className="flex-1 w-px bg-border mt-2" />
      </div>
      <div className="flex-1 pb-8">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="font-medium">{title}</h3>
        </div>
        <div className="text-sm text-muted-foreground space-y-3">{children}</div>
      </div>
    </div>
  );
}

export interface OperatorSubmitGuideProps {
  className?: string;
}

/**
 * Step-by-step guide for operators to submit batch registrations.
 *
 * @example
 * ```tsx
 * <OperatorSubmitGuide />
 * ```
 */
export function OperatorSubmitGuide({ className }: OperatorSubmitGuideProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Batch Submission Guide</CardTitle>
          <Badge variant="secondary">Operators Only</Badge>
        </div>
        <CardDescription>
          Follow these steps to submit batch registrations using the SWR cli.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Step number={1} title="Install the SWR cli" icon={<Terminal className="h-4 w-4" />}>
          <p>Install the cli tool globally via npm:</p>
          <CodeBlock code="npm install -g @swr/cli" />
          <p>Or use npx to run without installing:</p>
          <CodeBlock code="npx @swr/cli --help" />
        </Step>

        <Step number={2} title="Prepare your input file" icon={<FileJson className="h-4 w-4" />}>
          <p>Create a JSON file with the addresses to register:</p>
          <CodeBlock
            code={`// contracts.json
{
  "contracts": [
    {
      "address": "0x1234...abcd",
      "chainId": "eip155:8453"
    },
    {
      "address": "0x5678...efgh",
      "chainId": "eip155:1"
    }
  ]
}`}
            language="json"
          />
          <p className="text-xs">
            Supported formats: JSON array, CSV with address,chainId columns, or newline-separated
            addresses.
          </p>
        </Step>

        <Step number={3} title="Build the transaction" icon={<Upload className="h-4 w-4" />}>
          <p>Generate the transaction data for Safe import:</p>
          <CodeBlock
            code={`swr submit-contracts \\
  --file ./contracts.json \\
  --env mainnet \\
  --build-only \\
  --output ./output`}
          />
          <p>This creates a Safe-compatible transaction batch in the output folder.</p>
        </Step>

        <Step number={4} title="Import to Safe" icon={<Shield className="h-4 w-4" />}>
          <p>Import the generated transaction into Safe Transaction Builder:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Open your Safe at safe.global</li>
            <li>Go to Apps &rarr; Transaction Builder</li>
            <li>Click "Upload" and select the output JSON</li>
            <li>Review and submit for signing</li>
          </ol>
        </Step>

        <Step
          number={5}
          title="Collect signatures and execute"
          icon={<Check className="h-4 w-4" />}
        >
          <p>
            Once enough signers approve, the transaction can be executed. The contracts will be
            registered in the Fraudulent Contract Registry.
          </p>
        </Step>

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-3">Need more help?</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://github.com/stolen-wallet-registry/cli"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                cli documentation
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://help.safe.global/en/articles/234052-transaction-builder"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Safe Transaction Builder
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
