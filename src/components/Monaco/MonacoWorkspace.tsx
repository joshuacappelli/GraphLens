import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useTabsStore, type Tab, type TabsState } from "../../context/tabsStore";
import { useWorkspaceStore } from "../../context/workspaceStore";
import { languageFromPath } from "./languageFromPath";
import { NO_FILE_PLACEHOLDER } from "./constants";
import type * as monaco from "monaco-editor";
import { MonacoLanguageClient } from "monaco-languageclient";
import { CloseAction, ErrorAction } from "vscode-languageclient/browser.js";
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from "vscode-ws-jsonrpc";

const MAX_SAVE_BYTES = 5 * 1024 * 1024;

/**
 * Editor for the active tab’s file: load, edit, stash on tab switch, save via ⌘S / Ctrl+S.
 * Dirty state is mirrored to the tab store for the header dot.
 */
export function MonacoWorkspace() {
  const workspaceRoot = useWorkspaceStore((s) => s.root);
  const setWorkspaceRoot = useWorkspaceStore((s) => s.setRoot);
  const activeTabId = useTabsStore((s: TabsState) => s.activeTabId);
  const tabs = useTabsStore((s: TabsState) => s.tabs);

  const activeTab = useMemo(
    () => tabs.find((t: Tab) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );
  const filePath = activeTab?.file ?? null;

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [lspPort, setLspPort] = useState<number | null>(null);
  const lspClientRef = useRef<MonacoLanguageClient | null>(null);
  const lspSocketRef = useRef<WebSocket | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);

  const contentRef = useRef(content);
  const savedContentRef = useRef(savedContent);
  contentRef.current = content;
  savedContentRef.current = savedContent;

  const isDirty = filePath != null && content !== savedContent;

  // Auto-detect workspace root from the opened file (so node_modules/tsconfig resolve correctly)
  useEffect(() => {
    if (workspaceRoot || !filePath) return;
    let cancelled = false;
    void window.electron?.findWorkspaceRootForPath?.(filePath).then((root) => {
      if (!cancelled && root) setWorkspaceRoot(root);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot, filePath, setWorkspaceRoot]);

  // Start/Restart TS LSP when workspace root changes
  useEffect(() => {
    if (!workspaceRoot || !window.electron?.startTypeScriptLsp) return;
    let cancelled = false;
    void window.electron
      .startTypeScriptLsp(workspaceRoot)
      .then((res) => {
        if (!cancelled) setLspPort(res.port);
      })
      .catch((e) => {
        console.error("[lsp] failed to start", e);
        if (!cancelled) setLspPort(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot]);

  useEffect(() => {
    if (!filePath) return;
    console.info("[monaco] active file", { filePath, workspaceRoot });
  }, [filePath, workspaceRoot]);

  // Disable Monaco's built-in TS/JS diagnostics once the real LSP is connected.
  // Otherwise you get duplicate / bogus "Cannot find module ..." errors from Monaco's standalone TS worker.
  useEffect(() => {
    const m = monacoRef.current;
    if (!m) return;
    if (!lspPort) return;
    // Monaco's type definitions sometimes mark languages.typescript as deprecated/unknown.
    // We intentionally treat it as runtime-available when Monaco's TS contrib is present.
    const ts: any = (m as any).languages?.typescript;
    if (!ts?.typescriptDefaults || !ts?.javascriptDefaults) return;

    try {
      ts.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
      ts.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
    } catch (e) {
      console.warn("[monaco] unable to disable built-in diagnostics", e);
    }
  }, [lspPort]);

  // Connect Monaco <-> LSP bridge when we have a port + monaco API.
  // Note: this provides completions/diagnostics/navigation via LSP; it is workspace-aware through the server's cwd.
  useEffect(() => {
    if (!lspPort) return;
    if (!monacoRef.current) return;
    if (typeof window === "undefined") return;

    // Close previous client/socket
    lspClientRef.current?.stop();
    lspClientRef.current = null;
    lspSocketRef.current?.close();
    lspSocketRef.current = null;

    const url = `ws://127.0.0.1:${lspPort}`;
    const ws = new WebSocket(url);
    lspSocketRef.current = ws;

    ws.onopen = () => {
      const socket = toSocket(ws);
      const reader = new WebSocketMessageReader(socket);
      const writer = new WebSocketMessageWriter(socket);

      // NOTE: This is the minimal wiring: MonacoLanguageClient + transports.
      // Full VS Code-like UX (workspace, filesystem, etc) can be layered later.
      reader.listen(() => {});

      const client = new MonacoLanguageClient({
        name: "TypeScript Language Server",
        clientOptions: {
          documentSelector: ["typescript", "typescriptreact", "javascript", "javascriptreact"],
          errorHandler: {
            error: () => ({ action: ErrorAction.Continue }),
            closed: () => ({ action: CloseAction.Restart }),
          },
        },
        messageTransports: { reader, writer },
      });

      lspClientRef.current = client;
      void client.start();
      reader.onClose(() => client.stop());
    };

    return () => {
      lspClientRef.current?.stop();
      lspClientRef.current = null;
      ws.close();
      lspSocketRef.current = null;
    };
  }, [lspPort, workspaceRoot]);

  // Stash unsaved work when leaving this tab or this tab’s open file
  useEffect(() => {
    const captureTabId = activeTabId;
    const captureFile = filePath;
    return () => {
      if (!captureTabId || !captureFile) return;
      const c = contentRef.current;
      const s = savedContentRef.current;
      if (c !== s) {
        useTabsStore.getState().patchTabEditor(captureTabId, {
          editorDraft: c,
          editorDirty: true,
          editorSavedContent: s,
        });
      }
    };
  }, [activeTabId, filePath]);

  // Load file or restore stashed draft for the active tab
  useEffect(() => {
    if (!activeTabId || !filePath) {
      setContent("");
      setSavedContent("");
      setLoadError(null);
      setSaveError(null);
      setLoading(false);
      return;
    }

    const tab = useTabsStore.getState().tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.file !== filePath) return;

    if (tab.editorDraft !== null) {
      const baseline = tab.editorSavedContent ?? "";
      const draft = tab.editorDraft;
      setContent(draft);
      setSavedContent(baseline);
      setLoadError(null);
      setSaveError(null);
      setLoading(false);
      const dirty = draft !== baseline;
      // Clear draft in store now that React state owns the buffer; stash-on-leave will re-persist if needed.
      useTabsStore.getState().patchTabEditor(activeTabId, {
        editorDraft: null,
        editorDirty: dirty,
        editorSavedContent: baseline,
      });
      return;
    }

    setContent("");
    setSavedContent("");
    setLoadError(null);
    setSaveError(null);
    setLoading(true);

    if (!window.electron?.readFileText) {
      setLoadError("File reading is only available in the Electron app.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void window.electron
      .readFileText(filePath)
      .then(
        (text) => {
          if (!cancelled) {
            setContent(text);
            setSavedContent(text);
            setLoadError(null);
            useTabsStore.getState().patchTabEditor(activeTabId, {
              editorSavedContent: text,
              editorDraft: null,
              editorDirty: false,
            });
          }
        },
        (e: unknown) => {
          if (!cancelled) {
            setLoadError(e instanceof Error ? e.message : "Failed to read file");
            setContent("");
            setSavedContent("");
            useTabsStore.getState().patchTabEditor(activeTabId, {
              editorSavedContent: null,
              editorDraft: null,
              editorDirty: false,
            });
          }
        }
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTabId, filePath, retryToken]);

  const performSave = useCallback(async () => {
    if (!activeTabId || !filePath || !window.electron?.writeFileText || loadError) return;
    setSaveError(null);
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_SAVE_BYTES) {
      setSaveError(`File is too large to save (${bytes} bytes; max ${MAX_SAVE_BYTES}).`);
      return;
    }
    setSaving(true);
    try {
      await window.electron.writeFileText(filePath, content);
      setSavedContent(content);
      useTabsStore.getState().patchTabEditor(activeTabId, {
        editorSavedContent: content,
        editorDraft: null,
        editorDirty: false,
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  }, [activeTabId, filePath, content, loadError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && filePath && !loading && !loadError && !saving) void performSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDirty, filePath, loading, loadError, saving, performSave]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!filePath || !activeTabId) return;
      const next = value ?? "";
      setContent(next);
      const dirty = next !== savedContent;
      useTabsStore.getState().patchTabEditor(activeTabId, { editorDirty: dirty });
    },
    [filePath, activeTabId, savedContent]
  );

  const language = filePath ? languageFromPath(filePath) : "plaintext";
  const editorKey = `${activeTabId ?? "x"}-${filePath ?? "none"}`;
  const canEdit = Boolean(filePath && !loadError);

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1e1e1e]">
      {filePath && (
        <div className="flex-shrink-0 border-b border-white/10 px-3 py-1.5 text-xs text-slate-400 truncate" title={filePath}>
          {filePath}
        </div>
      )}
      {loadError && (
        <div className="flex-shrink-0 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {loadError}
          <button
            type="button"
            onClick={() => setRetryToken((t) => t + 1)}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
      {saveError && (
        <div className="flex-shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {saveError}
        </div>
      )}
      {loading && filePath && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e1e1e]/80 text-sm text-slate-400">
          Loading…
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Editor
          key={editorKey}
          height="100%"
          language={language}
          path={filePath ?? "no-file"}
          value={filePath ? content : NO_FILE_PLACEHOLDER}
          onChange={handleChange}
          beforeMount={(m) => {
            monacoRef.current = m as unknown as typeof monaco;
          }}
          theme="vs-dark"
          options={{
            readOnly: !canEdit,
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>
    </section>
  );
}
