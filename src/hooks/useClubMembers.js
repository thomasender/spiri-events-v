import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../lib/clubMembersStore';

// Set of the uids of all Vereinsmitglieder (live, shared by every caller).
export function useClubMembers() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).uids;
}

export function useIsClubMember(uid) {
  const uids = useClubMembers();
  return Boolean(uid) && uids.has(uid);
}
