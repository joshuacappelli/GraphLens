import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";

type AuthTokens = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  [key: string]: unknown;
};

type AuthSuccessPayload = {
  tokens: AuthTokens;
  uniqueId: string;
};

function App() {
  const [authState, setAuthState] = useState<AuthSuccessPayload | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const loginMode = useMemo(() => new URL(window.location.href).searchParams.get("login") === "1", []);

  useEffect(() => {
    const cleanup = window.electron?.onAuthSuccess((result) => {
      setAuthState(result);
      setIsAuthenticating(false);
      setAuthError(null);
    });

    return () => cleanup?.();
  }, []);

  const startAuth = async () => {
    if (!window.electron) {
      setAuthError("Authentication requires the Electron shell.");
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      await window.electron.startAuth();
    } catch (error) {
      setIsAuthenticating(false);
      setAuthError(error instanceof Error ? error.message : "Unable to open GitHub login.");
    }
  };

  return (
    <main className="h-screen flex flex-col font-[roboto] font-bold bg-[#f7f7f7] dark:bg-main-light text-white">
      <Header />
      <section className="flex flex-row flex-1 w-full overflow-hidden justify-center items-center px-4">
        <div className="w-full max-w-2xl rounded-3xl border border-black/10 bg-white/80 px-10 py-10 shadow-xl shadow-black/5 text-slate-900 dark:border-white/10 dark:bg-main-dark dark:text-white">
          {authState ? (
            <div className="space-y-4">
              <p className="text-3xl font-bold text-emerald-500">GitHub Connected</p>
              <p className="text-base text-white/70 dark:text-slate-300">
                Unique identifier: <span className="font-mono text-sm text-white dark:text-white">{authState.uniqueId}</span>
              </p>
              <p className="text-sm text-slate-400">Scope: {authState.tokens.scope ?? "unknown"}</p>
              <p className="text-sm text-slate-500">Access token stored securely in the system keychain.</p>
              <button
                type="button"
                className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
                onClick={startAuth}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? "Refreshing token..." : "Reconnect GitHub"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-3xl font-bold text-slate-900 dark:text-white">GitHub Authentication</p>
              <p className="text-sm text-slate-500 dark:text-slate-300">
                {loginMode
                  ? "You must authenticate with GitHub to continue using this app."
                  : "Authenticate to unlock GitHub-backed workflows."}
              </p>
              <button
                type="button"
                className="rounded-full bg-[#24292f] px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-black/30"
                onClick={startAuth}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? "Opening GitHub..." : "Connect with GitHub"}
              </button>
              <p className="text-xs text-slate-400 dark:text-slate-500">Permissions requested: repo, user:email</p>
              {authError && <p className="text-sm text-red-500">{authError}</p>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
