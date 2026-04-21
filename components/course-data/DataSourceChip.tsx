import { Chip } from "@/components/ui/Chip";

type DataSourceChipProps = {
  sourceType?: string | null;
};

function toLabel(sourceType?: string | null): string {
  const raw = String(sourceType ?? "").trim().toLowerCase();
  if (!raw) return "Unknown";
  if (raw.includes("api") || raw === "golfcourseapi") return "API";
  if (raw.includes("official")) return "Official";
  if (raw.includes("pdf")) return "PDF";
  if (raw.includes("curated")) return "Curated";
  if (raw.includes("manual")) return "Manual";
  return raw;
}

export function DataSourceChip({ sourceType }: DataSourceChipProps) {
  return <Chip>{toLabel(sourceType)}</Chip>;
}
