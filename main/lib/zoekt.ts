import { randomUUID } from "crypto";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";
import { app } from "electron";
import { homedir } from "os";

import { NEPTUNE_HOME, query, queryOne } from "./db";
import { enqueueJob, updateJobStatus } from "./jobs";
import { getHeadSha } from "./git";
import { ClonePreference } from "./repos";

const ZOEKTS_BASE = path.join(NEPTUNE_HOME, "zoekt");
const ZOEKTS_REPOS_DIR = path.join(ZOEKTS_BASE, "repos");
const ZOEKTS_INDEX_DIR = path.join(ZOEKTS_BASE, "indexes");
const ZOEKTS_ACTIVE_DIR = path.join(ZOEKTS_INDEX_DIR, "_active");

const ZOEKT_WEBSERVER_HOST = process.env.ZOEKT_WEBSERVER_HOST ?? "127.0.0.1";
const DEFAULT_WEBSERVER_PORT = parseInt(
  process.env.ZOEKT_WEBSERVER_PORT ?? "6070",
  10
);
const FALLBACK_WEBSERVER_PORTS = (process.env.ZOEKT_WEBSERVER_PORT_FALLBACK ?? "6071,6072,6073")
  .split(",")
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);

let zoektWebserverPort = DEFAULT_WEBSERVER_PORT;
let zoektWebserverProcess: ReturnType<typeof spawn> | null = null;

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
  cloneUrlHttps: string;
  cloneUrlSsh: string;
  clonePreference?: ClonePreference;
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
  cloneUrlUsed: string;
};

export function ensureZoektDirectories() {
  [ZOEKTS_BASE, ZOEKTS_REPOS_DIR, ZOEKTS_INDEX_DIR, ZOEKTS_ACTIVE_DIR].forEach(
    (dir) => {
      fs.mkdirSync(dir, { recursive: true });
    }
  );
}

function activeRepoKey(owner: string, name: string) {
  return `${owner}__${name}`;
}

function updateActiveSymlink(owner: string, name: string, snapshotDir: string) {
  fs.mkdirSync(ZOEKTS_ACTIVE_DIR, { recursive: true });
  const linkPath = path.join(ZOEKTS_ACTIVE_DIR, activeRepoKey(owner, name));
  try {
    fs.rmSync(linkPath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[Zoekt] failed to clear active link for ${owner}/${name}:`, err);
  }
  fs.symlinkSync(snapshotDir, linkPath, "dir");
}

function getPortCandidates(): number[] {
  return [
    DEFAULT_WEBSERVER_PORT,
    ...FALLBACK_WEBSERVER_PORTS,
  ].filter((value, index, array) => array.indexOf(value) === index);
}

async function checkPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    const cleanUp = () => {
      server.removeAllListeners("error");
      server.removeAllListeners("listening");
      server.close();
    };

    server.once("error", (err) => {
      cleanUp();
      reject(err);
    });
    server.once("listening", () => {
      cleanUp();
      resolve();
    });
    server.listen(port, ZOEKT_WEBSERVER_HOST);
  });
}

async function findAvailablePort(): Promise<number> {
  const candidates = getPortCandidates();
  for (const port of candidates) {
    try {
      await checkPort(port);
      return port;
    } catch {
      console.warn(`[Zoekt] Port ${port} unavailable, trying next`);
    }
  }
  throw new Error(
    `Unable to bind zoekt-webserver (ports tried: ${candidates.join(", ")})`
  );
}

const SSH_KEY_FILES = ["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa"];

function normalizeSshUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("ssh://")) {
    return url;
  }
  const match = url.match(/^([^@]+@[^:]+):(.+)$/);
  if (match) {
    return `ssh://${match[1]}/${match[2]}`;
  }
  return url;
}

function isSshConfigured(): boolean {
  if (process.env.SSH_AUTH_SOCK) {
    return true;
  }

  const sshDir = path.join(homedir(), ".ssh");
  return SSH_KEY_FILES.some((key) => fs.existsSync(path.join(sshDir, key)));
}

function resolveCloneUrl(options: ZoektIndexOptions): string {
  const normalizedSsh = options.cloneUrlSsh ? normalizeSshUrl(options.cloneUrlSsh) : "";
  const sshPreferred = options.clonePreference === "ssh";
  const canUseSsh = normalizedSsh && isSshConfigured();

  if (sshPreferred && canUseSsh) {
    return normalizedSsh;
  }

  if (options.cloneUrlHttps) {
    return options.cloneUrlHttps;
  }

  if (normalizedSsh) {
    return normalizedSsh;
  }

  throw new Error(`no clone URL available for ${options.owner}/${options.name}`);
}

async function startZoektWebserver() {
  if (zoektWebserverProcess) return;
  if (!fs.existsSync(ZOEKTS_ACTIVE_DIR)) {
    fs.mkdirSync(ZOEKTS_ACTIVE_DIR, { recursive: true });
  }

  const port = await findAvailablePort();
  const listenAddr = `${ZOEKT_WEBSERVER_HOST}:${port}`;
  const args = ["-index", ZOEKTS_ACTIVE_DIR, "-listen", listenAddr];
  console.info(`[Zoekt] Launching zoekt-webserver (${args.join(" ")})`);

  const proc = spawn(getZoektPath("zoekt-webserver"), args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout?.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      console.info(`[Zoekt-webserver:${port}] ${text}`);
    }
  });

  proc.stderr?.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      console.error(`[Zoekt-webserver:${port}] ${text}`);
    }
  });

  proc.on("exit", (code, signal) => {
    console.warn(
      `[Zoekt-webserver:${port}] exited with code=${code} signal=${signal}`
    );
    if (zoektWebserverProcess === proc) {
      zoektWebserverProcess = null;
    }
  });

  zoektWebserverProcess = proc;
  zoektWebserverPort = port;
}

