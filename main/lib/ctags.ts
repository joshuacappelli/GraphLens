// main/tools/ctags.ts
import { execFileSync } from "child_process";

export function findSystemCtags(): string | null {
  try {
    // On most systems, universal-ctags installs as `ctags`
    const cmd = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(cmd, ["ctags"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (!out) return null;

    // `where` can return multiple lines; choose first
    return out.split(/\r?\n/)[0];
  } catch {
    return null;
  }
}

export function getCtagsInstallHint() {
  if (process.platform === "darwin") {
    return {
      title: "Install universal-ctags (macOS)",
      command: "brew install universal-ctags",
    };
  }
  if (process.platform === "win32") {
    return {
      title: "Install universal-ctags (Windows)",
      command: "choco install universal-ctags  # or winget, if you prefer",
    };
  }
  return {
    title: "Install universal-ctags (Linux)",
    command:
      "sudo apt-get install universal-ctags  # Debian/Ubuntu\n" +
      "sudo dnf install ctags                # Fedora (often exuberant)\n" +
      "sudo pacman -S ctags                  # Arch (check package provides)",
  };
}
