type TopBarProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
};

export function TopBar({ title, subtitle, rightSlot }: TopBarProps) {
  return (
    <header className="flex items-center justify-between bg-[#181818] border border-zinc-900/70 rounded-xl px-7 py-5 shadow-[0_12px_36px_rgba(0,0,0,0.4)]">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="text-sm text-zinc-400">{rightSlot ?? <span className="opacity-30">Reservado</span>}</div>
    </header>
  );
}
