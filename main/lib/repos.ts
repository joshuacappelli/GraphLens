import { query, queryOne } from "./db";
import { join } from "path";
import { homedir } from "os";

const NEPTUNE_HOME = join(homedir(), ".neptune");

// Types matching the database schema
export type RepoStatus = "not_indexed" | "indexing" | "ready" | "failed";
export type ClonePreference = "https" | "ssh" | "auto";

export type TrackedRepo = {
  id: number;
  provider: string;
  externalRepoId: number;
  hostUrl: string;
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  cloneUrlHttps: string;
  cloneUrlSsh: string;
  clonePreference: ClonePreference;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  localMirrorPath: string;
  enabled: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  // Computed from jobs/indexes
  status: RepoStatus;
  lastSyncedAt: string | null;
  // From repo_refs for the default branch
  headSha: string | null;
};

type DbRepo = {
  id: number;
  provider: string;
  external_repo_id: number;
  host_url: string;
  owner: string;
  name: string;
  full_name: string;
  clone_url: string;
  clone_url_https: string;
  clone_url_ssh: string;
  clone_preference: ClonePreference;
  default_branch: string;
  is_private: boolean;
  is_fork: boolean;
  is_archived: boolean;
  local_mirror_path: string;
  enabled: boolean;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type DbRepoWithStatus = DbRepo & {
  status: RepoStatus;
  last_synced_at: string | null;
  head_sha: string | null;
};

function resolveCloneUrl(row: DbRepoWithStatus | DbRepo): string {
  if (row.clone_preference === "ssh" && row.clone_url_ssh) {
    return row.clone_url_ssh;
  }
  if (row.clone_url_https) {
    return row.clone_url_https;
  }
  return row.clone_url;
}

function mapDbRepoToTrackedRepo(row: DbRepoWithStatus): TrackedRepo {
  return {
    id: row.id,
    provider: row.provider,
    externalRepoId: row.external_repo_id,
    hostUrl: row.host_url,
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    cloneUrl: resolveCloneUrl(row),
    cloneUrlHttps: row.clone_url_https,
    cloneUrlSsh: row.clone_url_ssh,
    clonePreference: row.clone_preference,
    defaultBranch: row.default_branch,
    isPrivate: row.is_private,
    isFork: row.is_fork,
    isArchived: row.is_archived,
    localMirrorPath: row.local_mirror_path,
    enabled: row.enabled,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status || "not_indexed",
    lastSyncedAt: row.last_synced_at,
    headSha: row.head_sha,
  };
}

export async function listTrackedRepos(): Promise<TrackedRepo[]> {
  // Join with jobs, zoekt_active_index, and repo_refs to compute status and get head_sha
  // Note: "ready" checks if ANY ref is indexed. For v2, make this ref-aware (repo_id, ref_id)
  const rows = await query<DbRepoWithStatus>(`
    SELECT 
      r.*,
      COALESCE(
        CASE
          WHEN EXISTS (SELECT 1 FROM jobs j WHERE j.repo_id = r.id AND j.status IN ('QUEUED', 'RUNNING') AND j.job_type IN ('FETCH_REPO', 'BUILD_ZOEKT')) THEN 'indexing'
          WHEN EXISTS (SELECT 1 FROM zoekt_active_index zai WHERE zai.repo_id = r.id) THEN 'ready'
          WHEN EXISTS (SELECT 1 FROM jobs j WHERE j.repo_id = r.id AND j.status = 'FAILED') THEN 'failed'
          ELSE 'not_indexed'
        END
      , 'not_indexed') as status,
      (
        SELECT rf.last_fetched_at 
        FROM repo_refs rf 
        WHERE rf.repo_id = r.id AND rf.ref_name = r.default_branch AND rf.ref_type = 'branch'
        LIMIT 1
      ) as last_synced_at,
      (
        SELECT rf.head_sha 
        FROM repo_refs rf 
        WHERE rf.repo_id = r.id AND rf.ref_name = r.default_branch AND rf.ref_type = 'branch'
        LIMIT 1
      ) as head_sha
    FROM repos r
    ORDER BY r.pinned DESC, r.updated_at DESC
  `);

  return rows.map(mapDbRepoToTrackedRepo);
}

export async function getTrackedRepoById(repoId: number): Promise<TrackedRepo | null> {
  const row = await queryOne<DbRepoWithStatus>(`
    SELECT 
      r.*,
      COALESCE(
        CASE
          WHEN EXISTS (SELECT 1 FROM jobs j WHERE j.repo_id = r.id AND j.status IN ('QUEUED', 'RUNNING') AND j.job_type IN ('FETCH_REPO', 'BUILD_ZOEKT')) THEN 'indexing'
          WHEN EXISTS (SELECT 1 FROM zoekt_active_index zai WHERE zai.repo_id = r.id) THEN 'ready'
          WHEN EXISTS (SELECT 1 FROM jobs j WHERE j.repo_id = r.id AND j.status = 'FAILED') THEN 'failed'
          ELSE 'not_indexed'
        END
      , 'not_indexed') as status,
      (
        SELECT rf.last_fetched_at 
        FROM repo_refs rf 
        WHERE rf.repo_id = r.id AND rf.ref_name = r.default_branch AND rf.ref_type = 'branch'
        LIMIT 1
      ) as last_synced_at,
      (
        SELECT rf.head_sha 
        FROM repo_refs rf 
        WHERE rf.repo_id = r.id AND rf.ref_name = r.default_branch AND rf.ref_type = 'branch'
        LIMIT 1
      ) as head_sha
    FROM repos r
    WHERE r.id = $1
  `, [repoId]);

  return row ? mapDbRepoToTrackedRepo(row) : null;
}

export async function getTrackedRepoByExternalId(
  externalRepoId: number,
  hostUrl: string = "https://github.com"
): Promise<TrackedRepo | null> {
  const row = await queryOne<DbRepoWithStatus>(`
    SELECT 
      r.*,
      'not_indexed' as status,
      null as last_synced_at,
      null as head_sha
    FROM repos r
    WHERE r.external_repo_id = $1 AND r.host_url = $2
  `, [externalRepoId, hostUrl]);

  return row ? mapDbRepoToTrackedRepo(row) : null;
}

export type AddRepoInput = {
  externalRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  cloneUrlHttps: string;
  cloneUrlSsh: string;
  clonePreference?: ClonePreference;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  hostUrl?: string;
  provider?: string;
};

export async function addTrackedRepo(input: AddRepoInput): Promise<TrackedRepo> {
  const hostUrl = input.hostUrl || "https://github.com";
  const provider = input.provider || "github";
  
  // Generate local mirror path - include host to avoid collisions across GitHub/GHE
  const hostSlug = hostUrl.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]/g, "_");
  const localMirrorPath = join(NEPTUNE_HOME, "repos", hostSlug, input.owner, `${input.name}.git`);

  // Unique constraint is on (host_url, external_repo_id) - see migration 002
  const row = await queryOne<DbRepo>(`
    INSERT INTO repos (
      provider,
      external_repo_id,
      host_url,
      owner,
      name,
      full_name,
      clone_url,
      clone_url_https,
      clone_url_ssh,
      clone_preference,
      default_branch,
      is_private,
      is_fork,
      is_archived,
      local_mirror_path
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (host_url, external_repo_id) DO UPDATE SET
      clone_url = EXCLUDED.clone_url,
      clone_url_https = EXCLUDED.clone_url_https,
      clone_url_ssh = EXCLUDED.clone_url_ssh,
      clone_preference = EXCLUDED.clone_preference,
      default_branch = EXCLUDED.default_branch,
      is_private = EXCLUDED.is_private,
      is_fork = EXCLUDED.is_fork,
      is_archived = EXCLUDED.is_archived,
      full_name = EXCLUDED.full_name,
      updated_at = now()
    RETURNING *
  `, [
    provider,
    input.externalRepoId,
    hostUrl,
    input.owner,
    input.name,
    input.fullName,
    input.cloneUrlHttps || input.cloneUrlSsh,
    input.cloneUrlHttps,
    input.cloneUrlSsh,
    input.clonePreference || "https",
    input.defaultBranch,
    input.isPrivate,
    input.isFork,
    input.isArchived,
    localMirrorPath,
  ]);

  if (!row) {
    throw new Error("Failed to insert repo");
  }

  return mapDbRepoToTrackedRepo({ ...row, status: "not_indexed", last_synced_at: null, head_sha: null });
}

