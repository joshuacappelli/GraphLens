import { FormEvent, useState } from "react";
import ZoektSearch from "./ZoektSearch";
import { Regex, CaseSensitive, X } from "lucide-react";
import Tooltip from "./Tooltip";

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [useRegex, setUseRegex] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTrigger((prev) => prev + 1);
  };

  return (
    <section className="flex-1 flex flex-col items-center justify-start">
      <div className="sticky top-0 z-20 w-full border border-white/5 bg-slate-950/80 py-4 shadow-2xl shadow-black/20 backdrop-blur">
        <form onSubmit={handleSubmit} className="flex">
          <div className="relative flex-1">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code across indexed repos"
              className="w-full border border-white/10 bg-white/[0.04] px-4 py-2 pr-32 text-sm text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearchTrigger((prev) => prev + 1);
                }}
                className="flex items-center justify-center border-white/10 bg-white/5 px-2 w-full h-full text-[11px] text-slate-500 transition hover:text-white"
              >
                <Tooltip text="Clear search">
                  <X size={16} />
                </Tooltip>
              </button>
              <button
                type="button"
                onClick={() => setCaseSensitive((prev) => !prev)}
                className={`flex items-center border-l px-2 h-full transition ${
                  caseSensitive
                    ? "border-blue-400 bg-blue-500 text-white"
                    : "border-white/10 bg-white/5 text-slate-500 hover:text-white"
                }`}
              >
                <Tooltip text="Case sensitive">
                  <CaseSensitive size={16} />
                </Tooltip>
              </button>
              <button
                type="button"
                onClick={() => setUseRegex((prev) => !prev)}
                className={`flex items-center border-l px-2 h-full transition ${
                  useRegex
                    ? "border-blue-400 bg-blue-500 text-white"
                    : "border-white/10 bg-white/5 text-slate-500 hover:text-white"
                }`}
              >
                <Tooltip text="Regex">
                  <Regex size={16} />
                </Tooltip>
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="w-full">
        <ZoektSearch
          query={query}
          caseSensitive={caseSensitive}
          searchTrigger={searchTrigger}
          patternMode={useRegex ? "regexp" : "literal"}
        />
      </div>
    </section>
  );
};

export default SearchPage;
