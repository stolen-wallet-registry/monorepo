export { RegistrySearch, type RegistrySearchProps } from './RegistrySearch';
export { AddressSearchResult, type AddressSearchResultProps } from './AddressSearchResult';
export {
  TransactionSearchResult,
  type TransactionSearchResultProps,
} from './TransactionSearchResult';

// `RegistrySearchResult` and its local `ResultStatus` used to be re-exported here "for
// backward compatibility". Nothing rendered the component — only its own test and story
// referenced it — and its `ResultStatus` was a hand-copied duplicate of the one in
// `@swr/search` that had since diverged: the package added 'unverified' (the state that says
// a registry could not be consulted) and this copy still declared only
// 'registered' | 'pending' | 'not-found'. Exporting the stale name from the same barrel as
// the live search components was an invitation to import the wrong one and lose exactly the
// case the search layer exists to surface. Removed rather than resynced; there is no
// deployment to be backward compatible with.
