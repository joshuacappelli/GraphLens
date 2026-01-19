import { useEffect, useState } from "react";

type ZoektSearchMatch = {
  Repository?: string;
  Repo?: string;
  FileName?: string;
  Line?: number;
  LineNum?: number;
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
  Stats?: { MatchCount?: number };
  result?: {
    Matches?: ZoektSearchMatch[];
    FileMatches?: ZoektSearchMatch[];
    Stats?: { MatchCount?: number };
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

const formatFragment = (fragment: string | { Pre?: string; Match?: string; Post?: string }) => {
  const raw =
    typeof fragment === "string"
      ? fragment
      : `${fragment.Pre ?? ""}<mark>${fragment.Match ?? ""}</mark>${fragment.Post ?? ""}`;
  return raw.trim().replace(/\n/g, "<br />");
};

const formatSnippet = (match: ZoektSearchMatch) => {
  const rawFragments = match.Fragments?.filter(Boolean) ?? match.Summary?.filter(Boolean);
  if (rawFragments && rawFragments.length > 0) {
    const formatted = rawFragments.map(formatFragment);
    console.info(`[Zoekt] snippet fragments for ${match.FileName}`, formatted);
    return formatted.join(" … ");
  }
  if (typeof match.Line === "number") {
    console.info(`[Zoekt] snippet fallback literal line ${match.Line}`, match);
    return `line ${match.Line}`;
  }
  console.warn("[Zoekt] no fragments available for match", match);
  return "";
};

type ZoektSearchProps = {
  query: string;
  caseSensitive: boolean;
  repoFilter: string;
  contextLines: number;
  numResults: number;
  searchTrigger: number;
  patternMode: "literal" | "regexp";
  onRepoSuggestionsUpdate?: (repos: string[]) => void;
};

const ZoektSearch = ({
  query,
  caseSensitive,
  repoFilter,
  contextLines,
  numResults,
  searchTrigger,
  patternMode,
  onRepoSuggestionsUpdate,
}: ZoektSearchProps) => {
  const [results, setResults] = useState<FileResult[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setCount(null);
      onRepoSuggestionsUpdate?.([]);
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
          num: numResults,
          context: contextLines,
          case: caseSensitive ? "yes" : "no",
          repo: repoFilter || undefined,
          pattern: patternMode ?? "literal",
        });
        const payload = (response.result ?? response) as ZoektSearchResultPayload;
        const snippetMap: Record<string, string> =
          (response as { snippets?: Record<string, string> }).snippets ?? {};
        const normalized = normalizeMatches(payload, snippetMap, trimmedQuery);

        if (cancelled) return;

        setResults(normalized);
        const stats = payload.Stats ?? payload.result?.Stats;
        setCount(payload.total ?? stats?.MatchCount ?? normalized.length);
        const repos = Array.from(new Set(normalized.map((m) => m.repository)));
        onRepoSuggestionsUpdate?.(repos);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setCount(null);
        onRepoSuggestionsUpdate?.([]);
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
        </div>
      )}
      <div className="mt-4 space-y-3">
        {matchedPreview.map((fileResult, fileIndex) => (
          <div
            key={`${fileResult.repository}-${fileResult.fileName}-${fileIndex}`}
            className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-100"
          >
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="font-semibold text-white truncate">{fileResult.repository}</span>
              <span>/{fileResult.fileName}</span>
              {fileResult.language && <span className="uppercase">{fileResult.language}</span>}
              {fileResult.branches && fileResult.branches.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-white/5">
                  {fileResult.branches.join(", ")}
                </span>
              )}
            </div>
            {fileResult.matches.map((match, matchIndex) => (
              <div key={`${match.FileName}-${match.Line}-${matchIndex}`} className="mt-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                  {match.Line !== undefined && <span>line {match.Line}</span>}
                  {match.Language && <span>{match.Language}</span>}
                </div>
                <p
                  className="mt-1 text-xs text-slate-300"
                  dangerouslySetInnerHTML={{
                    __html:
                      match.ContextSnippet ||
                      formatSnippet(match) ||
                      "no preview available",
                  }}
                />
                {match.Fragments && match.Fragments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-blue-300">
                {match.Fragments.slice(0, 3).map((fragment, fragmentIndex) => {
                  const html = formatFragment(fragment);
                  const text = html.replace(/<[^>]+>/g, "");
                  const truncated = text.length > 800 ? `${text.slice(0, 797)}…` : text;
                  return (
                    <span
                      key={`${match.FileName}-${match.Line}-${fragmentIndex}`}
                      className="rounded-full border border-white/10 px-2 py-0.5 bg-white/5"
                      title={truncated}
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {!loading && !matchedPreview.length && (
          <div className="text-xs text-slate-500">No matches yet.</div>
        )}
      </div>
    </div>
  );
};

export default ZoektSearch;
