import { useState, useRef, useEffect } from "react";
import {
  Home,
  Search,
  MessageSquare,
  FolderGit2,
  Settings,
  LogOut,
} from "lucide-react";
import { AppBarButton, MenuItem } from "./AppBarButton";

type GitHubUserInfo = {
  login: string;
  email: string | null;
  name: string | null;
  avatarUrl: string;
};

type AppBarProps = {
  isLoggedIn?: boolean;
  userInfo?: GitHubUserInfo | null;
  onLogout?: () => void;
  onAccount?: () => void;
  onSearch?: () => void;
  onAsk?: () => void;
  onRepositories?: () => void;
  onHome?: () => void;
};

const AppBar = ({
  isLoggedIn,
  userInfo,
  onLogout,
  onSearch,
  onAsk,
  onRepositories,
  onHome,
}: AppBarProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <nav className="h-11 px-2 flex items-center justify-between drag
      bg-[#f7f7f7] dark:bg-main-mantle
      border-b border-black/5 dark:border-white/10">

      {/* LEFT */}
      <div className="flex items-center gap-1 no-drag">
        
        <AppBarButton icon={<Home size={14} />} label="Home" onClick={onHome} />
        <AppBarButton icon={<Search size={14} />} label="Search" onClick={onSearch} />
        <AppBarButton icon={<MessageSquare size={14} />} label="Ask" onClick={onAsk} />
        <AppBarButton icon={<FolderGit2 size={14} />} label="Repositories" onClick={onRepositories} />
      </div>

      {/* RIGHT */}
      <div className="relative no-drag" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1.5 rounded-md
            text-slate-500 hover:text-slate-700
            dark:text-slate-400 dark:hover:text-white
            hover:bg-black/5 dark:hover:bg-white/10
            transition"
        >
          <Settings size={16} />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-64 rounded-lg
            bg-white dark:bg-[#1e1e1e]
            shadow-lg border border-black/10 dark:border-white/10
            overflow-hidden z-50">

            {/* User Info Header */}
            {userInfo && (
              <div className="px-3 py-3 border-b border-black/5 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <img
                    src={userInfo.avatarUrl}
                    alt={userInfo.login}
                    className="w-10 h-10 rounded-full ring-2 ring-black/5 dark:ring-white/10"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {userInfo.name || userInfo.login}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {userInfo.email || `@${userInfo.login}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Menu Items */}
            <div className="py-1">
              {isLoggedIn && onLogout && (
                <MenuItem
                  icon={<LogOut size={14} />}
                  label="Log out"
                  onClick={() => {
                    onLogout();
                  }}
                  danger
                />
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default AppBar;
