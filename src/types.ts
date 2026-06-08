export type ExposureAudience =
  | "本页 JavaScript"
  | "本站服务器"
  | "第三方服务"
  | "需要用户授权"
  | "用户主动输入";

export type RiskLevel = "低" | "中" | "高";

export type Stability = "一次性" | "会话内稳定" | "跨会话可能稳定" | "授权后稳定" | "不稳定";

export type Linkability = "低" | "中" | "高";

export interface ExposureItem {
  id: string;
  group: string;
  label: string;
  value: string;
  displayValue: string;
  fingerprintValue?: string;
  includeInFingerprint?: boolean;
  audience: ExposureAudience;
  risk: RiskLevel;
  stability: Stability;
  linkability: Linkability;
  leakedFeature: string;
  explanation: string;
  caveat?: string;
}

export interface Summary {
  itemCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  highLinkabilityCount: number;
  fingerprintId: string;
  fingerprintInputCount: number;
  linkabilityScore: number;
  linkabilityLevel: Linkability;
  generatedAt: string;
}

export interface PrivacyReport {
  summary: Summary;
  items: ExposureItem[];
}
