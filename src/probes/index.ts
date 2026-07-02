import type { ProbeContext, ProbeDefinition, ProbeResult, ScoreBucket, SignalCategory } from '../types'
import { calendarProbe } from './calendar'
import { emojiProbe } from './emoji'
import { fontProbe } from './fonts'
import { historyProbe } from './history'
import { keyboardProbe } from './keyboard'
import { localeProbe } from './locale'
import { networkProbe } from './network'
import { speechProbe } from './speech'
import { tlsProbe } from './tls'
import { webrtcProbe } from './webrtc'
import { numberToRisk, riskToNumber } from './utils'

export const probeDefinitions: ProbeDefinition[] = [
  localeProbe,
  calendarProbe,
  emojiProbe,
  keyboardProbe,
  speechProbe,
  fontProbe,
  tlsProbe,
  historyProbe,
  webrtcProbe,
  networkProbe,
]

export async function runAllProbes(
  context: ProbeContext,
  onResult?: (result: ProbeResult) => void,
): Promise<ProbeResult[]> {
  const nonNetwork = probeDefinitions.filter((probe) => probe.id !== 'network')
  const network = probeDefinitions.find((probe) => probe.id === 'network')
  const results: ProbeResult[] = []

  const parallel = await Promise.all(
    nonNetwork.map(async (probe) => {
      const result = await probe.run(context)
      onResult?.(result)
      return result
    }),
  )
  results.push(...parallel)

  if (network) {
    const result = await network.run(context)
    results.push(result)
    onResult?.(result)
  }

  return results
}

const categoryLabels: Record<SignalCategory, string> = {
  region: '国籍/地区归因',
  network: '网络归因/限制特征',
  consistency: '伪装/一致性冲突',
}

export function summarizeScores(results: ProbeResult[]): ScoreBucket[] {
  const grouped = new Map<SignalCategory, ScoreBucket>()
  for (const result of results) {
    for (const probeSignal of result.signals) {
      const current = grouped.get(probeSignal.category) ?? {
        category: probeSignal.category,
        label: categoryLabels[probeSignal.category],
        score: 0,
        level: 'info' as const,
        signals: [],
      }
      current.signals.push(probeSignal)
      grouped.set(probeSignal.category, current)
    }
  }

  return [...grouped.values()]
    .map((bucket) => {
      if (bucket.signals.length === 0) return bucket
      const weighted = bucket.signals.reduce((sum, item) => sum + riskToNumber(item.level) * item.confidence, 0)
      const confidence = bucket.signals.reduce((sum, item) => sum + item.confidence, 0) || 1
      const densityBonus = Math.min(18, bucket.signals.length * 3)
      const score = Math.min(100, Math.round(weighted / confidence + densityBonus))
      return { ...bucket, score, level: numberToRisk(score) }
    })
    .sort((a, b) => b.score - a.score)
}

export function flattenSignals(results: ProbeResult[]) {
  return results.flatMap((result) => result.signals.map((item) => ({ ...item, probeId: result.id, probeName: result.name })))
}
