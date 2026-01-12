import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import AppBar from "./components/AppBar";
import Login from "./components/Login";
import Home from "./components/Home";
import SearchPage from "./components/SearchPage";

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

  const [page, setPage] = useState<"home" | "search">("home");

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
      return <SearchPage onClose={() => setPage("home")} />;
    }

    return <Home onSearchClick={() => setPage("search")} />;
  };

  return (
    <main className="h-screen flex flex-col font-[roboto] font-bold bg-[#f7f7f7] dark:bg-main-light text-white">
      <Header />
      {authState && <AppBar isLoggedIn={!!authState} userInfo={userInfo} onLogout={handleLogout} />}
      {renderContent()}
    </main>
  );
}

export default App;
