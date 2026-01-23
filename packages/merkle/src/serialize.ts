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
  return StandardMerkleTree.load(JSON.parse(json));
}
