import ZoektSearch from "./ZoektSearch";
import Home from "./Home";
type SearchPageProps = {
  onClose: () => void;
};

const SearchPage = ({ onClose }: SearchPageProps) => (
  <section className="flex-1 overflow-auto flex flex-col items-center justify-start px-6 py-8">
    <div className="w-full max-w-3xl flex items-center justify-between">
     
     
    </div>

    <div className="mt-6 w-full max-w-3xl">
      <ZoektSearch />
    </div>
  </section>
);

export default SearchPage;
