import { useState, useEffect } from "react";
import { Plus, RefreshCw, Lock, Globe, Trash2, Search, Archive, GitFork } from "lucide-react";
import AddRepoModal from "./AddRepoModal";

type RepoStatus = "not_indexed" | "indexing" | "ready" | "failed";

type TrackedRepo = {
  id: number;
  provider: string;
  externalRepoId: number;
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
};

type GitHubRepo = {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
};

const statusConfig: Record<RepoStatus, { label: string; color: string; bg: string }> = {
  not_indexed: { label: "Not indexed", color: "text-slate-400", bg: "bg-slate-500/20" },
  indexing: { label: "Indexing", color: "text-amber-400", bg: "bg-amber-500/20" },
  ready: { label: "Ready", color: "text-green-400", bg: "bg-green-500/20" },
  failed: { label: "Failed", color: "text-red-400", bg: "bg-red-500/20" },
};

const Home = () => {
  const [repos, setRepos] = useState<TrackedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [syncingRepos, setSyncingRepos] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRepos();
  }, []);

  const loadRepos = async () => {
    if (!window.electron) return;
    setError(null);
    try {
      const tracked = await window.electron.listTrackedRepos();
      setRepos(tracked);
    } catch (err) {
      console.error("Failed to load repos:", err);
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  };

  const handleAddRepo = async (repo: GitHubRepo) => {
    if (!window.electron) return;
    try {
      await window.electron.addTrackedRepo({
        externalRepoId: repo.id,
        fullName: repo.fullName,
        name: repo.name,
        owner: repo.owner,
        cloneUrl: repo.cloneUrl,
        defaultBranch: repo.defaultBranch,
        isPrivate: repo.isPrivate,
        isFork: repo.isFork,
        isArchived: repo.isArchived,
      });
      // Reload the list
      await loadRepos();
    } catch (err) {
      console.error("Failed to add repo:", err);
    }
  };

  const handleRemoveRepo = async (repoId: number) => {
    if (!window.electron) return;
    try {
      const updated = await window.electron.removeTrackedRepo(repoId);
      setRepos(updated);
    } catch (err) {
      console.error("Failed to remove repo:", err);
    }
  };

  const handleToggleEnabled = async (repoId: number, currentEnabled: boolean) => {
    if (!window.electron) return;
    try {
      const updated = await window.electron.setRepoEnabled(repoId, !currentEnabled);
      setRepos(updated);
    } catch (err) {
      console.error("Failed to toggle enabled:", err);
    }
  };

  const handleSync = async (repoId: number) => {
    if (!window.electron) return;
    
    setSyncingRepos((prev) => new Set(prev).add(repoId));
    
    try {
      await window.electron.syncRepoNow(repoId);
      // Reload to get updated status
      await loadRepos();
    } catch (err) {
      console.error("Failed to sync repo:", err);
    } finally {
      setSyncingRepos((prev) => {
        const next = new Set(prev);
        next.delete(repoId);
        return next;
      });
    }
  };

  // Get external IDs of tracked repos for the modal
  const trackedExternalIds = repos.map((r) => r.externalRepoId);

  return (
    <section className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#1e1e2e]/50">
        <div>
          <h1 className="text-xl font-semibold text-white">Repositories</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {repos.length} tracked {repos.length === 1 ? "repository" : "repositories"}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition"
        >
          <Plus size={16} />
          Add Repos
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          {error}
          <button onClick={loadRepos} className="ml-4 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Repo List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="animate-spin text-slate-400" size={32} />
          </div>
        ) : repos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <Search className="text-slate-500" size={28} />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No repositories tracked</h3>
            <p className="text-sm text-slate-400 mb-6 max-w-sm">
              Add repositories from your GitHub account to start indexing and searching code.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition"
            >
              <Plus size={16} />
              Add Your First Repo
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {repos.map((repo) => {
              const status = statusConfig[repo.status];
              const isSyncing = syncingRepos.has(repo.id) || repo.status === "indexing";
              
              return (
                <div
                  key={repo.id}
                  className={`p-4 rounded-xl border transition ${
                    repo.enabled 
                      ? "border-white/5 bg-[#1e1e2e]/80 hover:bg-[#1e1e2e]"
                      : "border-white/5 bg-[#1e1e2e]/40 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Repo Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {repo.isPrivate ? (
                          <Lock size={14} className="text-amber-400 shrink-0" />
                        ) : (
                          <Globe size={14} className="text-slate-400 shrink-0" />
                        )}
                        {repo.isFork && (
                          <GitFork size={14} className="text-slate-500 shrink-0" />
                        )}
                        {repo.isArchived && (
                          <Archive size={14} className="text-slate-500 shrink-0" />
                        )}
                        <a
                          href={`https://github.com/${repo.fullName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-white hover:text-blue-400 truncate transition"
                        >
                          {repo.fullName}
                        </a>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span>Branch: {repo.defaultBranch}</span>
                        {repo.lastSyncedAt && (
                          <span>Last synced: {new Date(repo.lastSyncedAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Include in search toggle */}
                      <button
                        onClick={() => handleToggleEnabled(repo.id, repo.enabled)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          repo.enabled
                            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            : "bg-white/5 text-slate-400 hover:bg-white/10"
                        }`}
                        title={repo.enabled ? "Included in search" : "Excluded from search"}
                      >
                        <Search size={12} />
                        {repo.enabled ? "Enabled" : "Disabled"}
                      </button>

                      {/* Sync button */}
                      <button
                        onClick={() => handleSync(repo.id)}
                        disabled={isSyncing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
                        {isSyncing ? "Syncing..." : "Sync now"}
                      </button>

                      {/* Remove button */}
                      <button
                        onClick={() => handleRemoveRepo(repo.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Remove repository"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Repo Modal */}
      <AddRepoModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={handleAddRepo}
        trackedExternalIds={trackedExternalIds}
      />
    </section>
  );
};

export default Home;
