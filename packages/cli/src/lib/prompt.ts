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
    const answer = await new Promise<string>((resolve, reject) => {
      // Ctrl-D (EOF) and Ctrl-C fire 'close'/SIGINT without ever invoking the question
      // callback. Without these the promise never settles and the CLI hangs at the passphrase
      // prompt with echo suppressed — the worst possible place to be stuck.
      rl.once('close', () => reject(new Error('Passphrase entry cancelled.')));
      rl.once('SIGINT', () => {
        rl.close();
        reject(new Error('Passphrase entry cancelled.'));
      });
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

/**
 * Interactive confirmation prompt (echoing, unlike promptSecret).
 *
 * Returns the trimmed line the operator typed. Callers compare it against whatever token they
 * require — see `confirmSubmission` in lib/safety.ts.
 *
 * Throws when stdin is not a TTY: a batch submission is irreversible, so a piped or CI
 * invocation must opt out explicitly with `--yes` rather than have the prompt silently
 * resolve to an empty string.
 */
export async function promptLine(question: string): Promise<string> {
  const input = process.stdin;

  if (!input.isTTY) {
    throw new Error(
      'Cannot prompt for confirmation: stdin is not a TTY. ' +
        'Re-run with --yes to confirm non-interactively.'
    );
  }

  const rl = createInterface({
    input,
    output: process.stdout,
    terminal: true,
    historySize: 0,
  });

  try {
    const answer = await new Promise<string>((resolve, reject) => {
      // Same EOF/SIGINT hazard as promptSecret. Here the failure mode is milder (nothing is
      // muted) but a hung confirmation prompt still blocks a scripted operator run forever.
      // Rejecting means the caller aborts the submission, which is the safe direction.
      rl.once('close', () => reject(new Error('Confirmation cancelled.')));
      rl.once('SIGINT', () => {
        rl.close();
        reject(new Error('Confirmation cancelled.'));
      });
      rl.question(question, resolve);
    });
    return answer.trim();
  } finally {
    rl.close();
  }
}
