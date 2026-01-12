import { randomUUID } from "crypto";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";

import { NEPTUNE_HOME, query, queryOne } from "./db";
import { enqueueJob, updateJobStatus } from "./jobs";
import { getHeadSha } from "./git";

const ZOEKTS_BASE = path.join(NEPTUNE_HOME, "zoekt");
const ZOEKTS_REPOS_DIR = path.join(ZOEKTS_BASE, "repos");
const ZOEKTS_INDEX_DIR = path.join(ZOEKTS_BASE, "indexes");

type CommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

type RepoRefRow = {
  id: number;
  head_sha: string | null;
};

type SnapshotRow = {
  id: number;
};

export type ZoektIndexOptions = {
  repoId: number;
  owner: string;
  name: string;
  cloneUrl: string;
  defaultBranch: string;
  branches?: string[];
  incremental?: boolean;
  submodules?: boolean;
  priority?: number;
};

export type ZoektIndexResult = {
  snapshotId: number | null;
  fetchResult: CommandResult;
  indexResult?: CommandResult;
};

export function ensureZoektDirectories() {
  [ZOEKTS_BASE, ZOEKTS_REPOS_DIR, ZOEKTS_INDEX_DIR].forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

function platformFolder() {
  const arch = process.arch;
  if (process.platform === "darwin") return `mac-${arch}`;
  if (process.platform === "win32") return `win-${arch}`;
  return `linux-${arch}`;
}

function exe(name: string) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function devRoot() {
  return app.getAppPath();
}

export function getZoektPath(
  bin: "zoekt-git-clone" | "zoekt-git-index" | "zoekt-webserver"
) {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "tools", platformFolder())
    : path.join(devRoot(), "vendor", "tooling", "tools", platformFolder());

  const full = path.join(base, exe(bin));
  if (!fs.existsSync(full)) {
    throw new Error(`Missing Zoekt binary: ${full}`);
  }
  return full;
}

function getBranchList(options: ZoektIndexOptions): string[] {
  const branches = new Set<string>();
  branches.add("HEAD");
  if (options.defaultBranch) {
    branches.add(options.defaultBranch);
  }
  if (options.branches) {
    options.branches.forEach((branch) => {
      if (branch) {
        branches.add(branch);
      }
    });
  }
  return Array.from(branches);
}

function getZoektRepoDir(owner: string, name: string): string {
  return path.join(ZOEKTS_REPOS_DIR, owner, `${name}.git`);
}

function getZoektIndexSnapshotDir(owner: string, name: string): string {
  return path.join(ZOEKTS_INDEX_DIR, owner, name);
}

function runCommand(
  command: string,
  args: string[],
  cwd?: string
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        exitCode: null,
        stdout: "",
        stderr: err.message,
      });
    });
  });
}

async function cloneRepoForZoekt(
  repoName: string,
  cloneUrl: string,
  repoId: number
): Promise<CommandResult> {
  const cloneBinary = getZoektPath("zoekt-git-clone");
  const args = [
    "-dest",
    ZOEKTS_REPOS_DIR,
    "-name",
    repoName,
    "-repoid",
    String(repoId),
    cloneUrl,
  ];
  return runCommand(cloneBinary, args);
}

async function indexRepoWithZoektBinary(
  repoPath: string,
  indexDir: string,
  branches: string[],
  options: Pick<ZoektIndexOptions, "incremental" | "submodules">
): Promise<CommandResult> {
  const indexBinary = getZoektPath("zoekt-git-index");
  const args = ["-branches", branches.join(","), "-index", indexDir];

  if (options.incremental === false) {
    args.push("-incremental=false");
  }
  if (options.submodules === false) {
    args.push("-submodules=false");
  }

  args.push(repoPath);
  return runCommand(indexBinary, args);
}

async function upsertRepoRef(
  repoId: number,
  refName: string,
  headSha: string
): Promise<RepoRefRow | null> {
  const row = await queryOne<RepoRefRow>(`
    INSERT INTO repo_refs (repo_id, ref_name, ref_type, head_sha, last_fetched_at)
    VALUES ($1, $2, 'branch', $3, now())
    ON CONFLICT (repo_id, ref_type, ref_name) DO UPDATE SET
      head_sha = COALESCE(EXCLUDED.head_sha, repo_refs.head_sha),
      last_fetched_at = now(),
      updated_at = now()
    RETURNING id, head_sha
  `, [repoId, refName, headSha]);

  return row;
}

