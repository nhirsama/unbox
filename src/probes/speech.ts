import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, signal } from './utils'

export interface SpeechVoiceInfo {
  name: string
  lang: string
  default: boolean
  localService: boolean
  voiceURI: string
}

export interface SpeechCountrySignal {
  country: string
  languages: string[]
  count: number
  localCount: number
  defaultCount: number
  confidence: number
  voiceNames: string[]
}

export interface SpeechProbeData {
  supported: boolean
  voices: SpeechVoiceInfo[]
  countrySignals: SpeechCountrySignal[]
}

function countryFromLanguageTag(tag: string): string | undefined {
  try {
    const locale = new Intl.Locale(tag)
    if (locale.region) return locale.region.toUpperCase()
    if (locale.language === 'zh' && locale.script === 'Hans') return 'CN'
    if (locale.language === 'zh' && locale.script === 'Hant') return 'TW'
  } catch {
    // fall through to lightweight parsing
  }

  const lower = tag.toLowerCase()
  if (lower === 'zh-cn' || lower.startsWith('zh-hans')) return 'CN'
  if (lower.includes('zh-tw') || lower.includes('zh-hant')) return 'TW'
  if (lower.includes('zh-hk')) return 'HK'
  if (lower.includes('zh-mo')) return 'MO'

  const region = tag.split('-').slice(1).find((part) => /^[A-Za-z]{2}$/.test(part))
  return region?.toUpperCase()
}

async function loadVoices(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  const initial = speechSynthesis.getVoices()
  if (initial.length > 0) return initial

  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      speechSynthesis.removeEventListener('voiceschanged', finish)
      resolve(speechSynthesis.getVoices())
    }
    speechSynthesis.addEventListener('voiceschanged', finish)
    window.setTimeout(finish, timeoutMs)
  })
}

function summarizeCountries(voices: SpeechVoiceInfo[]): SpeechCountrySignal[] {
  const grouped = new Map<string, SpeechCountrySignal>()
  for (const voice of voices) {
    const country = countryFromLanguageTag(voice.lang)
    if (!country) continue
    const current = grouped.get(country) ?? {
      country,
      languages: [],
      count: 0,
      localCount: 0,
      defaultCount: 0,
      confidence: 0,
      voiceNames: [],
    }
    current.count += 1
    if (voice.localService) current.localCount += 1
    if (voice.default) current.defaultCount += 1
    if (!current.languages.includes(voice.lang)) current.languages.push(voice.lang)
    current.voiceNames.push(voice.name)
    grouped.set(country, current)
  }

  return [...grouped.values()]
    .map((item) => {
      const confidence = Math.min(0.82, 0.34 + item.localCount * 0.055 + item.defaultCount * 0.16 + item.count * 0.018)
      return { ...item, confidence: Math.round(confidence * 100) / 100 }
    })
    .sort((a, b) => b.confidence - a.confidence || b.localCount - a.localCount || b.count - a.count)
}

export const speechProbe: ProbeDefinition<SpeechProbeData> = {
  id: 'speech',
  name: '语音包地区归因',
  description: '读取 SpeechSynthesis 可见语音包的语言标签；本地 TTS 语音和默认语音常能反映系统语言与地区环境。',
  run: () =>
    createProbeResult<SpeechProbeData>(speechProbe, async () => {
      if (!('speechSynthesis' in window)) {
        return { unsupported: true, data: { supported: false, voices: [], countrySignals: [] } }
      }

      const voices = (await loadVoices()).map<SpeechVoiceInfo>((voice) => ({
        name: voice.name,
        lang: voice.lang,
        default: voice.default,
        localService: voice.localService,
        voiceURI: voice.voiceURI,
      }))
      const countrySignals = summarizeCountries(voices)
      const signals: ProbeSignal[] = []
      const top = countrySignals.find((item) => item.confidence >= 0.5 && (item.localCount > 0 || item.defaultCount > 0))

      if (top) {
        signals.push(
          signal(
            'speech-voice-region',
            'region',
            top.confidence >= 0.7 ? 'medium' : 'low',
            `语音合成包指向 ${top.country}`,
            `${top.localCount} 个本地语音、${top.defaultCount} 个默认语音、${top.count} 个相关语音使用 ${top.languages.join('、')}，可作为系统地区环境证据。`,
            top.confidence,
            { countrySignal: top },
          ),
        )
      }

      return { data: { supported: true, voices, countrySignals }, signals }
    }),
}
