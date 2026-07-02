import type { ProbeResult, RiskLevel } from './types'
import type { CalendarProbeData } from './probes/calendar'
import type { EmojiProbeData } from './probes/emoji'
import type { FontProbeData } from './probes/fonts'
import type { HistoryProbeData } from './probes/history'
import type { KeyboardProbeData } from './probes/keyboard'
import type { LocaleProbeData } from './probes/locale'
import type { NetworkProbeData } from './probes/network'
import type { SpeechProbeData } from './probes/speech'
import type { TlsProbeData } from './probes/tls'
import type { WebRtcProbeData } from './probes/webrtc'

export type AttributionSource =
  | 'ip'
  | 'webrtc'
  | 'reachability'
  | 'locale'
  | 'timezone'
  | 'calendar'
  | 'emoji'
  | 'fonts'
  | 'keyboard'
  | 'speech'
  | 'tls'
  | 'history'

export interface CountryEvidence {
  id: string
  source: AttributionSource
  country: string
  label: string
  weight: number
  confidence: number
  detail: string
  data?: Record<string, unknown>
}

export interface CountryAttribution {
  country: string
  label: string
  confidence: number
  score: number
  evidence: CountryEvidence[]
}

export interface SpoofingAssessment {
  score: number
  level: RiskLevel
  summary: string
  conflicts: string[]
}

export interface IdentityAttributionSummary {
  topCountries: CountryAttribution[]
  evidence: CountryEvidence[]
  spoofing: SpoofingAssessment
}

const countryNames: Record<string, string> = {
  CN: '中国大陆',
  TW: '中国台湾',
  HK: '中国香港',
  MO: '中国澳门',
  US: '美国',
  GB: '英国',
  CA: '加拿大',
  AU: '澳大利亚',
  NZ: '新西兰',
  JP: '日本',
  KR: '韩国',
  SG: '新加坡',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
  PH: '菲律宾',
  ID: '印度尼西亚',
  IN: '印度',
  DE: '德国',
  AT: '奥地利',
  CH: '瑞士',
  BE: '比利时',
  FR: '法国',
  IT: '意大利',
  ES: '西班牙',
  NL: '荷兰',
  PL: '波兰',
  PT: '葡萄牙',
  SE: '瑞典',
  NO: '挪威',
  DK: '丹麦',
  FI: '芬兰',
  CZ: '捷克',
  RU: '俄罗斯',
  BR: '巴西',
  MX: '墨西哥',
  AE: '阿联酋',
  TR: '土耳其',
  IR: '伊朗',
  IL: '以色列',
}

const reachabilityRegionCountries: Record<string, string> = {
  'region-tw': 'TW',
  'region-hk': 'HK',
  'region-jp': 'JP',
  'region-kr': 'KR',
  'region-ru': 'RU',
  'region-ir': 'IR',
}

const timezoneCountries: Record<string, string> = {
  'Asia/Shanghai': 'CN',
  'Asia/Urumqi': 'CN',
  'Asia/Chongqing': 'CN',
  'Asia/Harbin': 'CN',
  'Asia/Taipei': 'TW',
  'Asia/Hong_Kong': 'HK',
  'Asia/Macau': 'MO',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Manila': 'PH',
  'Asia/Jakarta': 'ID',
  'Asia/Kolkata': 'IN',
  'Europe/London': 'GB',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Rome': 'IT',
  'Europe/Madrid': 'ES',
  'Europe/Amsterdam': 'NL',
  'Europe/Warsaw': 'PL',
  'Europe/Moscow': 'RU',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Montreal': 'CA',
  'America/Sao_Paulo': 'BR',
  'America/Mexico_City': 'MX',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Perth': 'AU',
  'Pacific/Auckland': 'NZ',
}

const sourceLabels: Record<AttributionSource, string> = {
  ip: '出口 IP/GeoIP',
  webrtc: 'WebRTC/STUN',
  reachability: '连通性矩阵',
  locale: '语言/地区',
  timezone: '时区',
  calendar: '日历系统',
  emoji: 'Emoji 渲染',
  fonts: '字体',
  keyboard: '键盘布局',
  speech: '语音包',
  tls: 'TLS/浏览器栈',
  history: '地域缓存/DNS',
}

