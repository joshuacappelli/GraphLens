import { useEffect, useState } from "react";
import { getLanguageName } from "../lib/languages";

type ZoektSearchMatch = {
  Repository?: string;
  Repo?: string;
  FileName?: string;
  Line?: number;
  LineNum?: number;
  Before?: string;
  After?: string;
  Fragments?: (string | { Pre?: string; Match?: string; Post?: string })[];
  Summary?: (string | { Pre?: string; Match?: string; Post?: string })[];
  Language?: string;
  Matches?: ZoektSearchMatch[];
  Branches?: string[];
  Match?: string;
  ContextSnippet?: string;
};

type ZoektSearchResultPayload = {
  matches?: ZoektSearchMatch[];
  Matches?: ZoektSearchMatch[];
  FileMatches?: ZoektSearchMatch[];
  total?: number;
  Duration?: number;
  Stats?: { MatchCount?: number; Duration?: number };
  result?: {
    Matches?: ZoektSearchMatch[];
    FileMatches?: ZoektSearchMatch[];
    Duration?: number;
    Stats?: { MatchCount?: number; Duration?: number };
  };
};

type FileResult = {
  repository: string;
  fileName: string;
  language?: string;
  branches?: string[];
  matches: ZoektSearchMatch[];
};

const buildSnippetKey = (
  repo: string,
  fileName: string,
  line: number | undefined,
  highlight: string
) => {
  return `${repo}|${fileName}|${line ?? 0}|${highlight ?? ""}`;
};

const normalizeMatches = (
  payload: ZoektSearchResultPayload,
  snippetMap: Record<string, string>,
  fallbackHighlight: string
): FileResult[] => {
  const candidate = (payload.result ?? payload) as ZoektSearchResultPayload;
  const fileMap = new Map<string, FileResult>();

  const addMatch = (
    repo: string,
    fileName: string,
    match: ZoektSearchMatch,
    language?: string,
    branches?: string[]
  ) => {
    const key = `${repo}:${fileName}`;
    if (!fileMap.has(key)) {
      fileMap.set(key, {
        repository: repo,
        fileName,
        language,
        branches,
        matches: [],
      });
    }
    const entry = fileMap.get(key)!;
    const lineNumber = match.Line ?? match.LineNum;
    const highlightHint = match.Match ?? fallbackHighlight;
    const snippetKey = buildSnippetKey(repo, fileName, lineNumber, highlightHint);
    entry.matches.push({
      ...match,
      Repository: repo,
      FileName: fileName,
      Language: language ?? match.Language,
      ContextSnippet: snippetMap[snippetKey],
    });
  };

  const pushEntries = (entries?: ZoektSearchMatch[]) => {
    entries?.forEach((entry) => {
      if (!entry.FileName || !entry.Repository) return;
      addMatch(entry.Repository, entry.FileName, entry, entry.Language, entry.Branches);
    });
  };

  pushEntries(candidate.matches);
  pushEntries(candidate.Matches);

  const files = candidate.FileMatches ?? candidate.result?.FileMatches;
  files?.forEach((fileMatch) => {
    const repoName = fileMatch.Repo ?? fileMatch.Repository ?? "";
    const fileName = fileMatch.FileName ?? "";
    const branches = fileMatch.Branches;
    if (!repoName || !fileName) return;
    const innerMatches = fileMatch.Matches;
    if (innerMatches && innerMatches.length) {
      innerMatches.forEach((innerMatch) => {
        addMatch(repoName, fileName, innerMatch, fileMatch.Language, branches);
      });
    } else {
      addMatch(repoName, fileName, fileMatch, fileMatch.Language, branches);
    }
  });

  return Array.from(fileMap.values());
};

type ZoektSearchProps = {
  query: string;
  caseSensitive: boolean;
  searchTrigger: number;
  patternMode: "literal" | "regexp";
};

