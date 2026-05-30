type Props = {
  label: string;
  value: string;
};

export function Stat({ label, value }: Props) {
  return (
    <div className="min-w-[140px] flex-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
