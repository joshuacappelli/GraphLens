import { useEffect, useRef } from "react";
import CloseButtons from "./CloseButtons";

const Header = () => {
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    if(window.electron) {
      window.electron.onToggleTitlebar((show: boolean) => {
        if (show) {
          header.current?.classList.remove("hidden");
        } else {
          header.current?.classList.add("hidden");
        }
      });
    }
  }, []);

  return (
    <nav ref={header} className="h-11 dark:bg-main-crust bg-[#f7f7f7] z-10 drag items-center justify-between inline-flex">
      {/* CENTER (optional branding / empty for drag space) */}
      <div className="flex-1 text-center text-xs text-slate-400 pointer-events-none select-none">
        Neptune
      </div>
      
      {window.electron && <CloseButtons />}
    </nav>
  );
};

export default Header;
