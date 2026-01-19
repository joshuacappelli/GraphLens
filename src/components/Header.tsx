import { useEffect, useRef } from "react";
import CloseButtons from "./CloseButtons";
import {PanelLeft} from "lucide-react";

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
    <nav ref={header} className="h-[36px] dark:bg-main-crust z-10 drag items-center justify-between inline-flex">
      {/* CENTER (optional branding / empty for drag space) */}
      <div className="flex items-center gap-2">
        <div className="flex items-center ml-[85px]">
        <button
          onClick={() => {
            onToggleDirectory?.();
          }}
          className="no-drag flex h-6 w-8 text-xs items-xs items-center justify-center rounded-md bg-main-crustLight"
        >
          <PanelLeft size={16} />    
          </button>
        </div>
        {window.electron && <CloseButtons />}
      </div>
      <div className="flex-1 text-center text-xs text-slate-400 pointer-events-none select-none">
        Neptune
      </div>
      
  
    </nav>
  );
};

export default Header;
