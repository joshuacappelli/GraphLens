import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import AppBar from "./components/AppBar";
import Login from "./components/Login";
import Home from "./components/Home";
import Repositories from "./components/Repositories";
import SearchPage from "./components/SearchPage";
import DirectoryPanel from "./components/DirectoryPanel";
import { COMMANDS, matchesShortcut } from "./commands";

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

type GitHubUserInfo = {
  login: string;
  email: string | null;
  name: string | null;
  avatarUrl: string;
};

function App() {
  const [authState, setAuthState] = useState<AuthSuccessPayload | null>(null);
  const [userInfo, setUserInfo] = useState<GitHubUserInfo | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const loginMode = useMemo(() => new URL(window.location.href).searchParams.get("login") === "1", []);
  const [dirPanelOpen, setDirPanelOpen] = useState(false);
  const [shortcutPanelOpen, setShortcutPanelOpen] = useState(false);

  useEffect(() => {
    const cleanup = window.electron?.onAuthSuccess((result) => {
      setAuthState(result);
      setIsAuthenticating(false);
      setAuthError(null);
    });

    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    if (!window.electron) return;

    const checkStatus = async () => {
      const stored = await window.electron.getAuthStatus();
      if (isActive && stored) {
        setAuthState(stored);
        setIsAuthenticating(false);
        setAuthError(null);
      }
    };

    void checkStatus();
    return () => {
      isActive = false;
    };
  }, []);

  // Fetch user info when auth state changes
  useEffect(() => {
    if (authState && window.electron) {
      window.electron.getUserInfo().then(setUserInfo).catch(console.error);
    } else {
      setUserInfo(null);
    }
  }, [authState]);

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

  const handleLogout = async () => {
    if (!window.electron) return;
    
    try {
      await window.electron.logout();
      setAuthState(null);
      setUserInfo(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const [page, setPage] = useState<"home" | "repositories" | "search">("home");

  useEffect(() => {
    const directoryCommand = COMMANDS.find(
      (command) => command.id === "toggleDirectoryPanel"
    );
    const shortcutCommand = COMMANDS.find(
      (command) => command.id === "toggleShortcutPanel"
    );

    const handler = (event: KeyboardEvent) => {
      if (directoryCommand && matchesShortcut(event, directoryCommand.keys)) {
        event.preventDefault();
        toggleDirectoryPanel();
        return;
      }
      if (shortcutCommand && matchesShortcut(event, shortcutCommand.keys)) {
        event.preventDefault();
        setShortcutPanelOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleDirectoryPanel = () => {
    console.info("[UI] Directory panel toggle", { open: dirPanelOpen });
    setDirPanelOpen((open) => !open);
  };

  const renderContent = () => {
    if (!authState) {
      return (
        <Login
          onLogin={startAuth}
          isAuthenticating={isAuthenticating}
          error={authError}
          loginMode={loginMode}
        />
      );
    }

    if (page === "search") {
      return <SearchPage/>;
    }

    if (page === "repositories") {
      return <Repositories />;
    }

    return <Home />;
  };

  return (
    <main className="h-screen flex flex-col font-[roboto] font-bold bg-[#f7f7f7] dark:bg-main-light text-white">
      <Header onToggleDirectory={toggleDirectoryPanel} />
      {authState && (
        <AppBar
          isLoggedIn={!!authState}
          userInfo={userInfo}
          onLogout={handleLogout}
          onHome={() => setPage("home")}
          onSearch={() => setPage("search")}
          onRepositories={() => setPage("repositories")}
        />
      )}
        <div className="flex flex-1 overflow-hidden">
          <DirectoryPanel 
            isOpen={dirPanelOpen} 
            onClose={() => setDirPanelOpen(false)} 
          />
          <div className="flex-1 relative overflow-auto">
            {renderContent()}
            {shortcutPanelOpen && (
              <aside className="absolute inset-y-0 right-0 w-72 border-l border-white/10 bg-slate-900/95 p-6 text-sm text-slate-300 shadow-2xl shadow-black/60">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                  <span>Keyboard shortcuts</span>
                  <button
                    onClick={() => setShortcutPanelOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    ×
                  </button>
                </div>
                <ul className="mt-4 space-y-3">
                  {COMMANDS.map((command) => (
                    <li
                      key={command.id}
                      className="flex items-center justify-between text-[13px]"
                    >
                      <span>{command.description}</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em]">
                        {command.keys.join(" ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </div>
    </main>
  );
}

export default App;
