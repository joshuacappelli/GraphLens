// electron/lib/runCtags.ts
import { spawn } from "child_process";

export async function runCtagsJsonl(ctagsPath: string, repoPath: string): Promise<string> {
  const args = [
    "--output-format=json",
    "--fields=+nKSaf",
    "--extras=+q",
    "-R",
    repoPath,
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn(ctagsPath, args, {
      shell: false,
      windowsHide: true,
      cwd: repoPath,
    });

    let out = "";
    let err = "";

    const timeoutMs = 120_000;
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ctags timed out"));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.stderr.on("data", (d) => (err += d.toString("utf8")));

    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });

    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) return resolve(out);
      reject(new Error(`ctags failed (code ${code}): ${err}`));
    });
  });
}
