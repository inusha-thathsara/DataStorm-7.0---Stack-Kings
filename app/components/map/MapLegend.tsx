import { Badge } from "@/components/ui/Badge";
import { PROVINCE_MAP_COLORS, provinceColor } from "@/lib/map/pins";

type Props = {
  provinceFilter?: string;
};

export function MapLegend({ provinceFilter = "" }: Props) {
  const singleProvince = Boolean(provinceFilter);

  return (
    <div className="flex flex-wrap gap-2 border-b border-border-muted px-4 py-2.5">
      {singleProvince ? (
        <Badge tone="default">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full"
            style={{ background: provinceColor(provinceFilter) }}
          />
          {provinceFilter}
        </Badge>
      ) : (
        Object.entries(PROVINCE_MAP_COLORS).map(([name, color]) => (
          <Badge key={name} tone="muted">
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full"
              style={{ background: color }}
            />
            {name}
          </Badge>
        ))
      )}
      <Badge tone="success">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-accent" />
        Trade spend
      </Badge>
    </div>
  );
}