async function insertSnapshot(
  repoId: number,
  refId: number,
  commitSha: string,
  indexPath: string
): Promise<SnapshotRow> {
  const row = await queryOne<SnapshotRow>(`
    INSERT INTO zoekt_index_snapshots (repo_id, ref_id, commit_sha, index_path, status)
    VALUES ($1, $2, $3, $4, 'building')
    RETURNING id
  `, [repoId, refId, commitSha, indexPath]);

  if (!row) {
    throw new Error("Failed to create zoekt index snapshot");
  }
  return row;
}

async function markSnapshotReady(snapshotId: number): Promise<void> {
  await query(`
    UPDATE zoekt_index_snapshots
    SET status = 'ready', finished_at = now(), error = NULL
    WHERE id = $1
  `, [snapshotId]);
}

async function markSnapshotFailed(snapshotId: number, error: string): Promise<void> {
  await query(`
    UPDATE zoekt_index_snapshots
    SET status = 'failed', finished_at = now(), error = $2
    WHERE id = $1
  `, [snapshotId, error]);
}

async function setActiveIndex(repoId: number, refId: number, snapshotId: number): Promise<void> {
  await query(`
    INSERT INTO zoekt_active_index (repo_id, ref_id, snapshot_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (repo_id, ref_id) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id
  `, [repoId, refId, snapshotId]);
}

async function getIndexSnapshotDir(owner: string, name: string): Promise<string> {
  const base = getZoektIndexSnapshotDir(owner, name);
  const dir = path.join(base, `${Date.now()}-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function indexRepositoryWithZoekt(
  options: ZoektIndexOptions
): Promise<ZoektIndexResult> {
  ensureZoektDirectories();

  const repoName = `${options.owner}/${options.name}`;
  const repoPath = getZoektRepoDir(options.owner, options.name);
  const branchList = getBranchList(options);
  const priority = options.priority ?? 100;

  const fetchJob = await enqueueJob("FETCH_REPO", options.repoId, null, { context: "zoekt-clone" }, priority);
  await updateJobStatus(fetchJob.id, "RUNNING", {
    message: "Cloning repository for Zoekt indexing",
  });

  const fetchResult = await cloneRepoForZoekt(repoName, options.cloneUrl, options.repoId);
  if (!fetchResult.success) {
    await updateJobStatus(fetchJob.id, "FAILED", {
      error: fetchResult.stderr || "zoekt-git-clone failed",
    });
    throw new Error(
      `zoekt-git-clone failed for ${repoName}: ${fetchResult.stderr || fetchResult.stdout}`
    );
  }

  await updateJobStatus(fetchJob.id, "DONE", {
    message: "Repository ready for Zoekt indexing",
  });

  const headSha = await getHeadSha(repoPath, options.defaultBranch);
  if (!headSha) {
    throw new Error(
      `Unable to resolve head SHA for branch ${options.defaultBranch} (repo ${repoName})`
    );
  }

  const refRow = await upsertRepoRef(options.repoId, options.defaultBranch, headSha);
  if (!refRow) {
    throw new Error(`Failed to create repo_ref for ${repoName}`);
  }

  const snapshotDir = await getIndexSnapshotDir(options.owner, options.name);
  const snapshot = await insertSnapshot(
    options.repoId,
    refRow.id,
    headSha,
    snapshotDir
  );

  const buildJob = await enqueueJob(
    "BUILD_ZOEKT",
    options.repoId,
    refRow.id,
    { branches: branchList },
    priority
  );
  await updateJobStatus(buildJob.id, "RUNNING", {
    message: "Running zoekt-git-index",
  });

  const indexResult = await indexRepoWithZoektBinary(repoPath, snapshotDir, branchList, {
    incremental: options.incremental,
    submodules: options.submodules,
  });

  if (!indexResult.success) {
    await updateJobStatus(buildJob.id, "FAILED", {
      error: indexResult.stderr || "zoekt-git-index failed",
    });
    await markSnapshotFailed(snapshot.id, indexResult.stderr || "indexing failed");
    throw new Error(
      `zoekt-git-index failed for ${repoName}: ${indexResult.stderr || indexResult.stdout}`
    );
  }

  await updateJobStatus(buildJob.id, "DONE", {
    message: "Zoekt index ready",
  });

  await markSnapshotReady(snapshot.id);
  await setActiveIndex(options.repoId, refRow.id, snapshot.id);

  return {
    snapshotId: snapshot.id,
    fetchResult,
    indexResult,
  };
}
