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
  /** Unsaved buffer while another tab is active, or restored when returning to the tab. */
  editorDraft: string | null;
  /** Last known saved content (disk baseline) for `file`; used for dirty checks. */
  editorSavedContent: string | null;
  /** True when buffer differs from saved baseline. */
  editorDirty: boolean;
};

export type TabsState = {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  /**
   * Set directory. `file`: string = open that file; `null` = clear open file; omit/`undefined` = keep current open file (e.g. folder click).
   */
  setTabDirectory: (tabId: string, directory: string, file?: string | null, pinnedFolder?: string | null) => void;
  patchTabEditor: (
    tabId: string,
    patch: Partial<Pick<Tab, "editorDirty" | "editorDraft" | "editorSavedContent">>
  ) => void;
};

function generateId(): string {
  return crypto.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const initialTabId = generateId();

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

const emptyEditor = (): Pick<Tab, "editorDraft" | "editorSavedContent" | "editorDirty"> => ({
  editorDraft: null,
  editorSavedContent: null,
  editorDirty: false,
});

export const useTabsStore = create<TabsState>((set) => ({
  tabs: [
    {
      id: initialTabId,
      directory: "~",
      file: null,
      displayLabel: "~",
      pinnedFolder: null,
      ...emptyEditor(),
    },
  ],
  activeTabId: initialTabId,

  addTab: () =>
    set((state) => {
      const newTab: Tab = {
        id: generateId(),
        directory: "~",
        file: null,
        displayLabel: "~",
        pinnedFolder: null,
        ...emptyEditor(),
      };
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

  setTabDirectory: (tabId, directory, file, pinnedFolder) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const nextFile = file === undefined ? t.file : file;
        const next: Tab = { ...t, directory, file: nextFile };
        if (file != null && file !== "") {
          next.displayLabel = basename(file);
          next.pinnedFolder = null;
          Object.assign(next, emptyEditor());
        } else if (file === null) {
          next.pinnedFolder = pinnedFolder !== undefined ? pinnedFolder : t.pinnedFolder;
          Object.assign(next, emptyEditor());
        } else {
          next.pinnedFolder = pinnedFolder !== undefined ? pinnedFolder : t.pinnedFolder;
        }
        return next;
      }),
    })),

  patchTabEditor: (tabId, patch) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
    })),
}));
