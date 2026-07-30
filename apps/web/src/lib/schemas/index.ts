/**
 * Zod schemas barrel export.
 *
 * Only the schemas the app actually consumes are re-exported. address.ts stays as an
 * internal dependency of registration.ts; signature.ts was removed entirely (nothing
 * validated signatures through Zod — relayed P2P payloads are validated in
 * `lib/p2p/signatureData.ts`, and viem's types cover the rest).
 */

export { initialFormSchema, type InitialFormInput } from './registration';
