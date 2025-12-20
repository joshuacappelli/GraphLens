type ButtonProps = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
};

const AppBarButton = ({ icon, label, onClick }: ButtonProps) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-2 py-1 rounded-md
      text-xs font-medium
      text-slate-600 hover:text-slate-800
      dark:text-slate-400 dark:hover:text-white
      hover:bg-black/5 dark:hover:bg-white/10
      transition"
  >
    {icon}
    {label}
  </button>
);

type MenuItemProps = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
};

const MenuItem = ({ icon, label, onClick, danger }: MenuItemProps) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 text-sm
      ${danger
        ? "text-red-600 hover:bg-red-500/10"
        : "text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10"}
      transition`}
  >
    {icon}
    {label}
  </button>
);


export { AppBarButton, MenuItem };