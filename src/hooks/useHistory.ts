import { useSyncExternalStore } from "react";
import { createHistoryStore, type HistoryStore } from "../lib/history";
import type { HistoryEntry } from "../lib/historyTypes";

const EMPTY: HistoryEntry[] = [];

// Created on first use so importing this module never touches localStorage.
let store: HistoryStore | null = null;
function getStore(): HistoryStore {
  store ??= createHistoryStore();
  return store;
}

export function useHistory() {
  const s = getStore();
  const entries = useSyncExternalStore(s.subscribe, s.getSnapshot, () => EMPTY);
  return {
    entries,
    add: s.add,
    update: s.update,
    remove: s.remove,
    clear: s.clear,
    available: s.available,
  };
}
