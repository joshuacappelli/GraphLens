import { useEffect, useRef } from "react";
import CloseButtons from "./CloseButtons";
import {PanelLeft} from "lucide-react";
import Tooltip from "./Tooltip";

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
            <Tooltip text="Tools panel">
              <PanelLeft size={16} />    
              </Tooltip>
            </button>
        </div>
        {window.electron && <CloseButtons />}
      </div>
      
  
    </nav>
  );
};

export default Header;
