/**
 * Merkle tree serialization utilities.
 *
 * Uses OpenZeppelin StandardMerkleTree dump/load format for persistence.
 */

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

/**
 * Serialize a Merkle tree to JSON string.
 * Uses OpenZeppelin's dump format for compatibility.
 *
 * @param tree - The StandardMerkleTree instance
 * @returns JSON string representation
 *
 * @example
 * ```ts
 * const { tree } = buildWalletMerkleTree(entries);
 * const json = serializeTree(tree);
 * fs.writeFileSync('tree.json', json);
 * ```
 */
export function serializeTree(tree: StandardMerkleTree<[string, string]>): string {
  return JSON.stringify(tree.dump(), null, 2);
}

/**
 * Deserialize a Merkle tree from JSON string.
 * Uses OpenZeppelin's load format for compatibility.
 *
 * @param json - JSON string from serializeTree()
 * @returns StandardMerkleTree instance
 *
 * @example
 * ```ts
 * const json = fs.readFileSync('tree.json', 'utf8');
 * const tree = deserializeTree(json);
 * const proof = tree.getProof(0);
 * ```
 */
export function deserializeTree(json: string): StandardMerkleTree<[string, string]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON in serialized tree: ${(e as Error).message}`);
  }
  try {
    // StandardMerkleTree.load accepts the output of tree.dump()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return StandardMerkleTree.load(parsed as any);
  } catch (e) {
    throw new Error(`Invalid tree format: ${(e as Error).message}`);
  }
}