function stopZoektWebserver() {
  if (!zoektWebserverProcess) {
    return;
  }

  try {
    zoektWebserverProcess.kill("SIGTERM");
  } catch (err) {
    console.warn("[Zoekt] Failed to stop zoekt-webserver:", err);
  }

  zoektWebserverProcess = null;
}

async function restartZoektWebserver() {
  stopZoektWebserver();
  await startZoektWebserver();
}

export function ensureZoektWebserver() {
  void startZoektWebserver();
}

export function getZoektWebserverUrl(): string {
  return `http://${ZOEKT_WEBSERVER_HOST}:${zoektWebserverPort}`;
}

export async function cleanupRepoSnapshots(repoId: number) {
  const rows = await query<{ index_path: string | null }>(`
    SELECT DISTINCT index_path FROM zoekt_index_snapshots WHERE repo_id = $1
  `, [repoId]);

  const paths = rows
    .map((row) => row.index_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  const removed = new Set<string>();
  for (const indexPath of paths) {
    if (removed.has(indexPath)) continue;
    removed.add(indexPath);
    try {
      fs.rmSync(indexPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[Zoekt] failed to remove snapshot at ${indexPath}:`, error);
    }
  }

  const repoMeta = await queryOne<{ owner: string; name: string }>(
    `SELECT owner, name FROM repos WHERE id = $1`,
    [repoId]
  );
  if (repoMeta) {
    const linkPath = path.join(
      ZOEKTS_ACTIVE_DIR,
      activeRepoKey(repoMeta.owner, repoMeta.name)
    );
    try {
      fs.rmSync(linkPath, { recursive: true, force: true });
    } catch (error) {
      // ignore if the link was already removed
    }
  }
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
  return app.isPackaged ? app.getAppPath() : process.cwd();
}

function findDevBinaryPath(bin: string): string | null {
  let current = devRoot();
  while (true) {
    const candidate = path.join(
      current,
      "vendor",
      "tooling",
      "tools",
      platformFolder(),
      exe(bin)
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

export function getZoektPath(
  bin: "zoekt-git-clone" | "zoekt-git-index" | "zoekt-webserver"
) {
  const packagedBase = path.join(
    process.resourcesPath,
    "tools",
    platformFolder()
  );
  const packagedPath = path.join(packagedBase, exe(bin));

  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  const devPath = findDevBinaryPath(bin);
  if (devPath) {
    return devPath;
  }

  console.warn(
    `[Zoekt] Unable to locate ${bin}; checked packaged path (${packagedPath}) and source path (${devPath}).`
  );
  throw new Error(`Missing Zoekt binary: ${packagedPath}`);
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

export async function readFileFromZoektRepo(
  owner: string,
  name: string,
  ref: string,
  filePath: string
): Promise<string | null> {
  const repoDir = getZoektRepoDir(owner, name);
  const result = await runCommand("git", [
    "--git-dir",
    repoDir,
    "show",
    `${ref}:${filePath}`,
  ]);

  if (!result.success) {
    console.warn(
      `[Zoekt] failed to read ${filePath} from ${owner}/${name}@${ref}: ${result.stderr}`
    );
    return null;
  }

  return result.stdout;
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

export async function activateSnapshot(
  owner: string,
  name: string,
  repoId: number,
  refId: number,
  snapshotId: number,
  snapshotDir: string
): Promise<void> {
  await setActiveIndex(repoId, refId, snapshotId);
  updateActiveSymlink(owner, name, snapshotDir);
  await restartZoektWebserver();
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
  const cloneUrl = resolveCloneUrl(options);
  console.info(
    `[Zoekt] Starting indexing for ${repoName} (${options.repoId}) default branch ${options.defaultBranch}`
  );
  console.info(`[Zoekt] Using clone URL ${cloneUrl}`);
  const branchList = getBranchList(options);
  const priority = options.priority ?? 100;

  const fetchJob = await enqueueJob("FETCH_REPO", options.repoId, null, { context: "zoekt-clone" }, priority);
  await updateJobStatus(fetchJob.id, "RUNNING", {
    message: "Cloning repository for Zoekt indexing",
  });

  const fetchResult = await cloneRepoForZoekt(repoName, cloneUrl, options.repoId);
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
  console.info(`[Zoekt] Repository mirror prepared at ${repoPath}`);

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
  console.info(`[Zoekt] Ref ${options.defaultBranch} tracked with SHA ${headSha}`);

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

  console.info(
    `[Zoekt] Index created at ${snapshotDir} (snapshot ${snapshot.id}); ${branchList.length} branch(es) indexed`
  );
  await markSnapshotReady(snapshot.id);
  await activateSnapshot(
    options.owner,
    options.name,
    options.repoId,
    refRow.id,
    snapshot.id,
    snapshotDir
  );

  return {
    snapshotId: snapshot.id,
    fetchResult,
    indexResult,
    cloneUrlUsed: cloneUrl,
  };
}