type EvidenceFamily = 'network' | 'localization' | 'system'

const sourceFamilies: Record<AttributionSource, EvidenceFamily> = {
  ip: 'network',
  webrtc: 'network',
  reachability: 'network',
  locale: 'localization',
  timezone: 'localization',
  calendar: 'localization',
  emoji: 'system',
  fonts: 'system',
  keyboard: 'system',
  speech: 'system',
  tls: 'system',
  history: 'system',
}

const sourceCaps: Record<AttributionSource, number> = {
  ip: 0.46,
  webrtc: 0.38,
  reachability: 0.32,
  timezone: 0.3,
  locale: 0.28,
  calendar: 0.16,
  tls: 0.24,
  fonts: 0.16,
  speech: 0.14,
  keyboard: 0.14,
  emoji: 0.1,
  history: 0.08,
}

const familyCaps: Record<EvidenceFamily, number> = {
  network: 0.58,
  localization: 0.46,
  system: 0.32,
}

function getData<T>(results: ProbeResult[], id: string): T | undefined {
  return results.find((item) => item.id === id)?.data as T | undefined
}

export function countryDisplayName(country: string): string {
  return countryNames[country] ?? country
}

export function confidenceToLevel(score: number): RiskLevel {
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  if (score >= 25) return 'low'
  return 'info'
}

export function sourceDisplayName(source: AttributionSource): string {
  return sourceLabels[source]
}

function normalizeCountryCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  const upper = text.toUpperCase()
  if (/^[A-Z]{2}$/.test(upper)) return upper
  const matched = Object.entries(countryNames).find(([, name]) => name === text || name.toUpperCase() === upper)
  return matched?.[0]
}

function regionFromLanguageTag(tag: string): string | undefined {
  try {
    const locale = new Intl.Locale(tag)
    if (locale.region) return locale.region.toUpperCase()
    if (locale.language === 'zh' && locale.script === 'Hans') return 'CN'
    if (locale.language === 'zh' && locale.script === 'Hant') return 'TW'
  } catch {
    // fall through to regex parser
  }

  const lower = tag.toLowerCase()
  if (lower === 'zh-cn' || lower.startsWith('zh-hans')) return 'CN'
  if (lower.includes('zh-tw') || lower.includes('zh-hant')) return 'TW'
  if (lower.includes('zh-hk')) return 'HK'
  if (lower.includes('zh-mo')) return 'MO'

  const parts = tag.split('-')
  const region = parts.slice(1).find((part) => /^[A-Za-z]{2}$/.test(part))
  return region?.toUpperCase()
}

function addEvidence(evidence: CountryEvidence[], item: Omit<CountryEvidence, 'label'>) {
  evidence.push({ ...item, label: countryDisplayName(item.country) })
}

function combineCapped(values: number[], cap: number): number {
  if (cap <= 0 || values.length === 0) return 0
  let residual = 1
  for (const value of values) {
    const normalized = Math.max(0, Math.min(0.95, value / cap))
    residual *= 1 - normalized
  }
  return cap * (1 - residual)
}

function collectLocaleEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const locale = getData<LocaleProbeData>(results, 'locale')
  if (!locale) return

  const tags = [...new Set([locale.language, ...locale.languages].filter(Boolean))]
  tags.forEach((tag, index) => {
    const country = regionFromLanguageTag(tag)
    if (!country) return
    addEvidence(evidence, {
      id: `locale-${tag}`,
      source: 'locale',
      country,
      weight: index === 0 ? 0.22 : 0.06,
      confidence: index === 0 ? 0.86 : 0.68,
      detail: index === 0 ? `主语言为 ${tag}` : `备用语言列表包含 ${tag}`,
      data: { language: locale.language, languages: locale.languages },
    })
  })

  const timezone = locale.timezone
  const country = timezone ? timezoneCountries[timezone] : undefined
  if (country) {
    addEvidence(evidence, {
      id: `timezone-${timezone}`,
      source: 'timezone',
      country,
      weight: 0.25,
      confidence: 0.84,
      detail: `时区为 ${timezone}`,
      data: { timezone, offset: locale.timezoneOffsetMinutes },
    })
  }
}

function collectCalendarEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const calendar = getData<CalendarProbeData>(results, 'calendar')
  const locale = getData<LocaleProbeData>(results, 'locale')
  if (!calendar) return

  const defaultMap: Record<string, string> = {
    chinese: 'CN',
    roc: 'TW',
    japanese: 'JP',
    buddhist: 'TH',
    persian: 'IR',
    hebrew: 'IL',
    indian: 'IN',
  }

  const defaultCountry = calendar.defaultCalendar ? defaultMap[calendar.defaultCalendar] : undefined
  if (defaultCountry) {
    addEvidence(evidence, {
      id: `calendar-default-${calendar.defaultCalendar}`,
      source: 'calendar',
      country: defaultCountry,
      weight: 0.22,
      confidence: 0.84,
      detail: `Intl 默认日历系统为 ${calendar.defaultCalendar}`,
      data: { defaultLocale: calendar.defaultLocale, defaultCalendar: calendar.defaultCalendar },
    })
  }

  const languages = locale ? [locale.language, ...locale.languages] : []
  const hasZhCn = languages.some((tag) => tag && ['CN'].includes(regionFromLanguageTag(tag) ?? ''))
  const hasZhTw = languages.some((tag) => tag && ['TW', 'HK', 'MO'].includes(regionFromLanguageTag(tag) ?? ''))
  const chinese = calendar.samples.find((item) => item.id === 'zh-cn-chinese')
  const roc = calendar.samples.find((item) => item.id === 'zh-tw-roc')

  if (chinese?.supported && hasZhCn) {
    addEvidence(evidence, {
      id: 'calendar-chinese-with-zh-cn',
      source: 'calendar',
      country: 'CN',
      weight: 0.08,
      confidence: 0.5,
      detail: 'Intl 支持农历计算，且语言环境偏向 zh-CN/zh-Hans',
      data: { sample: chinese, languages },
    })
  }

  if (roc?.supported && hasZhTw) {
    addEvidence(evidence, {
      id: 'calendar-roc-with-zh-tw',
      source: 'calendar',
      country: 'TW',
      weight: 0.08,
      confidence: 0.52,
      detail: 'Intl 支持民国纪年，且语言环境偏向 zh-TW/zh-Hant',
      data: { sample: roc, languages },
    })
  }
}

function collectEmojiEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const emoji = getData<EmojiProbeData>(results, 'emoji')
  if (!emoji?.specialRegionFlagAnomaly) return

  addEvidence(evidence, {
      id: 'emoji-special-region-flag-anomaly',
      source: 'emoji',
      country: 'CN',
      weight: 0.1,
      confidence: 0.58,
    detail: `特殊地区旗帜 Emoji 相对参考旗帜渲染异常，宽度比 ${emoji.specialRegionWidthRatio ?? '—'}、墨迹比 ${emoji.specialRegionInkRatio ?? '—'}`,
    data: { specialRegionWidthRatio: emoji.specialRegionWidthRatio, specialRegionInkRatio: emoji.specialRegionInkRatio, samples: emoji.samples },
  })
}

function collectFontEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const fonts = getData<FontProbeData>(results, 'fonts')
  if (!fonts) return

  const mainlandCount = fonts.groups.mainland?.length ?? 0
  if (mainlandCount >= 2) {
    addEvidence(evidence, {
      id: 'fonts-mainland',
      source: 'fonts',
      country: 'CN',
      weight: Math.min(0.14, 0.06 + mainlandCount * 0.01),
      confidence: Math.min(0.76, 0.48 + mainlandCount * 0.04),
      detail: `检测到 ${mainlandCount} 个简体中文/大陆常见字体`,
      data: { fonts: fonts.groups.mainland },
    })
  }

  const traditionalCount = fonts.groups.traditional?.length ?? 0
  if (traditionalCount >= 2) {
    addEvidence(evidence, {
      id: 'fonts-traditional',
      source: 'fonts',
      country: 'TW',
      weight: Math.min(0.14, 0.06 + traditionalCount * 0.01),
      confidence: Math.min(0.74, 0.48 + traditionalCount * 0.04),
      detail: `检测到 ${traditionalCount} 个繁体中文地区常见字体`,
      data: { fonts: fonts.groups.traditional },
    })
  }
}

function collectIpEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const network = getData<NetworkProbeData>(results, 'network')
  if (!network) return

  const countryCounts = new Map<string, { count: number; endpoints: string[]; samples: Record<string, unknown>[] }>()
  for (const item of network.ipApis) {
    if (!item.ok) continue
    const country = normalizeCountryCode(item.data?.country)
    if (!country) continue
    const current = countryCounts.get(country) ?? { count: 0, endpoints: [], samples: [] }
    current.count += 1
    current.endpoints.push(item.label)
    current.samples.push(item.data ?? {})
    countryCounts.set(country, current)
  }

  for (const [country, value] of countryCounts) {
    addEvidence(evidence, {
      id: `ip-${country}`,
      source: 'ip',
      country,
      weight: Math.min(0.34, 0.22 + value.count * 0.06),
      confidence: Math.min(0.92, 0.78 + value.count * 0.04),
      detail: `${value.endpoints.join('、')} 将出口 IP 归到 ${countryDisplayName(country)}`,
      data: { endpoints: value.endpoints, samples: value.samples },
    })
  }
}

function collectWebRtcEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const webrtc = getData<WebRtcProbeData>(results, 'webrtc')
  if (!webrtc) return

  const countryCounts = new Map<string, { count: number; ips: string[]; samples: Record<string, unknown>[] }>()
  for (const item of webrtc.geolocatedPublicIps) {
    if (!item.ok) continue
    const country = normalizeCountryCode(item.country)
    if (!country) continue
    const current = countryCounts.get(country) ?? { count: 0, ips: [], samples: [] }
    current.count += 1
    current.ips.push(item.ip)
    current.samples.push(item as unknown as Record<string, unknown>)
    countryCounts.set(country, current)
  }

  for (const [country, value] of countryCounts) {
    addEvidence(evidence, {
      id: `webrtc-${country}`,
      source: 'webrtc',
      country,
      weight: Math.min(0.3, 0.2 + value.count * 0.05),
      confidence: Math.min(0.88, 0.74 + value.count * 0.05),
      detail: `WebRTC/STUN 公网候选 ${value.ips.join('、')} 归到 ${countryDisplayName(country)}`,
      data: { ips: value.ips, samples: value.samples, mode: webrtc.mode },
    })
  }
}

function collectReachabilityEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const network = getData<NetworkProbeData>(results, 'network')
  if (!network) return

  if (network.summary.networkAttribution?.length) {
    for (const item of network.summary.networkAttribution) {
      if (item.score < 35) continue
      const isCn = item.country === 'CN'
      addEvidence(evidence, {
      id: `reachability-score-${item.country}`,
      source: 'reachability',
      country: item.country,
      weight: isCn ? Math.min(0.24, 0.06 + item.score / 520) : Math.min(0.14, 0.04 + item.score / 1000),
        confidence: item.confidence,
        detail: `连通性矩阵对${countryDisplayName(item.country)}的网络环境分为 ${item.score}/100：${item.reasons.join('；')}`,
        data: { networkAttribution: item, profiles: network.summary.reachabilityProfiles },
      })
    }
    return
  }

  for (const [category, country] of Object.entries(reachabilityRegionCountries)) {
    const success = network.reachability.filter((item) => item.category === category && item.ok)
    const total = network.reachability.filter((item) => item.category === category).length
    if (total < 3 || success.length / total < 0.9) continue
    addEvidence(evidence, {
      id: `reachability-${category}`,
      source: 'reachability',
      country,
      weight: 0.08,
      confidence: 0.48,
      detail: `${countryDisplayName(country)}强地域站点连通成功率 ${success.length}/${total}`,
      data: { success, total },
    })
  }
}

function collectHistoryEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const history = getData<HistoryProbeData>(results, 'history')
  if (!history?.enabled || history.warmHints.length < 2) return

  addEvidence(evidence, {
    id: 'history-cn-specific-warm',
    source: 'history',
    country: 'CN',
    weight: Math.min(0.13, 0.07 + history.warmHints.length * 0.015),
    confidence: Math.min(0.62, 0.46 + history.warmHints.length * 0.04),
    detail: `${history.warmHints.join('、')} 等大陆强地域站点存在 DNS/连接/缓存预热迹象`,
    data: { warmHints: history.warmHints, targets: history.targets },
  })
}

function collectKeyboardEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const keyboard = getData<KeyboardProbeData>(results, 'keyboard')
  if (!keyboard) return

  const top = keyboard.inferredLayouts.find((item) => item.country && item.geoWeight >= 0.1 && item.confidence >= 0.5)
  if (!top?.country) return

  addEvidence(evidence, {
    id: `keyboard-${top.id}`,
    source: 'keyboard',
    country: top.country,
    weight: Math.min(0.14, top.geoWeight),
    confidence: Math.min(0.82, 0.42 + top.confidence * 0.42),
    detail: `键盘布局与${top.label}匹配度约 ${Math.round(top.confidence * 100)}%`,
    data: { inference: top, sampledLayout: keyboard.sampledLayout },
  })
}

function collectSpeechEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const speech = getData<SpeechProbeData>(results, 'speech')
  if (!speech) return

  for (const item of speech.countrySignals.slice(0, 4)) {
    const country = normalizeCountryCode(item.country)
    if (!country) continue
    if (item.confidence < 0.5 || (item.localCount === 0 && item.defaultCount === 0)) continue
    addEvidence(evidence, {
      id: `speech-${country}`,
      source: 'speech',
      country,
      weight: Math.min(0.13, 0.05 + item.localCount * 0.012 + item.defaultCount * 0.04),
      confidence: item.confidence,
      detail: `${item.localCount} 个本地语音、${item.defaultCount} 个默认语音使用 ${item.languages.join('、')}`,
      data: { countrySignal: item },
    })
  }
}

function collectTlsEvidence(results: ProbeResult[], evidence: CountryEvidence[]) {
  const tls = getData<TlsProbeData>(results, 'tls')
  if (!tls) return

  const domesticHints = [
    ...new Set([
      ...tls.localDomesticBrowserHints,
      ...tls.observations.flatMap((item) => item.domesticBrowserHints),
    ]),
  ]
  const guomiSources = tls.observations.filter((item) => item.guomiHint).map((item) => item.label)

  if (domesticHints.length > 0) {
    addEvidence(evidence, {
      id: 'tls-domestic-browser-stack',
      source: 'tls',
      country: 'CN',
      weight: 0.2,
      confidence: 0.72,
      detail: `浏览器栈包含国内浏览器特征：${domesticHints.join('、')}`,
      data: { domesticHints, observations: tls.observations },
    })
  }

  if (guomiSources.length > 0) {
    addEvidence(evidence, {
      id: 'tls-guomi',
      source: 'tls',
      country: 'CN',
      weight: 0.24,
      confidence: 0.86,
      detail: `TLS 摘要中出现 SM2/SM3/SM4/GMTLS 等国密相关特征`,
      data: { guomiSources, observations: tls.observations },
    })
  }
}

function topCountryBySource(evidence: CountryEvidence[], source: AttributionSource): CountryAttribution | undefined {
  const sourceEvidence = evidence.filter((item) => item.source === source)
  return scoreCountries(sourceEvidence)[0]
}

function topEvidenceBySource(evidence: CountryEvidence[], source: AttributionSource): CountryEvidence | undefined {
  return evidence
    .filter((item) => item.source === source)
    .sort((a, b) => b.weight * b.confidence - a.weight * a.confidence)[0]
}

