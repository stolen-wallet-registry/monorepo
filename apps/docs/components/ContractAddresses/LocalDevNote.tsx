/**
 * Heading and explanation shown above the local-Anvil deployment tables.
 *
 * Shared by the hub and spoke sections so the wording cannot drift between them.
 */
export function LocalDevNote() {
  return (
    <>
      <h4>Local Development</h4>
      <p>
        These addresses are from <code>pnpm deploy:crosschain</code> using deterministic Anvil
        deployer nonces. Click any address to copy.
      </p>
    </>
  );
}
