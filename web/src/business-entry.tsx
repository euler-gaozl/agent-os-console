import { ArrowUpRight, Layers } from "lucide-react";

export type BusinessEntry =
  | { status: "loading" | "unavailable" | "unconfigured" }
  | { status: "ready"; url: string };

export function businessEntryFromConfig(config: unknown): BusinessEntry {
  if (!config || typeof config !== "object" || !("futures_public_url" in config))
    return { status: "unavailable" };
  const value = config.futures_public_url;
  if (typeof value !== "string") return { status: "unavailable" };
  const entry = value.trim();
  if (!entry) return { status: "unconfigured" };
  try {
    const url = new URL(entry);
    if (
      entry.length > 2048 || /[\\\r\n\t?#]/.test(entry) ||
      !["http:", "https:"].includes(url.protocol) || !url.hostname ||
      url.username || url.password
    ) return { status: "unavailable" };
    return { status: "ready", url: entry };
  } catch {
    return { status: "unavailable" };
  }
}

// Navigation is explicit: this component never fetches, preloads or probes the
// business site and never passes the Console token to the destination.
export function BusinessEntryLink({ entry }: { entry: BusinessEntry }) {
  const content = <>
    <span className="app-icon"><Layers size={16} /></span>
    <span className="business-link-label">研序 · 期货研究
      {entry.status !== "ready" && <small>{
        entry.status === "loading" ? "业务入口读取中" :
          entry.status === "unconfigured" ? "业务入口未配置" : "业务入口暂不可用"
      }</small>}
    </span>
    {entry.status === "ready" && <ArrowUpRight size={14} />}
  </>;
  return entry.status === "ready"
    ? <a className="business-link" href={entry.url} target="_blank" rel="noopener noreferrer">{content}</a>
    : <span className="business-link" role="link" aria-disabled="true">{content}</span>;
}
