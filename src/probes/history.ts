import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, signal } from './utils'

export interface HistoryTargetResult {
  id: string
  label: string
  url: string
  category: 'cn-specific'
  firstOk: boolean
  secondOk: boolean
  firstMs: number
  secondMs: number
  warmHint: boolean
  error?: string
}

export interface HistoryProbeData {
  enabled: boolean
  targets: HistoryTargetResult[]
  warmHints: string[]
}

const cnSpecificTargets = [
  { id: 'xuexi', label: '学习强国', url: 'https://www.xuexi.cn/favicon.ico', category: 'cn-specific' as const },
  { id: '12306', label: '12306', url: 'https://www.12306.cn/favicon.ico', category: 'cn-specific' as const },
  { id: 'chsi', label: '学信网', url: 'https://www.chsi.com.cn/favicon.ico', category: 'cn-specific' as const },
  { id: 'gov-cn', label: '中国政府网', url: 'https://www.gov.cn/favicon.ico', category: 'cn-specific' as const },
  { id: 'people', label: '人民网', url: 'https://www.people.com.cn/favicon.ico', category: 'cn-specific' as const },
]

async function timedImageLoad(url: string) {
  const start = performance.now()
  return new Promise<{ ok: boolean; ms: number; error?: string }>((resolve) => {
    const img = new Image()
    let settled = false
    const timer = window.setTimeout(() => finish(false, 'TimeoutError: image load timed out'), 4500)
    const finish = (ok: boolean, error?: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
      img.src = ''
      resolve({ ok, ms: Math.round(performance.now() - start), error })
    }
    img.decoding = 'async'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => finish(true)
    img.onerror = () => finish(false, 'ImageError: resource failed to load or decode')
    const separator = url.includes('?') ? '&' : '?'
    img.src = `${url}${separator}__warm_probe=${Date.now()}-${Math.random().toString(36).slice(2)}`
  })
}

async function probeTarget(target: (typeof cnSpecificTargets)[number]): Promise<HistoryTargetResult> {
  const first = await timedImageLoad(target.url)
  await new Promise((resolve) => window.setTimeout(resolve, 80))
  const second = await timedImageLoad(target.url)
  const warmHint = Boolean(
    first.ok &&
      second.ok &&
      first.ms > 0 &&
      second.ms > 0 &&
      ((first.ms <= 160 && second.ms <= 140) || (first.ms <= 260 && first.ms / Math.max(second.ms, 1) < 1.35)),
  )

  return {
    ...target,
    firstOk: first.ok,
    secondOk: second.ok,
    firstMs: first.ms,
    secondMs: second.ms,
    warmHint,
    error: first.error || second.error,
  }
}

export const historyProbe: ProbeDefinition<HistoryProbeData> = {
  id: 'history',
  name: '地域站点缓存/DNS 预热',
  description: '扩展模式下对大陆强地域站点图片资源做两次加载计时，寻找 DNS/连接/缓存预热迹象。',
  run: (context) =>
    createProbeResult<HistoryProbeData>(historyProbe, async () => {
      if (!context.includeSensitiveMatrix) return { data: { enabled: false, targets: [], warmHints: [] }, signals: [] }

      const targets = await Promise.all(cnSpecificTargets.map(probeTarget))
      const warmHints = targets.filter((item) => item.warmHint).map((item) => item.label)
      const signals: ProbeSignal[] = []

      if (warmHints.length >= 2) {
        signals.push(
          signal(
            'cn-specific-sites-warm',
            'region',
            'low',
            '大陆强地域站点存在预热迹象',
            `${warmHints.join('、')} 的 DNS/连接/缓存计时表现偏热，可作为中国大陆环境或访问历史的低权重辅助证据。`,
            0.54,
            { warmHints, targets },
          ),
        )
      }

      return { data: { enabled: true, targets, warmHints }, signals }
    }),
}
