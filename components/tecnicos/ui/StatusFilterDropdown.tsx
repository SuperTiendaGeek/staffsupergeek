import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

type StatusFilterDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label?: string;
  className?: string;
  dropdownClassName?: string;
  buttonClassName?: string;
};

export function StatusFilterDropdown({
  value,
  onChange,
  options,
  label = "Filtrar por estado",
  className = "",
  dropdownClassName = "",
  buttonClassName = "",
}: StatusFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className={`w-full ${className}`} ref={ref}>
      {label && (
        <span className="text-[11px] uppercase tracking-[0.08em] text-[#e3fc02] font-semibold">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${
          label ? "mt-2" : ""
        } relative w-full rounded-lg border border-[#e3fc02] bg-[#121212] px-4 py-2.5 text-left text-sm font-semibold text-zinc-200 shadow-[0_10px_24px_rgba(0,0,0,0.35)] flex items-center justify-between transition hover:border-[#f3ff56] focus:outline-none focus:ring-2 focus:ring-[#e3fc02]/60 ${buttonClassName}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="5 7 10 12 15 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute z-40 mt-2 min-w-[220px] w-full max-w-[280px] overflow-hidden rounded-lg border border-zinc-800 bg-[#151515] shadow-[0_16px_34px_rgba(0,0,0,0.45)] ${dropdownClassName}`}
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition ${
                      active
                        ? "bg-[#1f1f1f] text-white border-l-2 border-[#e3fc02]"
                        : "text-zinc-200 hover:bg-[#1d1d1d]"
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
