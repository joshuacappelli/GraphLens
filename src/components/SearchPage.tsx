import { FormEvent, useMemo, useState } from "react";
import ZoektSearch from "./ZoektSearch";

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [contextLines, setContextLines] = useState(2);
  const [numResults, setNumResults] = useState(50);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [repoSuggestions, setRepoSuggestions] = useState<Set<string>>(new Set());

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTrigger((prev) => prev + 1);
  };

  const suggestionList = useMemo(
    () => [...repoSuggestions].sort(),
    [repoSuggestions]
  );

  return (
    <section className="flex-1 overflow-auto flex flex-col items-center justify-start px-6 py-8">
      <div className="sticky top-4 z-20 w-full max-w-3xl rounded-3xl border border-white/5 bg-slate-950/80 p-4 shadow-2xl shadow-black/20 backdrop-blur">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search code across indexed repos"
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            type="submit"
            className="flex-shrink-0 rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blue-600 disabled:opacity-60"
          >
            Search
          </button>
        </form>

        <div className="mt-3 grid gap-3 text-xs text-slate-400 md:grid-cols-3">
          <label className="flex flex-col text-[10px] uppercase tracking-wide">
            Case sensitive?
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => setCaseSensitive(event.target.checked)}
              className="ml-1 mt-1 accent-blue-400"
            />
          </label>
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
          onRepoSuggestionsUpdate={(repos) =>
            setRepoSuggestions(new Set(repos))
          }
        />
      </div>
    </section>
  );
};

export default SearchPage;
