import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, signal, withTimeout } from './utils'

export interface TlsObservation {
  id: string
  label: string
  url: string
  ok: boolean
  ja3?: string
  ja3Hash?: string
  ja4?: string
  httpVersion?: string
  alpn?: string
  guomiHint: boolean
  domesticBrowserHints: string[]
  error?: string
}

export interface TlsProbeData {
  localDomesticBrowserHints: string[]
  observations: TlsObservation[]
}

const endpoints = [
  { id: 'peet', label: 'tls.peet.ws', url: 'https://tls.peet.ws/api/all' },
  { id: 'browserleaks', label: 'BrowserLeaks TLS', url: 'https://tls.browserleaks.com/json' },
]

const domesticBrowserPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: '360 浏览器', pattern: /QihooBrowser|360SE|360EE|QIHU|QHBrowser/i },
  { label: 'QQ 浏览器', pattern: /QQBrowser|MQQBrowser|TencentTraveler/i },
  { label: '搜狗浏览器', pattern: /MetaSr|SogouMobileBrowser|Sogou/i },
  { label: 'UC 浏览器', pattern: /UCBrowser|UCWEB/i },
  { label: '夸克浏览器', pattern: /Quark/i },
  { label: '华为浏览器', pattern: /HuaweiBrowser/i },
  { label: '小米浏览器', pattern: /MiuiBrowser/i },
  { label: 'OPPO/一加浏览器', pattern: /HeyTapBrowser|OppoBrowser|OnePlusBrowser/i },
  { label: 'vivo 浏览器', pattern: /VivoBrowser/i },
  { label: '2345 浏览器', pattern: /2345Explorer|Mb2345Browser/i },
  { label: '猎豹浏览器', pattern: /LBBROWSER|LieBaoFast/i },
  { label: '百度浏览器', pattern: /BIDUBrowser|baidubrowser/i },
]

function domesticBrowserHints(text: unknown) {
  if (typeof text !== 'string') return []
  return domesticBrowserPatterns.filter((item) => item.pattern.test(text)).map((item) => item.label)
}

function hasGuomiHint(value: unknown): boolean {
  const text = JSON.stringify(value ?? '')
  return /SM2|SM3|SM4|GMTLS|GMSSL|国密|ECC_SM4|ECDHE_SM4/i.test(text)
}

function getNested(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function normalizeObservation(endpoint: (typeof endpoints)[number], data: unknown): TlsObservation {
  const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  const tls = typeof obj.tls === 'object' && obj.tls !== null ? (obj.tls as Record<string, unknown>) : {}
  const userAgent = obj.user_agent ?? obj.userAgent ?? getNested(obj, ['http', 'user_agent'])
  const ja3 = tls.ja3 ?? obj.ja3 ?? obj.ja3_text ?? obj.ja3Text
  const ja3Hash = tls.ja3_hash ?? obj.ja3_hash ?? obj.ja3Hash
  const ja4 = tls.ja4 ?? obj.ja4
  const httpVersion = obj.http_version ?? obj.httpVersion
  const alpn = tls.alpn ?? obj.alpn

  return {
    id: endpoint.id,
    label: endpoint.label,
    url: endpoint.url,
    ok: true,
    ja3: typeof ja3 === 'string' ? ja3 : undefined,
    ja3Hash: typeof ja3Hash === 'string' ? ja3Hash : undefined,
    ja4: typeof ja4 === 'string' ? ja4 : undefined,
    httpVersion: typeof httpVersion === 'string' ? httpVersion : undefined,
    alpn: typeof alpn === 'string' ? alpn : undefined,
    guomiHint: hasGuomiHint(data),
    domesticBrowserHints: domesticBrowserHints(userAgent),
  }
}

async function fetchTlsEndpoint(endpoint: (typeof endpoints)[number]): Promise<TlsObservation> {
  try {
    const data = await withTimeout(async (abortSignal) => {
      const response = await fetch(endpoint.url, {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: abortSignal,
        headers: { Accept: 'application/json,text/plain,*/*' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as unknown
    }, 7500)
    return normalizeObservation(endpoint, data)
  } catch (error) {
    return {
      id: endpoint.id,
      label: endpoint.label,
      url: endpoint.url,
      ok: false,
      guomiHint: false,
      domesticBrowserHints: [],
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

export const tlsProbe: ProbeDefinition<TlsProbeData> = {
  id: 'tls',
  name: 'TLS/浏览器栈归因',
  description: '通过公开 HTTPS TLS 回显端点观察 JA3/JA4 摘要、国密套件迹象和国内浏览器栈特征。',
  run: () =>
    createProbeResult<TlsProbeData>(tlsProbe, async () => {
      const localDomesticBrowserHints = domesticBrowserHints(navigator.userAgent)
      const observations = await Promise.all(endpoints.map(fetchTlsEndpoint))
      const signals: ProbeSignal[] = []
      const endpointDomesticHints = [...new Set(observations.flatMap((item) => item.domesticBrowserHints))]
      const guomiSources = observations.filter((item) => item.guomiHint).map((item) => item.label)

      if (localDomesticBrowserHints.length > 0 || endpointDomesticHints.length > 0) {
        const hints = [...new Set([...localDomesticBrowserHints, ...endpointDomesticHints])]
        signals.push(
          signal(
            'domestic-browser-stack',
            'region',
            'medium',
            '浏览器栈包含国内浏览器特征',
            `检测到 ${hints.join('、')} 特征；这类浏览器/魔改 Chromium 在中国大陆用户中更常见。`,
            0.72,
            { hints },
          ),
        )
      }

      if (guomiSources.length > 0) {
        signals.push(
          signal(
            'guomi-tls-hint',
            'region',
            'high',
            'TLS 指纹包含国密套件迹象',
            `${guomiSources.join('、')} 返回的 TLS 摘要中出现 SM2/SM3/SM4/GMTLS 等国密相关特征。`,
            0.86,
            { sources: guomiSources },
          ),
        )
      }

      return { data: { localDomesticBrowserHints, observations }, signals }
    }),
}
