import { create } from "zustand";

export type Tab = {
  id: string;
  directory: string;
  /** When set, tab is "on" this file; directory is the file's parent. */
  file: string | null;
  /** Tab label; only updated when user clicks a file, so folder clicks don't change the name. */
  displayLabel: string;
  /** When set, current folder section shows this folder (e.g. after opening a folder from the section). */
  pinnedFolder: string | null;
};

export type TabsState = {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  /** Set directory; pass file to show file name in tab. Pass pinnedFolder when opening a folder in the current folder section. */
  setTabDirectory: (tabId: string, directory: string, file?: string | null, pinnedFolder?: string | null) => void;
};

function generateId(): string {
  return crypto.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const initialTabId = generateId();

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export const useTabsStore = create<TabsState>((set) => ({
  tabs: [{ id: initialTabId, directory: "~", file: null, displayLabel: "~", pinnedFolder: null }],
  activeTabId: initialTabId,

  addTab: () =>
    set((state) => {
      const newTab: Tab = { id: generateId(), directory: "~", file: null, displayLabel: "~", pinnedFolder: null };
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      };
    }),

  closeTab: (id) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return state;
      const tabs = state.tabs.filter((t) => t.id !== id);
      if (tabs.length === 0) return state; // keep at least one tab
      const wasActive = state.activeTabId === id;
      let nextActive = state.activeTabId;
      if (wasActive) {
        nextActive = tabs[Math.max(0, idx - 1)]?.id ?? tabs[0]?.id ?? null;
      }
      return { tabs, activeTabId: nextActive };
    }),

  setActiveTab: (id) =>
    set((state) => {
      const exists = state.tabs.some((t) => t.id === id);
      return exists ? { activeTabId: id } : state;
    }),

  setTabDirectory: (tabId, directory, file = null, pinnedFolder = undefined) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const next: Tab = { ...t, directory, file };
        if (file != null && file !== "") {
          next.displayLabel = basename(file);
          next.pinnedFolder = null;
        } else {
          next.pinnedFolder = pinnedFolder !== undefined ? pinnedFolder : t.pinnedFolder;
        }
        return next;
      }),
    })),
}));
