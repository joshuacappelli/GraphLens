import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

const AUTH_SUCCESS_CHANNEL = "auth-success";

type AuthTokens = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
};

export type AuthSuccessPayload = {
  tokens: AuthTokens;
  uniqueId: string;
};

export type GitHubUserInfo = {
  login: string;
  email: string | null;
  name: string | null;
  avatarUrl: string;
};

// GitHub repo from live API
export type GitHubRepo = {
  id: number; // GitHub's repo ID - stable identifier
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  htmlUrl: string;
  cloneUrl: string; // SSH URL preferred
  defaultBranch: string;
};

// Tracked repo from database
export type RepoStatus = "not_indexed" | "indexing" | "ready" | "failed";

export type TrackedRepo = {
  id: number; // Database ID
  provider: string;
  externalRepoId: number; // GitHub's repo ID
  hostUrl: string;
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  localMirrorPath: string;
  enabled: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  status: RepoStatus;
  lastSyncedAt: string | null;
  headSha: string | null; // HEAD SHA of the default branch
};

// Result from syncing a repo
export type RepoSyncResult = {
  success: boolean;
  action: "cloned" | "fetched" | "up-to-date" | "error";
  headSha: string | null;
  message: string;
  repo: TrackedRepo | null;
};

// Job types
export type JobType = "FETCH_REPO" | "BUILD_ZOEKT" | "GC_INDEX";
export type JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELED";

export type Job = {
  id: number;
  jobType: JobType;
  status: JobStatus;
  priority: number;
  repoId: number | null;
  refId: number | null;
  payload: Record<string, unknown> | null;
  progress: number;
  message: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  repoFullName?: string;
};

// Input for adding a tracked repo
export type AddTrackedRepoInput = {
  externalRepoId: number;
  fullName: string;
  name: string;
  owner: string;
  cloneUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
};

export const api = {
  // Window controls
  getVersion: () => ipcRenderer.sendSync("app/version"),
  maximize: () => ipcRenderer.send("app/maximize"),
  minimize: () => ipcRenderer.send("app/minimize"),
  onToggleTitlebar: (callback: (show: boolean) => void) =>
    ipcRenderer.on("toggle-titlebar", (_event, show) => callback(show)),
  close: () => ipcRenderer.send("app/close"),

  // Auth
  startAuth: () => ipcRenderer.invoke("auth/start") as Promise<AuthSuccessPayload>,
  logout: () => ipcRenderer.invoke("auth/logout") as Promise<boolean>,
  getUserInfo: () => ipcRenderer.invoke("auth/getUserInfo") as Promise<GitHubUserInfo | null>,
  onAuthSuccess: (callback: (payload: AuthSuccessPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: AuthSuccessPayload) => callback(payload);
    ipcRenderer.on(AUTH_SUCCESS_CHANNEL, listener);
    return () => ipcRenderer.removeListener(AUTH_SUCCESS_CHANNEL, listener);
  },

  // Repos
  fetchGitHubRepos: () => ipcRenderer.invoke("repos/fetchGitHub") as Promise<GitHubRepo[]>,
  listTrackedRepos: () => ipcRenderer.invoke("repos/listTracked") as Promise<TrackedRepo[]>,
  addTrackedRepo: (input: AddTrackedRepoInput) => 
    ipcRenderer.invoke("repos/addTracked", input) as Promise<TrackedRepo>,
  removeTrackedRepo: (repoId: number) => 
    ipcRenderer.invoke("repos/remove", repoId) as Promise<TrackedRepo[]>,
  setRepoEnabled: (repoId: number, enabled: boolean) => 
    ipcRenderer.invoke("repos/setEnabled", repoId, enabled) as Promise<TrackedRepo[]>,
  syncRepoNow: (repoId: number) => 
    ipcRenderer.invoke("repos/syncNow", repoId) as Promise<RepoSyncResult>,

  // Jobs
  listActiveJobs: () => ipcRenderer.invoke("jobs/listActive") as Promise<Job[]>,
  listRecentJobs: (limit?: number) => ipcRenderer.invoke("jobs/listRecent", limit) as Promise<Job[]>,
};

contextBridge.exposeInMainWorld("electron", api);
