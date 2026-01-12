import { useState, useEffect, useMemo } from "react";
import { X, Search, Lock, Globe, Plus, Loader2, GitFork, Archive, Check } from "lucide-react";

type GitHubRepo = {
  id: number; // GitHub's external repo ID
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  htmlUrl: string;
  cloneUrl: string;
  cloneUrlHttps: string;
  cloneUrlSsh: string;
  defaultBranch: string;
};

type AddRepoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (repo: GitHubRepo) => void;
  trackedExternalIds: number[]; // GitHub repo IDs of already tracked repos
};

const AddRepoModal = ({ isOpen, onClose, onAdd, trackedExternalIds }: AddRepoModalProps) => {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [addingRepos, setAddingRepos] = useState<Set<number>>(new Set()); // Repos currently being added
  const [justAddedRepos, setJustAddedRepos] = useState<Set<number>>(new Set()); // Repos just added (optimistic)

  useEffect(() => {
    if (isOpen) {
      fetchRepos();
      // Reset local state when modal opens
      setJustAddedRepos(new Set());
      setAddingRepos(new Set());
    }
  }, [isOpen]);

  const fetchRepos = async () => {
    if (!window.electron) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const fetchedRepos = await window.electron.fetchGitHubRepos();
      setRepos(fetchedRepos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repos");
    } finally {
      setLoading(false);
    }
  };

  const filteredRepos = useMemo(() => {
    // Filter out repos that were already tracked BEFORE opening the modal
    // But keep repos added during THIS session (they'll show "Added" badge)
    // trackedExternalIds may be strings (bigint from PostgreSQL), so convert for comparison
    const trackedSet = new Set(trackedExternalIds.map(id => Number(id)));
    let filtered = repos.filter((repo) => !trackedSet.has(repo.id));
    
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (repo) =>
          repo.fullName.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [repos, search, trackedExternalIds]);

  // Only shows "Added" for repos added in THIS session
  const isJustAdded = (repoId: number) => justAddedRepos.has(repoId);
  
  const isAdding = (repoId: number) => addingRepos.has(repoId);

  const handleAdd = async (repo: GitHubRepo) => {
    setAddingRepos((prev) => new Set(prev).add(repo.id));
    try {
      await onAdd(repo);
      // Optimistically mark as added
      setJustAddedRepos((prev) => new Set(prev).add(repo.id));
    } catch (err) {
      console.error("Failed to add repo:", err);
    } finally {
      setAddingRepos((prev) => {
        const next = new Set(prev);
        next.delete(repo.id);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-[#1e1e2e] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Add Repository</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-sm"
            />
          </div>
        </div>

        {/* Repo List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-400" size={32} />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchRepos}
                className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition text-sm"
              >
                Retry
              </button>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              {search 
                ? "No repositories match your search" 
                : repos.length > 0 
                  ? "All your repositories are already tracked" 
                  : "No repositories found"}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRepos.map((repo) => {
                const justAdded = isJustAdded(repo.id);
                return (
                  <div
                    key={repo.id}
                    className={`flex items-center justify-between p-4 rounded-xl border transition ${
                      justAdded
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2">
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
                        <span className="font-medium text-white truncate">
                          {repo.fullName}
                        </span>
                      </div>
                      {repo.description && (
                        <p className="text-sm text-slate-400 mt-1 truncate">
                          {repo.description}
                        </p>
                      )}
                    </div>
                    
                    {justAdded ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium px-3 py-1.5 rounded-lg bg-green-500/10">
                        <Check size={14} />
                        Added
                      </span>
                    ) : isAdding(repo.id) ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/50 text-white text-sm font-medium">
                        <Loader2 size={14} className="animate-spin" />
                        Adding...
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAdd(repo)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition"
                      >
                        <Plus size={14} />
                        Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {filteredRepos.length - justAddedRepos.size} available • {trackedExternalIds.length} tracked
            {justAddedRepos.size > 0 && (
              <span className="text-green-400 ml-2">
                (+{justAddedRepos.size} just added)
              </span>
            )}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddRepoModal;
