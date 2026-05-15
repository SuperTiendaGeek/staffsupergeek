type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
};

type ShippingTableProps<T> = {
  title: string;
  description?: string;
  rows: T[];
  columns: Array<Column<T>>;
  getRowKey: (row: T) => string;
};

export function formatCurrencyUSD(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatDate(value: string) {
  if (!value) return "-";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "America/Guayaquil",
  }).format(date);
}

export function BooleanPill({ value }: { value: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${value ? "bg-geek-lime text-black" : "bg-white/10 text-zinc-400"}`}>
      {value ? "Sí" : "No"}
    </span>
  );
}

export function ShippingTable<T>({ title, description, rows, columns, getRowKey }: ShippingTableProps<T>) {
  return (
    <section className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#181818] shadow-2xl shadow-black/20">
      <div className="border-b border-white/10 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm text-zinc-400">{description}</p> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/[0.035] text-left text-xs uppercase tracking-normal text-zinc-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap px-4 py-3 font-semibold ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : ""}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-zinc-300">
            {rows.length ? rows.map((row) => (
              <tr key={getRowKey(row)} className="transition hover:bg-white/[0.035]">
                {columns.map((column) => (
                  <td key={column.key} className={`max-w-[260px] whitespace-nowrap px-4 py-3 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : ""}`}>
                    <span className="block truncate">{column.render(row)}</span>
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-zinc-500">
                  No hay datos para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
