import { app, BrowserWindow, ipcMain } from "electron";
import serve from "electron-serve";
import path, { join } from "path";
import { config as loadEnv } from "dotenv";
import { randomUUID } from "crypto";
import keytar from "keytar";

import { getURL } from "./lib/getUrl";
import isDev from "./lib/isDev";
import {
  buildGitHubAuthUrl,
  exchangeGitHubCodeForTokens,
  getOAuthCodeByInteraction,
  GitHubOAuthConfig,
  OAuthTokens,
} from "./lib/oauth";

const envFilePath = join(process.cwd(), ".env");
loadEnv({ path: envFilePath });

if (!isDev) {
  serve({ directory: join(__dirname, "renderer"), hostname: "example" });
}

const KEYTAR_SERVICE_NAME = "com.graphlens.auth";
const TOKEN_KEY = "github-oauth-token";
const IDENTIFIER_KEY = "github-auth-identifier";

const GITHUB_OAUTH_CONFIG: GitHubOAuthConfig = {
  clientId: process.env.GITHUB_CLIENT_ID ?? "",
  clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  redirectUri: process.env.GITHUB_REDIRECT_URI ?? "http://localhost/auth/callback",
  scopes: ["repo", "user", "user:email", "read:org"],
};

type AuthStorage = {
  tokens: OAuthTokens;
  uniqueId: string;
};

let mainWindow: BrowserWindow | null = null;

async function loadSavedAuth(): Promise<AuthStorage | null> {
  try {
    const serialized = await keytar.getPassword(KEYTAR_SERVICE_NAME, TOKEN_KEY);
    if (!serialized) {
      return null;
    }

    const tokens = JSON.parse(serialized) as OAuthTokens;
    let uniqueId = await keytar.getPassword(KEYTAR_SERVICE_NAME, IDENTIFIER_KEY);
    if (!uniqueId) {
      uniqueId = randomUUID();
      await keytar.setPassword(KEYTAR_SERVICE_NAME, IDENTIFIER_KEY, uniqueId);
    }

    return { tokens, uniqueId };
  } catch (error) {
    console.error("Unable to read saved OAuth tokens", error);
    return null;
  }
}

async function persistAuth(tokens: OAuthTokens): Promise<AuthStorage> {
  const uniqueId = randomUUID();
  await keytar.setPassword(KEYTAR_SERVICE_NAME, TOKEN_KEY, JSON.stringify(tokens));
  await keytar.setPassword(KEYTAR_SERVICE_NAME, IDENTIFIER_KEY, uniqueId);
  return { tokens, uniqueId };
}

async function startAuthFlow(parent: BrowserWindow): Promise<AuthStorage> {
  if (!GITHUB_OAUTH_CONFIG.clientId || !GITHUB_OAUTH_CONFIG.clientSecret) {
    throw new Error("GitHub OAuth client credentials are not configured.");
  }

  const state = randomUUID();
  const authUrl = buildGitHubAuthUrl(GITHUB_OAUTH_CONFIG, state);

  const authWindow = new BrowserWindow({
    width: 900,
    height: 800,
    parent,
    modal: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  authWindow.once("ready-to-show", () => authWindow.show());

  // Set up the code extraction listener BEFORE loading the URL
  // This ensures we catch the redirect callback
  const codePromise = getOAuthCodeByInteraction(authWindow, GITHUB_OAUTH_CONFIG.redirectUri, state);

  // Load the URL without waiting - navigation errors on callback URL are expected
  authWindow.loadURL(authUrl).catch((err) => {
    // Ignore ERR_CONNECTION_REFUSED errors - these happen when redirecting to localhost callback
    if (err.code !== "ERR_CONNECTION_REFUSED" && err.errno !== -102) {
      console.error("Auth window load error:", err);
    }
  });

  const code = await codePromise;
  const tokens = await exchangeGitHubCodeForTokens(GITHUB_OAUTH_CONFIG, code);
  const storedAuthentication = await persistAuth(tokens);

  if (!parent.isDestroyed()) {
    parent.webContents.send("auth-success", storedAuthentication);
  }

  return storedAuthentication;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hidden",
    icon: path.join(__dirname, "renderer", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  mainWindow.on("enter-full-screen", () => {
    mainWindow?.webContents.send("toggle-titlebar", false);
  });

  mainWindow.on("leave-full-screen", () => {
    mainWindow?.webContents.send("toggle-titlebar", true);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const savedAuth = await loadSavedAuth();
  const targetPath = savedAuth ? "/" : "/?login=1";
  await mainWindow.loadURL(getURL(targetPath));

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (savedAuth && mainWindow) {
    const hydratedWindow = mainWindow;
    hydratedWindow.webContents.once("did-finish-load", () => {
      if (!hydratedWindow.webContents.isDestroyed()) {
        hydratedWindow.webContents.send("auth-success", savedAuth);
      }
    });
  }
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.on("app/minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("app/maximize", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isMaximized()) {
      mainWindow.maximize();
    } else {
      mainWindow.unmaximize();
    }
  }
});

ipcMain.on("app/close", () => {
  app.quit();
});

ipcMain.handle("auth/start", async () => {
  if (!mainWindow) {
    throw new Error("Main window is not initialized yet.");
  }

  return startAuthFlow(mainWindow);
});

ipcMain.handle("auth/logout", async () => {
  await keytar.deletePassword(KEYTAR_SERVICE_NAME, TOKEN_KEY);
  await keytar.deletePassword(KEYTAR_SERVICE_NAME, IDENTIFIER_KEY);
  return true;
});

ipcMain.handle("auth/getUserInfo", async () => {
  const savedAuth = await loadSavedAuth();
  if (!savedAuth?.tokens.access_token) {
    return null;
  }

  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${savedAuth.tokens.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return {
    login: user.login,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
  };
});