function scoreCountries(evidence: CountryEvidence[]): CountryAttribution[] {
  const grouped = new Map<string, CountryEvidence[]>()
  for (const item of evidence) {
    const current = grouped.get(item.country) ?? []
    current.push(item)
    grouped.set(item.country, current)
  }

  return [...grouped.entries()]
    .map(([country, items]) => {
      const sourceContrib = new Map<AttributionSource, number>()
      for (const source of Object.keys(sourceCaps) as AttributionSource[]) {
        const values = items.filter((item) => item.source === source).map((item) => item.weight * item.confidence)
        if (values.length > 0) sourceContrib.set(source, combineCapped(values, sourceCaps[source]))
      }

      const familyContrib = new Map<EvidenceFamily, number>()
      for (const family of Object.keys(familyCaps) as EvidenceFamily[]) {
        const values = [...sourceContrib.entries()]
          .filter(([source]) => sourceFamilies[source] === family)
          .map(([, value]) => value)
        familyContrib.set(family, combineCapped(values, familyCaps[family]))
      }

      const activeFamilies = [...familyContrib.entries()].filter(([, value]) => value >= 0.08)
      const sourceDiversity = [...sourceContrib.values()].filter((value) => value >= 0.045).length
      const hasNetwork = (familyContrib.get('network') ?? 0) >= 0.12
      const hasLocalization = (familyContrib.get('localization') ?? 0) >= 0.12
      const hasSystem = (familyContrib.get('system') ?? 0) >= 0.08
      const coherenceBonus =
        (hasNetwork && hasLocalization ? 0.08 : 0) +
        (hasNetwork && hasSystem ? 0.04 : 0) +
        (hasLocalization && hasSystem ? 0.035 : 0) +
        Math.min(0.045, Math.max(0, sourceDiversity - 2) * 0.015)

      const score = Math.min(
        0.99,
        [...familyContrib.values()].reduce((sum, value) => sum + value, 0) + coherenceBonus,
      )

      return {
        country,
        label: countryDisplayName(country),
        confidence: Math.min(99, Math.round(score * 100)),
        score,
        evidence: [...items].sort((a, b) => b.weight * b.confidence - a.weight * a.confidence),
      }
    })
    .sort((a, b) => b.score - a.score)
}

