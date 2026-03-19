import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Save } from "lucide-react";
import { useTabsStore, type Tab, type TabsState } from "../../context/tabsStore";
import { languageFromPath } from "./languageFromPath";
import { NO_FILE_PLACEHOLDER } from "./constants";

const MAX_SAVE_BYTES = 5 * 1024 * 1024;

/**
 * Full editor area: loads the active tab’s selected file, editing, save (toolbar + Cmd/Ctrl+S).
 */
export function MonacoWorkspace() {
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

  const isDirty = filePath != null && content !== savedContent;

  useEffect(() => {
    if (!filePath) {
      setContent("");
      setSavedContent("");
      setLoadError(null);
      setSaveError(null);
      setLoading(false);
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
          }
        },
        (e: unknown) => {
          if (!cancelled) {
            setLoadError(e instanceof Error ? e.message : "Failed to read file");
            setContent("");
            setSavedContent("");
          }
        }
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, retryToken]);

  const performSave = useCallback(async () => {
    if (!filePath || !window.electron?.writeFileText || loadError) return;
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
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  }, [filePath, content, loadError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && filePath && !loading && !loadError) void performSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDirty, filePath, loading, loadError, performSave]);

  const language = filePath ? languageFromPath(filePath) : "plaintext";
  const editorKey = filePath ?? "no-file";
  const canEdit = Boolean(filePath && !loadError);
  const saveDisabled = !filePath || !isDirty || !!loadError || loading || saving;

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1e1e1e]">
      {filePath && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
          <div className="min-w-0 flex-1 truncate text-xs text-slate-400" title={filePath}>
            {filePath}
            {isDirty ? (
              <span className="ml-2 text-amber-400/90">• unsaved</span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={saveDisabled}
            onClick={() => void performSave()}
            className="no-drag flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            title="Save (⌘S / Ctrl+S)"
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save"}
          </button>
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
          value={filePath ? content : NO_FILE_PLACEHOLDER}
          onChange={(v) => filePath && setContent(v ?? "")}
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
