import { createDecipheriv, pbkdf2Sync, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { keccak256, type Hex } from 'viem';

/**
 * Web3 Secret Storage Definition (V3) keystore decryption.
 *
 * Implemented locally on top of `node:crypto` + viem's `keccak256` rather than pulling in
 * ethers/web3: viem exposes no keystore decryption (only `privateKeyToAccount`,
 * `mnemonicToAccount`, `hdKeyToAccount`, `toAccount`), and adding a signing-capable
 * dependency purely to read a JSON file is a larger supply-chain surface than 80 lines.
 *
 * SECURITY: nothing in this module logs, throws, or otherwise emits the passphrase, the
 * derived key, or the decrypted private key. Error messages are deliberately generic on the
 * decrypt path — see `KEYSTORE_DECRYPT_FAILED`.
 */

/** Generic failure text. Never include ciphertext, MAC values, or key material here. */
export const KEYSTORE_DECRYPT_FAILED =
  'Failed to decrypt keystore: wrong passphrase or corrupt file.';

/**
 * Minimum pbkdf2 iteration count.
 *
 * The KDF parameters are read out of the keystore file, so the file itself decides how hard it
 * is to brute-force. A keystore rewritten to `c: 1` still decrypts to the right key under the
 * right passphrase — it is a plaintext key wearing a keystore's clothes, and without a floor
 * nothing tells the operator. 100,000 is well under what geth (262,144) and ethers emit, so
 * only a deliberately weakened file trips it.
 */
export const MIN_PBKDF2_ITERATIONS = 100_000;

/** Upper bound on pbkdf2 iterations: past this the CLI hangs rather than fails. */
export const MAX_PBKDF2_ITERATIONS = 10_000_000;

/** Minimum scrypt cost parameter. 4096 = 2^12; geth/ethers use 262,144 or 131,072. */
export const MIN_SCRYPT_N = 4096;

/**
 * Memory ceiling for scrypt, in bytes.
 *
 * scrypt's working set is `128 * N * r + 128 * r * p`, all three factors file-controlled. The
 * previous `maxmem: 256 * n * r + 32MB` was derived FROM the untrusted `n`, so it granted
 * whatever the file asked for: `n = 2^26, r = 8` sizes a ~137 GB allocation the process then
 * attempts. 1 GiB is ~4x the heaviest parameters any real wallet emits (geth's n=262144, r=8
 * needs ~268 MB).
 */
export const MAX_SCRYPT_MEMORY_BYTES = 1024 * 1024 * 1024;

interface KdfParams {
  dklen?: number;
  salt?: string;
  // scrypt
  n?: number;
  r?: number;
  p?: number;
  // pbkdf2
  c?: number;
  prf?: string;
}

interface KeystoreCrypto {
  cipher?: string;
  ciphertext?: string;
  cipherparams?: { iv?: string };
  kdf?: string;
  kdfparams?: KdfParams;
  mac?: string;
}

interface KeystoreV3 {
  version?: number;
  crypto?: KeystoreCrypto;
  Crypto?: KeystoreCrypto;
}

function hexToBytes(value: string, field: string): Buffer {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (
    normalized.length === 0 ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(normalized)
  ) {
    throw new Error(`Invalid keystore: "${field}" is not valid hex.`);
  }
  return Buffer.from(normalized, 'hex');
}

function deriveKey(kdf: string, kdfparams: KdfParams, passphrase: string): Buffer {
  const dklen = kdfparams.dklen ?? 32;
  if (!Number.isInteger(dklen) || dklen < 32) {
    throw new Error('Invalid keystore: "dklen" must be an integer >= 32.');
  }
  const salt = hexToBytes(kdfparams.salt ?? '', 'kdfparams.salt');
  const secret = Buffer.from(passphrase, 'utf8');

  try {
    if (kdf === 'scrypt') {
      const n = kdfparams.n ?? 0;
      const r = kdfparams.r ?? 0;
      const p = kdfparams.p ?? 0;
      if (!n || !r || !p) {
        throw new Error('Invalid keystore: scrypt requires "n", "r" and "p".');
      }
      if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
        throw new Error('Invalid keystore: scrypt "n", "r" and "p" must be integers.');
      }
      // scrypt requires N to be a power of two. Node rejects anything else with an opaque
      // parameter error, so name the field here.
      if ((n & (n - 1)) !== 0) {
        throw new Error(`Invalid keystore: scrypt "n" must be a power of two (got ${n}).`);
      }
      if (n < MIN_SCRYPT_N) {
        throw new Error(
          `Refusing keystore: scrypt cost "n" is ${n}, below the minimum of ${MIN_SCRYPT_N}. ` +
            'A keystore this weak is close to storing the key in plaintext — re-encrypt it ' +
            'with your wallet (geth and ethers default to n=262144).'
        );
      }
      // Checked BEFORE scryptSync: the point is to refuse the allocation, not to attempt it
      // and hope the allocator says no first.
      const requiredMemory = 128 * n * r + 128 * r * p;
      if (requiredMemory > MAX_SCRYPT_MEMORY_BYTES) {
        throw new Error(
          `Refusing keystore: scrypt parameters (n=${n}, r=${r}, p=${p}) require ` +
            `${Math.round(requiredMemory / (1024 * 1024))} MB of memory, above the ` +
            `${MAX_SCRYPT_MEMORY_BYTES / (1024 * 1024)} MB ceiling. No real wallet emits ` +
            'parameters this large.'
        );
      }
      // Node's default maxmem (32MB) is below what standard keystores need
      // (n=262144, r=8 => ~268MB). Grant exactly what the (now bounded) parameters need.
      return scryptSync(secret, salt, dklen, {
        N: n,
        r,
        p,
        maxmem: requiredMemory + 32 * 1024 * 1024,
      });
    }

    if (kdf === 'pbkdf2') {
      if (kdfparams.prf && kdfparams.prf !== 'hmac-sha256') {
        throw new Error(`Unsupported keystore pbkdf2 prf: ${kdfparams.prf}`);
      }
      const c = kdfparams.c ?? 0;
      if (!c) {
        throw new Error('Invalid keystore: pbkdf2 requires "c".');
      }
      if (!Number.isInteger(c)) {
        throw new Error('Invalid keystore: pbkdf2 "c" must be an integer.');
      }
      if (c < MIN_PBKDF2_ITERATIONS) {
        throw new Error(
          `Refusing keystore: pbkdf2 iteration count "c" is ${c}, below the minimum of ` +
            `${MIN_PBKDF2_ITERATIONS}. A keystore this weak is close to storing the key in ` +
            'plaintext — re-encrypt it with your wallet.'
        );
      }
      if (c > MAX_PBKDF2_ITERATIONS) {
        throw new Error(
          `Refusing keystore: pbkdf2 iteration count "c" is ${c}, above the maximum of ` +
            `${MAX_PBKDF2_ITERATIONS}. Deriving this key would hang rather than fail.`
        );
      }
      return pbkdf2Sync(secret, salt, c, dklen, 'sha256');
    }

    throw new Error(`Unsupported keystore kdf: ${kdf}`);
  } finally {
    secret.fill(0);
  }
}

