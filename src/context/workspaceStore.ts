import { create } from "zustand";

export type WorkspaceState = {
  root: string | null;
  setRoot: (root: string | null) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  root: null,
  setRoot: (root) => set({ root }),
}));

