import { useEffect, useRef } from "react";
import CloseButtons from "./CloseButtons";
import { PanelLeft, Plus, X } from "lucide-react";
import Tooltip from "./Tooltip";
import { useTabsStore, type Tab, type TabsState } from "../context/tabsStore";

type HeaderProps = {
  onToggleDirectory?: () => void;
};

const Header = ({ onToggleDirectory }: HeaderProps) => {
  const header = useRef<HTMLElement>(null);
  const tabs = useTabsStore((s: TabsState) => s.tabs);
  const activeTabId = useTabsStore((s: TabsState) => s.activeTabId);
  const addTab = useTabsStore((s: TabsState) => s.addTab);
  const closeTab = useTabsStore((s: TabsState) => s.closeTab);
  const setActiveTab = useTabsStore((s: TabsState) => s.setActiveTab);

  useEffect(() => {
    if (window.electron) {
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
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="flex items-center ml-[85px] gap-1">
          <button
            onClick={() => onToggleDirectory?.()}
            className="no-drag flex h-6 w-8 text-xs items-center justify-center rounded-md bg-main-crustLight"
          >
            <Tooltip text="Tools panel">
              <PanelLeft size={16} />
            </Tooltip>
          </button>
          <div className="no-drag flex items-center gap-0.5 ml-2 border border-white/10 rounded-md overflow-hidden bg-main-crustLight/80">
            {tabs.map((tab: Tab) => {
              const isActive = tab.id === activeTabId;
              const canClose = tabs.length > 1;
              return (
                <div
                  key={tab.id}
                  className={`flex items-center gap-1 pr-1 min-w-0 max-w-[140px] group ${
                    isActive ? "bg-main-crustLight" : "hover:bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="flex-1 flex items-center gap-1.5 py-1 pl-2 text-left text-xs truncate"
                  >
                    <span className="truncate">{tab.displayLabel}</span>
                  </button>
                  {canClose && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 opacity-70 group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addTab}
              className="no-drag flex h-6 w-6 items-center justify-center hover:bg-white/10"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        {window.electron && <CloseButtons />}
      </div>
    </nav>
  );
};

export default Header;
