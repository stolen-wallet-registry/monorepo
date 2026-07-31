import { createInterface } from 'node:readline';

/**
 * Interactive secret prompt.
 *
 * SECURITY: the typed characters are never echoed to the terminal and the value is never
 * written to stdout/stderr. Node's readline history is disabled so the passphrase does not
 * linger in the interface's in-memory history buffer.
 */
export async function promptSecret(question: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;

  if (!input.isTTY) {
    throw new Error(
      'Cannot prompt for a passphrase: stdin is not a TTY. ' +
        'Set SWR_KEYSTORE_PASSWORD in the environment for non-interactive use.'
    );
  }

  const rl = createInterface({
    input,
    output,
    terminal: true,
    historySize: 0,
  });

  // Suppress echo: swallow everything readline would write after the prompt itself.
  let muted = false;
  const originalWrite = output.write.bind(output);
  const mutedInterface = rl as unknown as { _writeToOutput?: (text: string) => void };
  mutedInterface._writeToOutput = (text: string) => {
    if (!muted) {
      originalWrite(text);
      return;
    }
    // Preserve the prompt redraw but never the typed characters.
    if (text.includes(question)) {
      originalWrite(question);
    }
  };

  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(question, resolve);
      muted = true;
    });
    originalWrite('\n');
    return answer;
  } finally {
    muted = false;
    rl.close();
  }
}
