// electron/lib/ctags.ts
import path from "path";
import fs from "fs";
import { app } from "electron";
import { platformKey } from "./platform";

export function getBundledCtagsPath() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "ctags")
    : path.join(app.getAppPath(), "resources", "ctags");

  const exe = process.platform === "win32" ? "ctags.exe" : "ctags";
  return path.join(base, platformKey(), exe);
}

function fileExists(p: string) {
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
}

export async function ensureCtagsAvailable(): Promise<string> {
  // 1) Prefer bundled
  const bundled = getBundledCtagsPath();
  if (fileExists(bundled)) return bundled;

  // 2) Optional: fallback to system install (dev only)
  //    (Not recommended for consumer UX)
  const system = process.platform === "win32" ? "ctags.exe" : "ctags";
  return system;
}