/**
 * Decrypt a V3 keystore object.
 *
 * @returns the private key as 0x-prefixed hex. The caller is responsible for not logging it.
 */
export function decryptKeystore(keystore: unknown, passphrase: string): Hex {
  if (typeof keystore !== 'object' || keystore === null) {
    throw new Error('Invalid keystore: expected a JSON object.');
  }

  const parsed = keystore as KeystoreV3;
  const crypto = parsed.crypto ?? parsed.Crypto;
  if (!crypto) {
    throw new Error('Invalid keystore: missing "crypto" section.');
  }
  if (parsed.version !== undefined && parsed.version !== 3) {
    throw new Error(`Unsupported keystore version: ${parsed.version} (expected 3).`);
  }
  if (crypto.cipher !== 'aes-128-ctr') {
    throw new Error(`Unsupported keystore cipher: ${crypto.cipher ?? 'missing'}`);
  }

  const ciphertext = hexToBytes(crypto.ciphertext ?? '', 'crypto.ciphertext');
  const iv = hexToBytes(crypto.cipherparams?.iv ?? '', 'crypto.cipherparams.iv');
  const expectedMac = hexToBytes(crypto.mac ?? '', 'crypto.mac');
  const derivedKey = deriveKey(crypto.kdf ?? '', crypto.kdfparams ?? {}, passphrase);

  try {
    // MAC = keccak256(derivedKey[16:32] || ciphertext)
    const macBytes = hexToBytes(
      keccak256(new Uint8Array(Buffer.concat([derivedKey.subarray(16, 32), ciphertext]))),
      'mac'
    );
    if (macBytes.length !== expectedMac.length || !timingSafeEqual(macBytes, expectedMac)) {
      // Deliberately generic: do not leak whether the file or the passphrase was at fault
      // beyond this, and never echo any byte of key material.
      throw new Error(KEYSTORE_DECRYPT_FAILED);
    }

    const decipher = createDecipheriv('aes-128-ctr', derivedKey.subarray(0, 16), iv);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    try {
      if (plaintext.length !== 32) {
        throw new Error(KEYSTORE_DECRYPT_FAILED);
      }
      return `0x${plaintext.toString('hex')}`;
    } finally {
      plaintext.fill(0);
    }
  } finally {
    derivedKey.fill(0);
  }
}

/** Read and decrypt a V3 keystore file from disk. */
export async function loadKeystoreFile(path: string, passphrase: string): Promise<Hex> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Failed to read keystore file: ${path}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Keystore file is not valid JSON: ${path}`);
  }

  return decryptKeystore(json, passphrase);
}
