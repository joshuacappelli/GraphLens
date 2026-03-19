import { MonacoVscodeApiWrapper } from "monaco-languageclient/vscodeApiWrapper";

let wrapper: MonacoVscodeApiWrapper | null = null;
let started = false;

export async function ensureVscodeServicesStarted(workspaceRoot: string | null) {
  if (started) return;
  started = true;

  wrapper = new MonacoVscodeApiWrapper({
    $type: "classic",
    viewsConfig: { $type: "EditorService" },
    // Keep it minimal for now. We mainly want VS Code-like service plumbing around Monaco.
    workspaceConfig: workspaceRoot
      ? {
          workspaceProvider: {
            trusted: true,
            workspace: {
              // The wrapper will create a default workspace if not provided, but passing a real folder helps.
              workspaceUri: (await import("vscode")).Uri.file(workspaceRoot),
            },
            async open() {
              // no-op
              return true;
            },
          },
        }
      : undefined,
  });

  await wrapper.start({ caller: "GraphLens" });
}

