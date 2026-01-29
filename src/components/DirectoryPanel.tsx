import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Folder, FolderOpen, File, Home, HardDrive, Database } from "lucide-react";

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

type TreeNode = {
  entry: FsEntry;
  children: FsEntry[] | null;
  loading: boolean;
};

const DirectoryPanel = ({ isOpen, onClose }: DirectoryPanelProps) => {
  const [roots, setRoots] = useState<{ home: string; reposDir: string; volumes: string[] } | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirChildren, setDirChildren] = useState<Map<string, FsEntry[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());

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

  const renderEntry = (entry: FsEntry, depth: number = 0) => {
    const isDir = entry.kind === "dir";
    const isExpanded = expandedDirs.has(entry.path);
    const isLoading = loadingDirs.has(entry.path);
    const children = dirChildren.get(entry.path);

    return (
      <div key={entry.path}>
        <button
          onClick={() => isDir && toggleDirectory(entry.path)}
          className={`w-full flex items-center gap-2 py-1 px-2 text-left text-[13px] hover:bg-white/5 rounded transition-colors ${
            isDir ? "cursor-pointer" : "cursor-default text-slate-500"
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          disabled={!isDir}
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

    return (
      <div key={dirPath}>
        <button
          onClick={() => toggleDirectory(dirPath)}
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
      
      <div className="flex-1 overflow-y-auto px-2 pb-4">
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
