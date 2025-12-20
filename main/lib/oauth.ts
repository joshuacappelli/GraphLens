import { BrowserWindow, Event } from "electron";

export interface OAuthTokens {
  access_token: string;
  scope: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
}

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

interface GitHubTokenResponse {
  access_token?: string;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export function buildGitHubAuthUrl(config: GitHubOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes?.join(" ") ?? "",
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCodeForTokens(
  config: GitHubOAuthConfig,
  code: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
  });

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body,
  });

  const payload = (await response.json()) as GitHubTokenResponse;

  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "Unable to exchange OAuth code for tokens.");
  }

  return {
    access_token: payload.access_token,
    scope: payload.scope ?? "",
    token_type: payload.token_type ?? "",
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
  };
}

function isCallbackUrl(candidateUrl: string, redirectUri: string): boolean {
  try {
    const parsed = new URL(candidateUrl);
    const parsedRedirect = new URL(redirectUri);
    // Match pathname (ignore origin since localhost vs 127.0.0.1 can differ)
    return parsed.pathname === parsedRedirect.pathname && parsed.searchParams.has("code");
  } catch {
    return false;
  }
}

export function getOAuthCodeByInteraction(
  authWindow: BrowserWindow,
  redirectUri: string,
  expectedState?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const tryExtractCode = (candidateUrl: string): boolean => {
      if (!candidateUrl || resolved) {
        return false;
      }

      let parsed: URL;
      try {
        parsed = new URL(candidateUrl);
      } catch {
        return false;
      }

      // Check if this looks like our callback URL (has /callback path and code param)
      const parsedRedirect = new URL(redirectUri);
      if (parsed.pathname !== parsedRedirect.pathname) {
        return false;
      }

      if (expectedState) {
        const returnedState = parsed.searchParams.get("state");
        if (returnedState !== expectedState) {
          return false;
        }
      }

      const code = parsed.searchParams.get("code") ?? parsed.searchParams.get("approvalCode");
      if (!code) {
        return false;
      }

      resolved = true;
      cleanup();
      if (!authWindow.isDestroyed()) {
        authWindow.close();
      }

      resolve(code);
      return true;
    };

    // Intercept navigation BEFORE it happens - this prevents the ERR_CONNECTION_REFUSED
    const willNavigateHandler = (event: Event, url: string) => {
      if (isCallbackUrl(url, redirectUri)) {
        event.preventDefault(); // Stop the navigation before it fails
        tryExtractCode(url);
      }
    };

    const navigationHandler = (_event: unknown, url: string) => {
      tryExtractCode(url);
    };

    const titleHandler = () => {
      if (authWindow.webContents.isDestroyed()) {
        return;
      }
      tryExtractCode(authWindow.webContents.getURL());
    };

    const redirectHandler = (event: Event, url: string) => {
      if (isCallbackUrl(url, redirectUri)) {
        event.preventDefault();
        tryExtractCode(url);
      }
    };

    const failLoadHandler = (
      _event: Event,
      errorCode: number,
      _errorDescription: string,
      validatedURL: string,
    ) => {
      // If we still get here with a callback URL, try to extract the code
      if (errorCode === -102) {
        tryExtractCode(validatedURL);
      }
    };

    const closedHandler = () => {
      cleanup();
      if (!resolved) {
        reject(new Error("Authentication window was closed before completing the flow."));
      }
    };

    const cleanup = () => {
      authWindow.webContents.removeListener("will-navigate", willNavigateHandler);
      authWindow.webContents.removeListener("did-navigate", navigationHandler);
      authWindow.webContents.removeListener("page-title-updated", titleHandler);
      authWindow.webContents.removeListener("will-redirect", redirectHandler);
      authWindow.webContents.removeListener("did-fail-load", failLoadHandler);
      authWindow.removeListener("closed", closedHandler);
    };

    // Register will-navigate first - this intercepts before navigation happens
    authWindow.webContents.on("will-navigate", willNavigateHandler);
    authWindow.webContents.on("did-navigate", navigationHandler);
    authWindow.webContents.on("page-title-updated", titleHandler);
    authWindow.webContents.on("will-redirect", redirectHandler);
    authWindow.webContents.on("did-fail-load", failLoadHandler);
    authWindow.once("closed", closedHandler);
  });
}

