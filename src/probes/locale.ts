import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, isLikelyChinaLocale, isLikelyTraditionalLocale, signal } from './utils'

export interface LocaleProbeData {
  language: string
  languages: string[]
  platform: string
  timezone?: string
  timezoneOffsetMinutes: number
  intl: {
    dateTime: Intl.ResolvedDateTimeFormatOptions
    number: Intl.ResolvedNumberFormatOptions
    calendarSamples: Record<string, string>
    numberSamples: Record<string, string>
    collationSamples: Record<string, string[]>
  }
}

function getSamples(locale: string | undefined) {
  const locales = [undefined, locale, 'zh-CN', 'zh-TW', 'en-US'].filter(Boolean) as string[]
  const sampleDate = new Date('2026-07-01T12:34:56Z')
  const calendarSamples: Record<string, string> = {}
  const numberSamples: Record<string, string> = {}
  const collationSamples: Record<string, string[]> = {}

  for (const loc of locales) {
    try {
      calendarSamples[loc] = new Intl.DateTimeFormat(loc, {
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(sampleDate)
    } catch {
      // ignore unsupported locale
    }

    try {
      numberSamples[loc] = new Intl.NumberFormat(loc, {
        style: 'currency',
        currency: loc.toLowerCase().includes('zh') ? 'CNY' : 'USD',
      }).format(1234567.89)
    } catch {
      // ignore unsupported locale
    }

    try {
      const words = ['中', '国', '人', '台', '灣', '汉', '漢', 'a', 'A']
      collationSamples[loc] = [...words].sort(new Intl.Collator(loc).compare)
    } catch {
      // ignore unsupported locale
    }
  }

  return { calendarSamples, numberSamples, collationSamples }
}

export const localeProbe: ProbeDefinition<LocaleProbeData> = {
  id: 'locale',
  name: '语言与地区环境',
  description: '读取浏览器语言、Intl 格式化、时区和区域设置，为国籍/地区归因提供证据。',
  run: () =>
    createProbeResult<LocaleProbeData>(localeProbe, () => {
      const dateTime = new Intl.DateTimeFormat().resolvedOptions()
      const number = new Intl.NumberFormat().resolvedOptions()
      const language = navigator.language
      const languages = navigator.languages ? [...navigator.languages] : []
      const timezoneOffsetMinutes = new Date().getTimezoneOffset()
      const samples = getSamples(language)

      const data: LocaleProbeData = {
        language,
        languages,
        platform: navigator.platform,
        timezone: dateTime.timeZone,
        timezoneOffsetMinutes,
        intl: {
          dateTime,
          number,
          ...samples,
        },
      }

      const signals: ProbeSignal[] = []

      if (dateTime.timeZone === 'Asia/Shanghai') {
        signals.push(
          signal(
            'timezone-asia-shanghai',
            'region',
            'medium',
            '时区指向 Asia/Shanghai',
            '浏览器时区显示为中国大陆常用时区；这是国籍/地区归因的强信号之一。',
            0.82,
            { timezone: dateTime.timeZone, offset: timezoneOffsetMinutes },
          ),
        )
      } else if (dateTime.timeZone?.startsWith('Asia/')) {
        signals.push(
          signal(
            'timezone-asia',
            'region',
            'low',
            '时区指向亚洲地区',
            `浏览器时区为 ${dateTime.timeZone}，可作为地区归因弱信号。`,
            0.55,
            { timezone: dateTime.timeZone, offset: timezoneOffsetMinutes },
          ),
        )
      } else if (dateTime.timeZone === 'UTC') {
        signals.push(
          signal(
            'timezone-utc',
            'consistency',
            'low',
            '时区被统一为 UTC',
            'UTC 时区可能来自时区归一化配置、远程环境或手动设置。',
            0.5,
            { timezone: dateTime.timeZone },
          ),
        )
      }

      if (isLikelyChinaLocale(language, languages)) {
        signals.push(
          signal(
            'locale-zh-cn',
            'region',
            'medium',
            '语言偏好包含简体中文/中国大陆',
            'navigator.language 或 navigator.languages 提供了 zh-CN/zh-Hans/CN 相关归因证据。',
            0.78,
            { language, languages },
          ),
        )
      }

      if (isLikelyTraditionalLocale(language, languages)) {
        signals.push(
          signal(
            'locale-zh-hant',
            'region',
            'medium',
            '语言偏好包含繁体中文地区',
            '语言列表包含 zh-TW/zh-HK/zh-Hant 等信号，可能指向繁体中文地区环境。',
            0.75,
            { language, languages },
          ),
        )
      }

      if (dateTime.locale && number.locale && dateTime.locale !== number.locale) {
        signals.push(
          signal(
            'intl-locale-mismatch',
            'consistency',
            'low',
            'Intl 子系统 locale 不一致',
            '日期和数字格式 locale 不一致，可能来自浏览器设置、系统设置或环境伪装干预。',
            0.46,
            { dateTimeLocale: dateTime.locale, numberLocale: number.locale },
          ),
        )
      }

      return { data, signals }
    }),
}
