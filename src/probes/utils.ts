import type { ProbeResult, ProbeSignal, RiskLevel, SignalCategory } from '../types'

export function nowIso(): string {
  return new Date().toISOString()
}

export async function measure<T>(fn: () => Promise<T> | T) {
  const startedAt = nowIso()
  const start = performance.now()
  try {
    const value = await fn()
    return {
      value,
      startedAt,
      finishedAt: nowIso(),
      durationMs: Math.round(performance.now() - start),
    }
  } catch (error) {
    return {
      error: normalizeError(error),
      startedAt,
      finishedAt: nowIso(),
      durationMs: Math.round(performance.now() - start),
    }
  }
}

export async function createProbeResult<T>(
  meta: { id: string; name: string; description: string },
  fn: () => Promise<{ data?: T; signals?: ProbeSignal[]; unsupported?: boolean }> | { data?: T; signals?: ProbeSignal[]; unsupported?: boolean },
): Promise<ProbeResult<T>> {
  const measured = await measure(fn)
  if ('error' in measured) {
    return {
      ...meta,
      status: 'error',
      startedAt: measured.startedAt,
      finishedAt: measured.finishedAt,
      durationMs: measured.durationMs,
      signals: [],
      error: measured.error,
    }
  }

  return {
    ...meta,
    status: measured.value.unsupported ? 'unsupported' : 'success',
    startedAt: measured.startedAt,
    finishedAt: measured.finishedAt,
    durationMs: measured.durationMs,
    data: measured.value.data,
    signals: measured.value.signals ?? [],
  }
}

export function signal(
  id: string,
  category: SignalCategory,
  level: RiskLevel,
  title: string,
  summary: string,
  confidence: number,
  evidence?: Record<string, unknown>,
): ProbeSignal {
  return { id, category, level, title, summary, confidence, evidence }
}

export function normalizeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

export function withTimeout<T>(promiseFactory: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  return promiseFactory(controller.signal).finally(() => window.clearTimeout(timer))
}

export function safeJson(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(safeJson)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === 'function') continue
      out[key] = safeJson(val)
    }
    return out
  }
  return String(value)
}

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  const sort = (input: unknown): unknown => {
    if (!input || typeof input !== 'object') return input
    if (seen.has(input as object)) return '[Circular]'
    seen.add(input as object)
    if (Array.isArray(input)) return input.map(sort)
    return Object.keys(input as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sort((input as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return JSON.stringify(sort(value))
}

export async function sha256(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function toShortHash(hash: string, length = 16): string {
  return hash.slice(0, length)
}

export function isLikelyChinaLocale(language?: string, languages: string[] = []): boolean {
  const all = [language, ...languages].filter(Boolean).map((x) => x!.toLowerCase())
  return all.some((x) => x === 'zh-cn' || x === 'zh-hans' || x.startsWith('zh-hans-') || x.includes('-cn'))
}

export function isLikelyTraditionalLocale(language?: string, languages: string[] = []): boolean {
  const all = [language, ...languages].filter(Boolean).map((x) => x!.toLowerCase())
  return all.some((x) => x.includes('zh-tw') || x.includes('zh-hk') || x.includes('zh-mo') || x.includes('zh-hant'))
}

export function riskToNumber(level: RiskLevel): number {
  switch (level) {
    case 'high':
      return 90
    case 'medium':
      return 65
    case 'low':
      return 35
    case 'info':
    default:
      return 15
  }
}

export function numberToRisk(score: number): RiskLevel {
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  if (score >= 25) return 'low'
  return 'info'
}
