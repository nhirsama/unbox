import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, isLikelyChinaLocale, isLikelyTraditionalLocale, signal } from './utils'

export interface CalendarSample {
  id: string
  locale: string
  calendar: string
  country: string
  formatted?: string
  resolvedCalendar?: string
  supported: boolean
  error?: string
}

export interface CalendarProbeData {
  defaultLocale?: string
  defaultCalendar?: string
  supportedCalendars: string[]
  samples: CalendarSample[]
}

const regionalCalendars = ['chinese', 'roc', 'japanese', 'buddhist', 'persian', 'islamic', 'islamic-umalqura', 'hebrew', 'indian']

const sampleLocales = [
  { id: 'zh-cn-chinese', locale: 'zh-CN-u-ca-chinese', calendar: 'chinese', country: 'CN' },
  { id: 'zh-tw-roc', locale: 'zh-TW-u-ca-roc', calendar: 'roc', country: 'TW' },
  { id: 'ja-jp-japanese', locale: 'ja-JP-u-ca-japanese', calendar: 'japanese', country: 'JP' },
  { id: 'th-th-buddhist', locale: 'th-TH-u-ca-buddhist', calendar: 'buddhist', country: 'TH' },
]

function supportedValuesOfCalendar() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('calendar')
  } catch {
    // ignore
  }
  return []
}

function formatCalendarSample(item: (typeof sampleLocales)[number]): CalendarSample {
  try {
    const formatter = new Intl.DateTimeFormat(item.locale, {
      dateStyle: 'full',
      timeZone: 'UTC',
    })
    return {
      ...item,
      formatted: formatter.format(new Date('2026-02-17T00:00:00Z')),
      resolvedCalendar: formatter.resolvedOptions().calendar,
      supported: formatter.resolvedOptions().calendar === item.calendar,
    }
  } catch (error) {
    return { ...item, supported: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export const calendarProbe: ProbeDefinition<CalendarProbeData> = {
  id: 'calendar',
  name: '日历系统归因',
  description: '检测 Intl 是否默认或显式支持农历、民国纪年、日本年号、佛历等具有地区差异的日历系统。',
  run: () =>
    createProbeResult<CalendarProbeData>(calendarProbe, () => {
      const resolved = new Intl.DateTimeFormat().resolvedOptions()
      const supportedCalendars = supportedValuesOfCalendar().filter((item) => regionalCalendars.includes(item))
      const samples = sampleLocales.map(formatCalendarSample)
      const language = navigator.language
      const languages = navigator.languages ? [...navigator.languages] : []
      const signals: ProbeSignal[] = []

      if (resolved.calendar && resolved.calendar !== 'gregory') {
        signals.push(
          signal(
            'default-regional-calendar',
            'region',
            'high',
            `默认日历系统为 ${resolved.calendar}`,
            `Intl 默认日历不是 gregory，而是 ${resolved.calendar}；这通常是强地区/系统配置证据。`,
            0.82,
            { resolved },
          ),
        )
      }

      const chinese = samples.find((item) => item.id === 'zh-cn-chinese')
      if (chinese?.supported && isLikelyChinaLocale(language, languages)) {
        signals.push(
          signal(
            'chinese-calendar-with-zh-cn',
            'region',
            'low',
            '农历计算与简体中文环境同时存在',
            '系统 Intl 支持 Chinese Calendar，且浏览器语言偏向 zh-CN/zh-Hans；单独支持农历不罕见，因此仅作为低权重增强证据。',
            0.5,
            { sample: chinese, language, languages },
          ),
        )
      }

      const roc = samples.find((item) => item.id === 'zh-tw-roc')
      if (roc?.supported && isLikelyTraditionalLocale(language, languages)) {
        signals.push(
          signal(
            'roc-calendar-with-zh-tw',
            'region',
            'low',
            '民国纪年与繁体中文环境同时存在',
            '系统 Intl 支持 ROC Calendar，且浏览器语言偏向 zh-TW/zh-Hant；可作为台湾地区环境的低权重增强证据。',
            0.52,
            { sample: roc, language, languages },
          ),
        )
      }

      return { data: { defaultLocale: resolved.locale, defaultCalendar: resolved.calendar, supportedCalendars, samples }, signals }
    }),
}
