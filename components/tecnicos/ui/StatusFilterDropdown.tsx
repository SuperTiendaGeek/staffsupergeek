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
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#D7FF4F]">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${
          label ? "mt-2" : ""
        } relative flex w-full items-center justify-between rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-4 py-2.5 text-left text-sm font-semibold text-[#F5F5F5] shadow-[0_4px_12px_rgba(0,0,0,0.28)] transition hover:border-[#D7FF4F]/50 focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/40 ${buttonClassName}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-4 w-4 text-[#A7A7A7] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="5 7 10 12 15 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute z-40 mt-1.5 w-full min-w-[220px] max-w-[280px] overflow-hidden rounded-lg border border-[#3A3A36] bg-[#252622] shadow-[0_12px_28px_rgba(0,0,0,0.40)] ${dropdownClassName}`}
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
                    className={`w-full px-4 py-2.5 text-left text-sm transition ${
                      active
                        ? "border-l-2 border-[#D7FF4F] bg-[#2D2E2A] text-white"
                        : "text-[#CFCFCB] hover:bg-[#2D2E2A] hover:text-[#F5F5F5]"
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
