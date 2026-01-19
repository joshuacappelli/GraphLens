import { useEffect, useRef } from "react";
import CloseButtons from "./CloseButtons";

type HeaderProps = {
  onToggleDirectory?: () => void;
};

const Header = ({ onToggleDirectory }: HeaderProps) => {
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
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            console.info("[UI] directory toggle clicked");
            onToggleDirectory?.();
          }}
          className="no-drag flex h-7 w-10 items-center justify-center rounded-md border border-white/10 text-[11px] uppercase tracking-[0.2em] text-slate-500 hover:border-blue-400 hover:text-blue-300 hover:bg-white/5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          DIR
        </button>
        {window.electron && <CloseButtons />}
      </div>
      <div className="flex-1 text-center text-xs text-slate-400 pointer-events-none select-none">
        Neptune
      </div>
      
  
    </nav>
  );
};

export default Header;
