// electron/lib/platform.ts
export function platformKey() {
    const p = process.platform; // 'darwin' | 'win32' | 'linux'
    const a = process.arch;     // 'x64' | 'arm64'
    if (p === "darwin") return `darwin-${a}`;
    if (p === "linux") return `linux-${a}`;
    if (p === "win32") return `win32-${a}`;
    throw new Error(`Unsupported platform: ${p} ${a}`);
  }
  