import { FormEvent, useMemo, useState } from "react";
import ZoektSearch from "./ZoektSearch";
import { Regex, CaseSensitive } from "lucide-react";

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [contextLines, setContextLines] = useState(2);
  const [numResults, setNumResults] = useState(50);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [repoSuggestions, setRepoSuggestions] = useState<Set<string>>(new Set());
  const [useRegex, setUseRegex] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTrigger((prev) => prev + 1);
  };

  const suggestionList = useMemo(
    () => [...repoSuggestions].sort(),
    [repoSuggestions]
  );

  return (
    <section className="flex-1 flex flex-col items-center justify-start py-8">
      <div className="sticky top-0 z-20 w-full border border-white/5 bg-slate-950/80 p-4 shadow-2xl shadow-black/20 backdrop-blur">
        <form onSubmit={handleSubmit} className="flex">
          <div className="relative flex-1">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code across indexed repos"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 pr-32 text-sm text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
              <label className="flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-slate-500 transition hover:border-blue-400 hover:text-white">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(event) => setCaseSensitive(event.target.checked)}
                  className="h-3 w-3 rounded border border-white/20 bg-transparent accent-blue-400"
                />
                <CaseSensitive size={16} />
              </label>
              <label className="flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-slate-500 transition hover:border-blue-400 hover:text-white">
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(event) => setUseRegex(event.target.checked)}
                  className="h-3 w-3 rounded border border-white/20 bg-transparent accent-blue-400"
                />
                <Regex size={16} />
              </label>
            </div>
          </div>
        </form>

        <div className="mt-3 grid gap-3 text-xs text-slate-400 md:grid-cols-3">
          <label className="flex flex-col text-[10px] uppercase tracking-wide">
            Repo filter
            <input
              list="repo-options"
              value={repoFilter}
              onChange={(event) => setRepoFilter(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0f172a]/60 px-2 py-1 text-xs text-white focus:outline-none"
            />
            <datalist id="repo-options">
              {suggestionList.map((repo) => (
                <option key={repo} value={repo} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col text-[10px] uppercase tracking-wide">
            Context lines
            <input
              type="number"
              min={1}
              max={5}
              value={contextLines}
              onChange={(event) =>
                setContextLines(
                  Math.max(1, Math.min(5, Number(event.target.value) || 1))
                )
              }
              className="w-full rounded-xl border border-white/10 bg-[#0f172a]/60 px-2 py-1 text-xs text-white focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-[10px] uppercase tracking-wide">
            Results
            <input
              type="number"
              min={10}
              max={200}
              value={numResults}
              onChange={(event) =>
                setNumResults(
                  Math.max(10, Math.min(200, Number(event.target.value) || 50))
                )
              }
              className="w-full rounded-xl border border-white/10 bg-[#0f172a]/60 px-2 py-1 text-xs text-white focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="mt-6 w-full max-w-3xl">
        <ZoektSearch
          query={query}
          caseSensitive={caseSensitive}
          repoFilter={repoFilter}
          contextLines={contextLines}
          numResults={numResults}
          searchTrigger={searchTrigger}
          patternMode={useRegex ? "regexp" : "literal"}
          onRepoSuggestionsUpdate={(repos) =>
            setRepoSuggestions(new Set(repos))
          }
        />
      </div>
    </section>
  );
};

export default SearchPage;
