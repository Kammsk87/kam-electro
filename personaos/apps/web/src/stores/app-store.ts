import { create } from "zustand";

type AppState = {
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  activeWorkspaceId: null,
  setActiveWorkspaceId: (workspaceId) => set({ activeWorkspaceId: workspaceId })
}));
