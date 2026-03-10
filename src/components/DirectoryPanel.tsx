import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen, File, Home, HardDrive, Database } from "lucide-react";
import { useTabsStore, type Tab, type TabsState } from "../context/tabsStore";

type FsEntry = {
  name: string;
  path: string;
  kind: "file" | "dir" | "symlink" | "other";
  hidden: boolean;
};

type DirectoryPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

const DirectoryPanel = ({ isOpen, onClose }: DirectoryPanelProps) => {
  const [roots, setRoots] = useState<{ home: string; reposDir: string; volumes: string[] } | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirChildren, setDirChildren] = useState<Map<string, FsEntry[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  /** When tab is on a file, this is the parent dir's contents shown above the tree. */
  const [currentFolderEntries, setCurrentFolderEntries] = useState<FsEntry[] | null>(null);
  const [currentFolderLoading, setCurrentFolderLoading] = useState(false);

  const activeTabId = useTabsStore((s: TabsState) => s.activeTabId);
  const tabs = useTabsStore((s: TabsState) => s.tabs);
  const setTabDirectory = useTabsStore((s: TabsState) => s.setTabDirectory);
  const activeTab = useMemo(
    () => tabs.find((t: Tab) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );
  const activeDirectory = activeTab?.directory ?? "~";
  const resolvedDirectory = useMemo(
    () => (activeDirectory === "~" && roots ? roots.home : activeDirectory),
    [activeDirectory, roots]
  );

  // Clear current folder section when tab is no longer on a file (e.g. user clicked a folder)
  useEffect(() => {
    if (!isOpen || !activeTab?.file) {
      setCurrentFolderEntries(null);
    }
  }, [isOpen, activeTab?.file]);

  // When tab is on a file, load parent directory contents; only refetch when the folder path changes (not when switching files in the same folder)
  useEffect(() => {
    if (!isOpen || !activeTab?.file || !resolvedDirectory) return;
    let cancelled = false;
    setCurrentFolderLoading(true);
    window.electron
      ?.listDir(resolvedDirectory)
      .then((entries) => {
        if (!cancelled && entries) setCurrentFolderEntries(entries);
      })
      .catch(() => {
        if (!cancelled) setCurrentFolderEntries(null);
      })
      .finally(() => {
        if (!cancelled) setCurrentFolderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, resolvedDirectory]);

  // Fetch roots on mount
  useEffect(() => {
    if (!isOpen) return;
    
    let active = true;
    const fetchRoots = async () => {
      const result = await window.electron?.getRoots();
      if (active && result) {
        setRoots(result);
      }
    };
    void fetchRoots();
    
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Subscribe to directory changes
  useEffect(() => {
    if (!isOpen) return;

    const off = window.electron?.onDirChanged(async (dirPath: string) => {
      if (!expandedDirs.has(dirPath)) return;
      
      try {
        const entries = await window.electron.listDir(dirPath);
        setDirChildren((prev) => new Map(prev).set(dirPath, entries));
      } catch (error) {
        console.error(`Failed to refresh directory ${dirPath}:`, error);
      }
    });

    return () => {
      off?.();
    };
  }, [isOpen, expandedDirs]);

  // Cleanup watchers when panel closes
  useEffect(() => {
    if (isOpen) return;
    
    // Unwatch all expanded directories when panel closes
    expandedDirs.forEach((dirPath) => {
      window.electron?.unwatchDir(dirPath);
    });
  }, [isOpen, expandedDirs]);

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoadingDirs((prev) => new Set(prev).add(dirPath));
    
    try {
      const entries = await window.electron?.listDir(dirPath);
      if (entries) {
        setDirChildren((prev) => new Map(prev).set(dirPath, entries));
      }
      // Start watching this directory
      await window.electron?.watchDir(dirPath);
    } catch (error) {
      console.error(`Failed to load directory ${dirPath}:`, error);
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  }, []);

  const toggleDirectory = useCallback(async (dirPath: string) => {
    const isExpanded = expandedDirs.has(dirPath);
    
    if (isExpanded) {
      // Collapse: remove from expanded and unwatch
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
      await window.electron?.unwatchDir(dirPath);
    } else {
      // Expand: add to expanded and load contents
      setExpandedDirs((prev) => new Set(prev).add(dirPath));
      if (!dirChildren.has(dirPath)) {
        await loadDirectory(dirPath);
      }
    }
  }, [expandedDirs, dirChildren, loadDirectory]);

  const handleSetTabDirectory = useCallback(
    (dirPath: string, filePath?: string | null) => {
      if (activeTabId) setTabDirectory(activeTabId, dirPath, filePath);
    },
    [activeTabId, setTabDirectory]
  );

  const getParentDir = (filePath: string): string => {
    const isAbsolute = filePath.startsWith("/");
    const parts = filePath.split("/").filter(Boolean);
    if (parts.length <= 1) return isAbsolute ? "/" : "/";
    const joined = parts.slice(0, -1).join("/");
    return isAbsolute ? `/${joined}` : joined;
  };

  const renderEntry = (entry: FsEntry, depth: number = 0) => {
    const isDir = entry.kind === "dir";
    const isExpanded = expandedDirs.has(entry.path);
    const isLoading = loadingDirs.has(entry.path);
    const children = dirChildren.get(entry.path);

    const handleClick = () => {
      if (activeTabId) {
        if (isDir) {
          handleSetTabDirectory(entry.path, null);
        } else {
          handleSetTabDirectory(getParentDir(entry.path), entry.path);
        }
      }
      if (isDir) toggleDirectory(entry.path);
    };

    return (
      <div key={entry.path}>
        <button
          onClick={handleClick}
          className={`w-full flex items-center gap-2 py-1 px-2 text-left text-[13px] hover:bg-white/5 rounded transition-colors ${
            isDir ? "cursor-pointer" : "cursor-pointer text-slate-500"
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {isDir && (
            <ChevronRight
              size={14}
              className={`flex-shrink-0 text-slate-500 transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          )}
          {!isDir && <span className="w-[14px]" />}
          {isDir ? (
            isExpanded ? (
              <FolderOpen size={16} className="flex-shrink-0 text-yellow-500" />
            ) : (
              <Folder size={16} className="flex-shrink-0 text-yellow-500" />
            )
          ) : (
            <File size={16} className="flex-shrink-0 text-slate-400" />
          )}
          <span className="truncate">{entry.name}</span>
          {isLoading && (
            <span className="ml-auto text-[10px] text-slate-500">...</span>
          )}
        </button>
        
        {isDir && isExpanded && children && (
          <div>
            {children.map((child) => renderEntry(child, depth + 1))}
            {children.length === 0 && (
              <div
                className="text-[11px] text-slate-600 italic py-1"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              >
                Empty folder
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderRootButton = (
    label: string,
    dirPath: string,
    icon: React.ReactNode
  ) => {
    const isExpanded = expandedDirs.has(dirPath);
    const isLoading = loadingDirs.has(dirPath);
    const children = dirChildren.get(dirPath);

    const handleRootClick = () => {
      if (activeTabId) handleSetTabDirectory(dirPath, null);
      toggleDirectory(dirPath);
    };

    return (
      <div key={dirPath}>
        <button
          onClick={handleRootClick}
          className="w-full flex items-center gap-2 py-2 px-2 text-left text-[13px] hover:bg-white/5 rounded transition-colors font-medium"
        >
          <ChevronRight
            size={14}
            className={`flex-shrink-0 text-slate-500 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
          {icon}
          <span className="truncate">{label}</span>
          {isLoading && (
            <span className="ml-auto text-[10px] text-slate-500">...</span>
          )}
        </button>
        
        {isExpanded && children && (
          <div>
            {children.map((child) => renderEntry(child, 1))}
            {children.length === 0 && (
              <div className="text-[11px] text-slate-600 italic py-1 pl-10">
                Empty folder
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <aside className="flex-shrink-0 w-72 border-r border-white/10 bg-slate-900/95 text-sm text-slate-300 shadow-[inset_0_0_80px_rgba(0,0,0,0.25)] flex flex-col">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400 p-4 pb-2">
        <span>File Explorer</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>
      {activeTab != null && !activeTab.file && (
        <div className="px-4 pb-2 text-[11px] text-slate-500 truncate" title={resolvedDirectory}>
          Tab: {resolvedDirectory === (roots?.home ?? "") ? "~" : resolvedDirectory}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {activeTab?.file && (
          <div className="mb-3 pb-3 border-b border-white/10">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 px-2 py-1.5 truncate" title={resolvedDirectory}>
              {resolvedDirectory === (roots?.home ?? "") ? "~" : resolvedDirectory}
            </div>
            {currentFolderLoading ? (
              <div className="text-[12px] text-slate-500 px-2 py-1">Loading...</div>
            ) : currentFolderEntries ? (
              <div className="space-y-0.5">
                {currentFolderEntries.map((entry) => {
                  const isDir = entry.kind === "dir";
                  const isSelectedFile = !isDir && entry.path === activeTab.file;
                  return (
                    <button
                      key={entry.path}
                      onClick={() => {
                        if (!activeTabId) return;
                        if (isDir) {
                          handleSetTabDirectory(entry.path, null);
                        } else {
                          handleSetTabDirectory(getParentDir(entry.path), entry.path);
                        }
                      }}
                      className={`w-full flex items-center gap-2 py-1 px-2 text-left text-[13px] rounded transition-colors ${
                        isSelectedFile ? "bg-white/10 text-slate-200" : "hover:bg-white/5 text-slate-400"}
                      `}
                    >
                      {isDir ? (
                        <Folder size={16} className="flex-shrink-0 text-yellow-500" />
                      ) : (
                        <File size={16} className="flex-shrink-0 text-slate-400" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-slate-500 px-2 py-1">No entries</div>
            )}
          </div>
        )}
        {!roots ? (
          <div className="text-[13px] text-slate-500 p-2">Loading...</div>
        ) : (
          <div className="space-y-1">
            {renderRootButton(
              "Home",
              roots.home,
              <Home size={16} className="flex-shrink-0 text-blue-400" />
            )}
            
            {renderRootButton(
              "Repositories",
              roots.reposDir,
              <Database size={16} className="flex-shrink-0 text-green-400" />
            )}
            
            {roots.volumes.length > 0 && (
              <div className="pt-2 mt-2 border-t border-white/5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 px-2 py-1">
                  Volumes
                </div>
                {roots.volumes.map((volume) => (
                  renderRootButton(
                    volume.split("/").pop() || volume,
                    volume,
                    <HardDrive size={16} className="flex-shrink-0 text-slate-400" />
                  )
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default DirectoryPanel;