// Chevron icon component
const ChevronIcon = ({ expanded, className = "" }: { expanded: boolean; className?: string }) => (
  <svg
    className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""} ${className}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const ZoektSearch = ({
  query,
  caseSensitive,
  searchTrigger,
  patternMode,
}: ZoektSearchProps) => {
  const [results, setResults] = useState<FileResult[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track expanded state for files and matches
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());

  const toggleFile = (fileKey: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileKey)) {
        next.delete(fileKey);
      } else {
        next.add(fileKey);
      }
      return next;
    });
  };

  const toggleMatch = (matchKey: string) => {
    setExpandedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(matchKey)) {
        next.delete(matchKey);
      } else {
        next.add(matchKey);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setCount(null);
      setDurationSeconds(null);
      return;
    }

    let cancelled = false;
    const trimmedQuery = query.trim();

    const performSearch = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await window.electron.searchZoekt({
          query: trimmedQuery,
          context: 2,
          case: caseSensitive ? "yes" : "no",
          pattern: patternMode ?? "literal",
        });
        console.log("[Zoekt] raw HTTP response", response);
        const payload = (response.result ?? response) as ZoektSearchResultPayload;
        const snippetMap: Record<string, string> =
          (response as { snippets?: Record<string, string> }).snippets ?? {};
        const normalized = normalizeMatches(payload, snippetMap, trimmedQuery);

        if (cancelled) return;

        setResults(normalized);
        const stats = payload.Stats ?? payload.result?.Stats;
        setCount(payload.total ?? stats?.MatchCount ?? normalized.length);
        
        // Duration is in nanoseconds, convert to seconds
        const durationNs = payload.Duration ?? payload.result?.Duration ?? stats?.Duration;
        if (durationNs !== undefined) {
          setDurationSeconds(durationNs / 1_000_000_000);
        } else {
          setDurationSeconds(null);
        }
        
        // Expand all files and matches by default
        const fileKeys = new Set<string>();
        const matchKeys = new Set<string>();
        normalized.forEach((file, fileIndex) => {
          const fileKey = `${file.repository}-${file.fileName}-${fileIndex}`;
          fileKeys.add(fileKey);
          file.matches.forEach((match, matchIndex) => {
            const lineNum = match.LineNum ?? match.Line ?? 1;
            const matchKey = `${fileKey}-${lineNum}-${matchIndex}`;
            matchKeys.add(matchKey);
          });
        });
        setExpandedFiles(fileKeys);
        setExpandedMatches(matchKeys);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setCount(null);
        setDurationSeconds(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void performSearch();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTrigger]);

  const matchedPreview = results;

  return (
    <div className="w-full max-w-3xl">
      {error && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}
      {count !== null && (
        <div className="mt-3 text-xs uppercase tracking-wide text-slate-400">
          {count} result{count === 1 ? "" : "s"}
          {durationSeconds !== null && (
            <span className="ml-2 text-slate-500">
              in {durationSeconds < 0.01 ? "<0.01" : durationSeconds.toFixed(2)}s
            </span>
          )}
        </div>
      )}
      <div className="mt-4 space-y-3">
        {matchedPreview.map((fileResult, fileIndex) => {
          const fileKey = `${fileResult.repository}-${fileResult.fileName}-${fileIndex}`;
          const isFileExpanded = expandedFiles.has(fileKey);
          
          return (
            <div
              key={fileKey}
              className="rounded-2xl border border-white/5 bg-white/[0.02] text-sm text-slate-100 overflow-hidden"
            >
              <button
                onClick={() => toggleFile(fileKey)}
                className="w-full p-4 flex items-center gap-3 text-xs text-slate-500 hover:bg-white/[0.02] transition-colors text-left"
              >
                <ChevronIcon expanded={isFileExpanded} className="text-slate-500 flex-shrink-0" />
                <span className="font-semibold text-white truncate">{fileResult.repository}</span>
                <span className="truncate">/{fileResult.fileName}</span>
                {fileResult.language && <span className="flex-shrink-0">{getLanguageName(fileResult.language)}</span>}
                {fileResult.branches && fileResult.branches.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white/5 flex-shrink-0">
                    {fileResult.branches.join(", ")}
                  </span>
                )}
                <span className="ml-auto text-slate-600 flex-shrink-0">
                  {fileResult.matches.length} match{fileResult.matches.length === 1 ? "" : "es"}
                </span>
              </button>
              {isFileExpanded && (
                <div className="px-4 pb-4">
                  {fileResult.matches.map((match, matchIndex) => {
                    const lineNum = match.LineNum ?? match.Line ?? 1;
                    const matchKey = `${fileKey}-${lineNum}-${matchIndex}`;
                    const isMatchExpanded = expandedMatches.has(matchKey);
                    
                    // Split and clean before lines, removing trailing empty line
                    const rawBeforeLines = match.Before?.split("\n") ?? [];
                    const beforeLines = rawBeforeLines.length > 0 && rawBeforeLines[rawBeforeLines.length - 1] === ""
                      ? rawBeforeLines.slice(0, -1)
                      : rawBeforeLines;
                    // Split and clean after lines, removing leading empty line if After starts with newline
                    const rawAfterLines = match.After?.split("\n") ?? [];
                    const afterLines = rawAfterLines.length > 0 && rawAfterLines[0] === ""
                      ? rawAfterLines.slice(1)
                      : rawAfterLines;
                    
                    // Get the first fragment for the match line display
                    const fragments = match.Fragments ?? [];
                    const firstFragment = fragments[0];
                    const fragmentData = typeof firstFragment === "object" ? firstFragment : null;
                    
                    // Calculate starting line for before context
                    const beforeStartLine = lineNum - beforeLines.length;
                    // After starts at the match line + 1
                    const afterStartLine = lineNum + 1;

                    const hasContext = beforeLines.length > 0 || afterLines.length > 0 || fragmentData;

                    // Find max line number for consistent gutter width
                    const maxLineNum = Math.max(
                      beforeStartLine + beforeLines.length - 1,
                      afterStartLine + afterLines.length - 1,
                      lineNum
                    );
                    const gutterWidth = String(maxLineNum).length;

                    return (
                      <div key={matchKey} className="mt-3">
                        <button
                          onClick={() => toggleMatch(matchKey)}
                          className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400 hover:text-slate-300 transition-colors"
                        >
                          <ChevronIcon expanded={isMatchExpanded} className="w-3 h-3" />
                          {lineNum !== undefined && <span>line {lineNum}</span>}
                          {match.Language && <span>• {getLanguageName(match.Language)}</span>}
                          {fragmentData?.Match && (
                            <span className="normal-case text-yellow-400/70 font-mono">
                              "{fragmentData.Match}"
                            </span>
                          )}
                        </button>
                        {isMatchExpanded && hasContext ? (
                          <div className="mt-1 rounded-lg border border-white/10 bg-[#0d1117] overflow-hidden font-mono text-xs">
                            {/* Before context */}
                            {beforeLines.map((line, i) => {
                              const ln = beforeStartLine + i;
                              return (
                                <div key={`before-${ln}`} className="flex">
                                  <span 
                                    className="select-none text-slate-600 bg-[#161b22] px-2 py-0.5 text-right border-r border-white/5"
                                    style={{ minWidth: `${gutterWidth + 2}ch` }}
                                  >
                                    {ln}
                                  </span>
                                  <span className="text-slate-500 px-3 py-0.5 flex-1 whitespace-pre overflow-x-auto">
                                    {line}
                                  </span>
                                </div>
                              );
                            })}
                            {/* Match line with fragment */}
                            <div className="flex bg-yellow-500/10 border-l-2 border-yellow-500">
                              <span 
                                className="select-none text-yellow-400 bg-yellow-500/20 px-2 py-0.5 text-right border-r border-yellow-500/20"
                                style={{ minWidth: `${gutterWidth + 2}ch` }}
                              >
                                {lineNum}
                              </span>
                              <span className="px-3 py-0.5 flex-1 whitespace-pre overflow-x-auto">
                                {fragmentData ? (
                                  <>
                                    <span className="text-slate-300">{fragmentData.Pre ?? ""}</span>
                                    <mark className="bg-yellow-500/40 text-yellow-100 rounded px-0.5">
                                      {fragmentData.Match ?? ""}
                                    </mark>
                                    <span className="text-slate-300">{(fragmentData.Post ?? "").split("\n")[0]}</span>
                                  </>
                                ) : (
                                  <span className="text-yellow-200">← match</span>
                                )}
                              </span>
                            </div>
                            {/* After context */}
                            {afterLines.map((line, i) => {
                              const ln = afterStartLine + i;
                              return (
                                <div key={`after-${ln}`} className="flex">
                                  <span 
                                    className="select-none text-slate-600 bg-[#161b22] px-2 py-0.5 text-right border-r border-white/5"
                                    style={{ minWidth: `${gutterWidth + 2}ch` }}
                                  >
                                    {ln}
                                  </span>
                                  <span className="text-slate-500 px-3 py-0.5 flex-1 whitespace-pre overflow-x-auto">
                                    {line}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : isMatchExpanded ? (
                          <p className="mt-1 text-xs text-slate-500">no preview available</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!loading && !matchedPreview.length && (
          <div className="text-xs text-slate-500">No matches yet.</div>
        )}
      </div>
    </div>
  );
};

export default ZoektSearch;
