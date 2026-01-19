import { ReactNode, useRef, useState, useEffect } from "react";

export type TooltipProps = {
  children: ReactNode;
  text: string;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
  delay?: number; // time in ms until the tooltip shows, default 0
};

const POSITION_MAP: Record<
  NonNullable<TooltipProps["position"]>,
  string
> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const Tooltip = ({
  children,
  text,
  position = "bottom",
  className = "",
  delay = 0,
}: TooltipProps) => {
  const positionClasses = POSITION_MAP[position];
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (delay > 0) {
      timeoutRef.current = setTimeout(() => setVisible(true), delay);
    } else {
      setVisible(true);
    }
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={showTooltip}
      onFocus={showTooltip}
      onMouseLeave={hideTooltip}
      onBlur={hideTooltip}
      tabIndex={0}
      style={{outline: "none"}}
    >
      {children}
      <span
        className={`pointer-events-none absolute whitespace-nowrap rounded-full border border-white/20 bg-slate-900 px-2 py-1 text-[10px] text-white transition-opacity ${positionClasses} ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {text}
      </span>
    </div>
  );
};

export default Tooltip;
