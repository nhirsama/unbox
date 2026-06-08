import type { ExposureItem, Linkability, RiskLevel } from "./types";

export function stringifyValue(value: unknown): string {
  if (value === undefined) return "不支持 / 未暴露";
  if (value === null) return "null";
  if (typeof value === "string") return value || "空字符串";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(stringifyValue).join(", ") : "空数组";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function truncate(value: string, maxLength = 260): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export function getRiskWeight(risk: RiskLevel): number {
  if (risk === "高") return 3;
  if (risk === "中") return 2;
  return 1;
}

export function getLinkabilityWeight(linkability: Linkability): number {
  if (linkability === "高") return 3;
  if (linkability === "中") return 2;
  return 1;
}

export function calculateLinkabilityLevel(items: ExposureItem[]): {
  score: number;
  level: Linkability;
} {
  const score = items.reduce((total, item) => {
    const stableBonus =
      item.stability === "跨会话可能稳定" || item.stability === "授权后稳定" ? 1 : 0;
    return total + getLinkabilityWeight(item.linkability) * getRiskWeight(item.risk) + stableBonus;
  }, 0);

  if (score >= 120) return { score, level: "高" };
  if (score >= 64) return { score, level: "中" };
  return { score, level: "低" };
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function compactFingerprintInput(items: ExposureItem[]): string {
  return items
    .filter((item) => item.includeInFingerprint !== false)
    .filter((item) => item.linkability !== "低")
    .filter((item) => item.stability === "跨会话可能稳定" || item.stability === "授权后稳定")
    .map((item) => `${item.id}:${item.fingerprintValue ?? item.displayValue ?? item.value}`)
    .sort()
    .join("|");
}

export function createDownload(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
