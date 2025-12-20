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

export const api = {
  getVersion: () => ipcRenderer.sendSync("app/version"),
  maximize: () => ipcRenderer.send("app/maximize"),
  minimize: () => ipcRenderer.send("app/minimize"),
  onToggleTitlebar: (callback: (show: boolean) => void) =>
    ipcRenderer.on("toggle-titlebar", (_event, show) => callback(show)),
  close: () => ipcRenderer.send("app/close"),
  startAuth: () => ipcRenderer.invoke("auth/start") as Promise<AuthSuccessPayload>,
  logout: () => ipcRenderer.invoke("auth/logout") as Promise<boolean>,
  getUserInfo: () => ipcRenderer.invoke("auth/getUserInfo") as Promise<GitHubUserInfo | null>,
  onAuthSuccess: (callback: (payload: AuthSuccessPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: AuthSuccessPayload) => callback(payload);
    ipcRenderer.on(AUTH_SUCCESS_CHANNEL, listener);
    return () => ipcRenderer.removeListener(AUTH_SUCCESS_CHANNEL, listener);
  },
};

contextBridge.exposeInMainWorld("electron", api);
