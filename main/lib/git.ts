import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const NEPTUNE_REPOS = join(homedir(), ".neptune", "repos");

export type GitResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
};

/**
 * Run a git command and return the result
 */
async function runGit(args: string[], cwd?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      cwd,
      env: {
        ...process.env,
        // Disable interactive prompts
        GIT_TERMINAL_PROMPT: "0",
        // Use SSH for auth if available
        GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code,
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        stdout: "",
        stderr: err.message,
        code: null,
      });
    });
  });
}

/**
 * Get the mirror path for a repo
 */
export function getMirrorPath(owner: string, name: string): string {
  return join(NEPTUNE_REPOS, owner, `${name}.git`);
}

/**
 * Check if a mirror exists
 */
export function mirrorExists(mirrorPath: string): boolean {
  return existsSync(join(mirrorPath, "HEAD"));
}

/**
 * Clone a repository as a bare mirror
 */
export async function cloneMirror(
  cloneUrl: string,
  mirrorPath: string
): Promise<GitResult> {
  console.log(`Cloning mirror: ${cloneUrl} -> ${mirrorPath}`);
  return runGit(["clone", "--mirror", cloneUrl, mirrorPath]);
}

/**
 * Fetch updates for an existing mirror
 */
export async function fetchMirror(mirrorPath: string): Promise<GitResult> {
  console.log(`Fetching mirror: ${mirrorPath}`);
  return runGit(["fetch", "--prune"], mirrorPath);
}

/**
 * Get the HEAD SHA for a branch
 */
export async function getHeadSha(
  mirrorPath: string,
  branch: string
): Promise<string | null> {
  // Try refs/heads/<branch> first (for mirrors)
  let result = await runGit(
    ["rev-parse", `refs/heads/${branch}`],
    mirrorPath
  );

  if (result.success && result.stdout) {
    return result.stdout;
  }

  // Fallback to refs/remotes/origin/<branch>
  result = await runGit(
    ["rev-parse", `refs/remotes/origin/${branch}`],
    mirrorPath
  );

  if (result.success && result.stdout) {
    return result.stdout;
  }

  return null;
}

/**
 * Get list of all refs in the mirror
 */
export async function listRefs(
  mirrorPath: string
): Promise<{ ref: string; sha: string }[]> {
  const result = await runGit(["show-ref"], mirrorPath);

  if (!result.success) {
    return [];
  }

  return result.stdout.split("\n").filter(Boolean).map((line) => {
    const [sha, ref] = line.split(" ");
    return { sha, ref };
  });
}

export type SyncResult = {
  success: boolean;
  action: "cloned" | "fetched" | "up-to-date" | "error";
  headSha: string | null;
  message: string;
};

/**
 * Sync a repository mirror - clone if new, fetch if exists
 */
export async function syncMirror(
  cloneUrl: string,
  owner: string,
  name: string,
  defaultBranch: string
): Promise<SyncResult> {
  const mirrorPath = getMirrorPath(owner, name);
  const exists = mirrorExists(mirrorPath);

  let result: GitResult;
  let action: SyncResult["action"];

  if (!exists) {
    result = await cloneMirror(cloneUrl, mirrorPath);
    action = result.success ? "cloned" : "error";
  } else {
    result = await fetchMirror(mirrorPath);
    if (!result.success) {
      action = "error";
    } else if (result.stderr.includes("From ") || result.stdout.includes("From ")) {
      // Git outputs fetch info to stderr
      action = "fetched";
    } else {
      action = "up-to-date";
    }
  }

  if (!result.success) {
    return {
      success: false,
      action: "error",
      headSha: null,
      message: result.stderr || "Git operation failed",
    };
  }

  // Get the HEAD SHA for the default branch
  const headSha = await getHeadSha(mirrorPath, defaultBranch);

  return {
    success: true,
    action,
    headSha,
    message:
      action === "cloned"
        ? "Repository cloned successfully"
        : action === "fetched"
        ? "Repository updated"
        : "Already up to date",
  };
}

