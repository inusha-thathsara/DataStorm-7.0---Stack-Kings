type Props = {
  label: string;
  value: string;
};

export function MetricRow({ label, value }: Props) {
  return (
    <p className="text-sm text-text-secondary">
      <span className="text-text-muted">{label}: </span>
      <span className="font-medium text-text-primary">{value}</span>
    </p>
  );
}