export async function removeTrackedRepo(repoId: number): Promise<void> {
  await query(`DELETE FROM repos WHERE id = $1`, [repoId]);
}

export async function setRepoEnabled(repoId: number, enabled: boolean): Promise<TrackedRepo | null> {
  await query(`
    UPDATE repos 
    SET enabled = $2, updated_at = now() 
    WHERE id = $1
  `, [repoId, enabled]);

  return getTrackedRepoById(repoId);
}

export async function setRepoPinned(repoId: number, pinned: boolean): Promise<TrackedRepo | null> {
  await query(`
    UPDATE repos 
    SET pinned = $2, updated_at = now() 
    WHERE id = $1
  `, [repoId, pinned]);

  return getTrackedRepoById(repoId);
}

/**
 * Upsert a repo ref (branch) with the current HEAD SHA
 */
export async function upsertRepoRef(
  repoId: number,
  refName: string,
  headSha: string,
  refType: string = "branch"
): Promise<void> {
  await query(`
    INSERT INTO repo_refs (repo_id, ref_name, ref_type, head_sha, last_fetched_at)
    VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (repo_id, ref_type, ref_name) DO UPDATE SET
      head_sha = EXCLUDED.head_sha,
      last_fetched_at = now(),
      updated_at = now()
  `, [repoId, refName, refType, headSha]);
}

// Import git functions for syncRepo
import { syncMirror } from "./git";

export type RepoSyncResult = {
  success: boolean;
  action: "cloned" | "fetched" | "up-to-date" | "error";
  headSha: string | null;
  message: string;
  repo: TrackedRepo | null;
};

/**
 * Sync a repository: clone or fetch the mirror, update repo_refs
 */
export async function syncRepo(repoId: number): Promise<RepoSyncResult> {
  // Get the repo details
  const repo = await getTrackedRepoById(repoId);
  if (!repo) {
    return {
      success: false,
      action: "error",
      headSha: null,
      message: "Repository not found",
      repo: null,
    };
  }

  // Run the git sync
  const result = await syncMirror(
    repo.cloneUrl,
    repo.owner,
    repo.name,
    repo.defaultBranch
  );

  if (!result.success) {
    return {
      success: false,
      action: "error",
      headSha: null,
      message: result.message,
      repo,
    };
  }

  // Update repo_refs with the new HEAD SHA
  if (result.headSha) {
    await upsertRepoRef(repoId, repo.defaultBranch, result.headSha);
  }

  // Get updated repo with new head_sha
  const updatedRepo = await getTrackedRepoById(repoId);

  return {
    success: true,
    action: result.action,
    headSha: result.headSha,
    message: result.message,
    repo: updatedRepo,
  };
}

