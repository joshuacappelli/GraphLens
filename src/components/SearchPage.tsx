import { ArrowLeft } from "lucide-react";
import ZoektSearch from "./ZoektSearch";

type SearchPageProps = {
  onClose: () => void;
};

const SearchPage = ({ onClose }: SearchPageProps) => (
  <section className="flex-1 overflow-hidden flex flex-col items-center justify-start px-6 py-8">
    <div className="w-full max-w-3xl flex items-center justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Search the indexed codebase</h1>
        <p className="text-sm text-slate-400 max-w-2xl">
          Query Zoekt via the Electron main process. Results refresh each time the active snapshot changes.
        </p>
      </div>
      <button
        onClick={onClose}
        className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white transition hover:bg-white/10"
      >
        <ArrowLeft size={12} />
        Back
      </button>
    </div>

    <div className="mt-6 w-full max-w-3xl">
      <ZoektSearch />
    </div>
  </section>
);

export default SearchPage;
