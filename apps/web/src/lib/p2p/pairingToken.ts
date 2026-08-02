/**
 * Pairing token: the single artifact exchanged out of band to start a P2P relay session.
 *
 * SECURITY (audit V4/V22). The gas-paying helper is agreeing to spend its own money
 * registering ONE specific wallet as permanently stolen. Until now the only thing it
 * received out of band was a peer ID, and the wallet it paid for arrived over the wire in the
 * peer's own CONNECT payload — so "which wallet am I helping" was whatever the peer that
 * connected first said it was. That is an authorization gap, not an authentication one: an
 * attacker who names its OWN wallet can sign anything you challenge it with, so no handshake
 * closes it. The helper has to learn the address from outside the channel.
 *
 * The token folds that address into the artifact the two people already exchange, so the
 * helper holds the wallet address before it accepts anything, and no new field is typed by
 * anyone. The party being helped copies one string; the helper pastes it into the one input
 * the flow already has.
 *
 * Format: `swr1:<peerId>:<0x-address>`
 *   - `swr1` is a version tag. Peer IDs never contain `:`, so a token is unambiguously
 *     distinguishable from a bare peer ID — which is what makes a legacy paste a hard,
 *     explained rejection rather than a silent downgrade back to the unbound behaviour.
 *   - `:` separates cleanly: peer IDs are base58btc/base32 alphanumerics, addresses are
 *     `0x` + hex. Neither can contain the separator.
 *   - One line, no whitespace, survives chat clients and clipboards.
 */

import { peerIdFromString } from '@libp2p/peer-id';
import { isPeerId } from '@libp2p/interface';
import { isAddress, type Address } from '@/lib/types/ethereum';

/** Version tag; bump only if the token's field layout changes. */
export const PAIRING_TOKEN_VERSION = 'swr1';

export interface PairingToken {
  /** libp2p peer ID of the party being helped. */
  peerId: string;
  /** Wallet the helper is agreeing to pay for. */
  address: Address;
}

export type PairingTokenError =
  | 'empty'
  | 'legacy-peer-id'
  | 'malformed'
  | 'invalid-peer-id'
  | 'invalid-address';

export type DecodePairingTokenResult =
  | { ok: true; token: PairingToken }
  | { ok: false; error: PairingTokenError; message: string };

/** Whether a string parses as a libp2p peer ID. */
function looksLikePeerId(value: string): boolean {
  try {
    return isPeerId(peerIdFromString(value));
  } catch {
    return false;
  }
}

/**
 * Build the token shown to the party being helped.
 *
 * @param peerId - The local libp2p peer ID
 * @param address - The local wallet address being registered
 */
export function encodePairingToken(peerId: string, address: Address): string {
  return `${PAIRING_TOKEN_VERSION}:${peerId}:${address}`;
}

/**
 * Parse a pasted pairing token.
 *
 * Never falls back to accepting a bare peer ID: doing so would restore exactly the
 * unauthorized-wallet path the token exists to close, and it would do so silently, which is
 * worse than failing. The legacy shape gets its own error so the message can say what to ask
 * for instead of "invalid input".
 */
export function decodePairingToken(raw: string): DecodePairingTokenResult {
  const value = raw.trim();

  if (!value) {
    return { ok: false, error: 'empty', message: 'Paste the pairing code from your partner.' };
  }

  if (!value.includes(':')) {
    if (looksLikePeerId(value)) {
      return {
        ok: false,
        error: 'legacy-peer-id',
        message:
          'That is a Peer ID on its own, which does not say which wallet you would be paying for. Ask your partner for the full pairing code shown on their screen (it starts with "swr1:").',
      };
    }
    return {
      ok: false,
      error: 'malformed',
      message: 'That is not a pairing code. It should start with "swr1:".',
    };
  }

  const parts = value.split(':');
  // Destructured before the length check so the `undefined` guards below narrow both fields.
  // `noUncheckedIndexedAccess` types every element as `string | undefined`, and a bare
  // `parts.length !== 3` does not narrow indexed access — hence the explicit checks.
  const [version, peerId, address] = parts;
  if (
    parts.length !== 3 ||
    version !== PAIRING_TOKEN_VERSION ||
    peerId === undefined ||
    address === undefined
  ) {
    return {
      ok: false,
      error: 'malformed',
      message: 'That pairing code is not in the expected format (swr1:<peer id>:<wallet address>).',
    };
  }

  if (!looksLikePeerId(peerId)) {
    return {
      ok: false,
      error: 'invalid-peer-id',
      message: 'The Peer ID inside that pairing code is not valid. Ask for a fresh code.',
    };
  }

  // `isAddress` narrows rather than asserts: this is where pasted text becomes the address
  // the helper will pay to register, and the value is compared against a recovered signer.
  if (!isAddress(address)) {
    return {
      ok: false,
      error: 'invalid-address',
      message: 'The wallet address inside that pairing code is not valid. Ask for a fresh code.',
    };
  }

  return { ok: true, token: { peerId, address } };
}

/** Case-insensitive address comparison, for matching a token against a recovered signer. */
export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