function assessSpoofing(evidence: CountryEvidence[], topCountries: CountryAttribution[], results: ProbeResult[]): SpoofingAssessment {
  if (evidence.length === 0 || topCountries.length === 0) {
    return { score: 0, level: 'info', summary: '证据不足，无法判断是否存在国籍/地区伪装。', conflicts: [] }
  }

  const conflicts: string[] = []
  let conflictStrength = 0
  const sourceItems = Object.fromEntries(
    (['ip', 'webrtc', 'reachability', 'locale', 'timezone', 'calendar', 'emoji', 'fonts', 'keyboard', 'speech', 'tls', 'history'] as AttributionSource[]).map(
      (source) => [source, topEvidenceBySource(evidence, source)],
    ),
  ) as Partial<Record<AttributionSource, CountryEvidence>>

  const addConflict = (a: AttributionSource, b: AttributionSource, text: string, multiplier = 1) => {
    const left = sourceItems[a]
    const right = sourceItems[b]
    if (!left || !right || left.country === right.country) return
    const strength = Math.sqrt(left.weight * left.confidence * right.weight * right.confidence) * multiplier
    if (strength < 0.055) return
    conflicts.push(text)
    conflictStrength += strength
  }

  addConflict('ip', 'locale', `出口 IP 指向${sourceItems.ip?.label}，语言/地区设置指向${sourceItems.locale?.label}`, 1.15)
  addConflict('ip', 'timezone', `出口 IP 指向${sourceItems.ip?.label}，时区指向${sourceItems.timezone?.label}`, 1.2)
  addConflict('ip', 'webrtc', `HTTPS 出口 IP 指向${sourceItems.ip?.label}，WebRTC/STUN 公网候选指向${sourceItems.webrtc?.label}`, 1.35)
  addConflict('ip', 'reachability', `出口 IP 指向${sourceItems.ip?.label}，连通性矩阵更像${sourceItems.reachability?.label}网络环境`, 1.15)
  addConflict('webrtc', 'timezone', `WebRTC/STUN 公网候选指向${sourceItems.webrtc?.label}，时区指向${sourceItems.timezone?.label}`, 1)
  addConflict('locale', 'timezone', `语言/地区设置指向${sourceItems.locale?.label}，时区指向${sourceItems.timezone?.label}`, 0.85)
  addConflict('calendar', 'locale', `日历系统偏向${sourceItems.calendar?.label}，语言/地区设置指向${sourceItems.locale?.label}`, 0.65)
  addConflict('emoji', 'locale', `Emoji 区域化渲染偏向${sourceItems.emoji?.label}，语言/地区设置指向${sourceItems.locale?.label}`, 0.6)
  addConflict('fonts', 'locale', `字体集合偏向${sourceItems.fonts?.label}，语言/地区设置指向${sourceItems.locale?.label}`, 0.7)
  addConflict('keyboard', 'locale', `键盘布局偏向${sourceItems.keyboard?.label}，语言/地区设置指向${sourceItems.locale?.label}`, 0.65)
  addConflict('speech', 'locale', `语音包偏向${sourceItems.speech?.label}，语言/地区设置指向${sourceItems.locale?.label}`, 0.65)
  addConflict('tls', 'locale', `TLS/浏览器栈偏向${sourceItems.tls?.label}，语言/地区设置指向${sourceItems.locale?.label}`, 0.9)
  addConflict('history', 'ip', `地域缓存/DNS 迹象偏向${sourceItems.history?.label}，出口 IP 指向${sourceItems.ip?.label}`, 0.55)

  const network = getData<NetworkProbeData>(results, 'network')
  const matrixProxyScore = network?.summary.proxyPattern.score ?? 0
  if (network?.summary.proxyPattern.reasons.length) {
    conflicts.push(...network.summary.proxyPattern.reasons)
  }

  const totalScore = topCountries.reduce((sum, item) => sum + item.score, 0)
  const topScore = topCountries[0]?.score ?? 0
  const runnerUpScore = topCountries[1]?.score ?? 0
  const ambiguityRatio = totalScore > 0 ? runnerUpScore / Math.max(topScore, 0.001) : 0
  const ambiguityScore = ambiguityRatio >= 0.78 && runnerUpScore >= 0.2 ? Math.min(16, ambiguityRatio * 13) : 0
  const conflictScore = Math.min(68, conflictStrength * 170)
  const lowConfidencePenalty = topScore < 0.28 ? -10 : topScore < 0.4 ? -4 : 0
  const score = Math.max(0, Math.min(100, Math.round(conflictScore + ambiguityScore + matrixProxyScore * 0.5 + lowConfidencePenalty)))
  const level = confidenceToLevel(score)

  let summary = '各主要归因信号基本一致，伪装/不一致概率较低。'
  if (score >= 75) summary = '国籍/地区归因信号严重冲突，很像经过代理、环境伪装或跨地区环境拼接。'
  else if (score >= 50) summary = '国籍/地区归因信号存在明显冲突，外部观察者可能认为环境被伪装。'
  else if (score >= 25) summary = '存在一些归因不一致，但不足以单独判断为伪装。'

  return { score, level, summary, conflicts }
}

export function summarizeIdentityAttribution(results: ProbeResult[]): IdentityAttributionSummary {
  const evidence: CountryEvidence[] = []
  collectLocaleEvidence(results, evidence)
  collectCalendarEvidence(results, evidence)
  collectEmojiEvidence(results, evidence)
  collectFontEvidence(results, evidence)
  collectIpEvidence(results, evidence)
  collectWebRtcEvidence(results, evidence)
  collectReachabilityEvidence(results, evidence)
  collectHistoryEvidence(results, evidence)
  collectKeyboardEvidence(results, evidence)
  collectSpeechEvidence(results, evidence)
  collectTlsEvidence(results, evidence)

  const topCountries = scoreCountries(evidence)
  const spoofing = assessSpoofing(evidence, topCountries, results)
  return { topCountries, evidence, spoofing }
}
