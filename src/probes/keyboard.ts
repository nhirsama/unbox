import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, signal } from './utils'

export interface KeyboardLayoutInference {
  id: string
  label: string
  country?: string
  confidence: number
  geoWeight: number
  matches: Array<{ code: string; expected: string; actual: string }>
  misses: Array<{ code: string; expected: string; actual?: string }>
}

export interface KeyboardProbeData {
  supported: boolean
  secureContext: boolean
  sampledLayout: Record<string, string>
  inferredLayouts: KeyboardLayoutInference[]
  error?: string
}

interface KeyboardWithLayoutMap {
  getLayoutMap?: () => Promise<Map<string, string>>
}

interface LayoutRule {
  id: string
  label: string
  country?: string
  geoWeight: number
  checks: Array<{ code: string; value: string }>
  minConfidence: number
}

const sampleCodes = [
  'KeyA',
  'KeyD',
  'KeyF',
  'KeyL',
  'KeyQ',
  'KeyU',
  'KeyW',
  'KeyY',
  'KeyZ',
  'Digit1',
  'Digit2',
  'Digit3',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Comma',
  'Period',
  'Slash',
  'IntlBackslash',
  'IntlRo',
  'Lang1',
  'Lang2',
]

const layoutRules: LayoutRule[] = [
  {
    id: 'de-qwertz',
    label: '德语 QWERTZ 键盘',
    country: 'DE',
    geoWeight: 0.18,
    minConfidence: 0.58,
    checks: [
      { code: 'KeyY', value: 'z' },
      { code: 'KeyZ', value: 'y' },
      { code: 'Semicolon', value: 'ö' },
      { code: 'Quote', value: 'ä' },
      { code: 'BracketLeft', value: 'ü' },
    ],
  },
  {
    id: 'fr-azerty',
    label: '法语 AZERTY 键盘',
    country: 'FR',
    geoWeight: 0.18,
    minConfidence: 0.58,
    checks: [
      { code: 'KeyQ', value: 'a' },
      { code: 'KeyW', value: 'z' },
      { code: 'KeyA', value: 'q' },
      { code: 'Semicolon', value: 'm' },
      { code: 'Digit1', value: '&' },
    ],
  },
  {
    id: 'gb-qwerty',
    label: '英国 QWERTY 键盘',
    country: 'GB',
    geoWeight: 0.13,
    minConfidence: 0.62,
    checks: [
      { code: 'KeyQ', value: 'q' },
      { code: 'KeyW', value: 'w' },
      { code: 'Digit2', value: '"' },
      { code: 'Digit3', value: '£' },
      { code: 'Quote', value: "'" },
    ],
  },
  {
    id: 'es-qwerty',
    label: '西班牙语 QWERTY 键盘',
    country: 'ES',
    geoWeight: 0.14,
    minConfidence: 0.58,
    checks: [
      { code: 'KeyQ', value: 'q' },
      { code: 'KeyW', value: 'w' },
      { code: 'Semicolon', value: 'ñ' },
      { code: 'BracketLeft', value: '`' },
      { code: 'Quote', value: '´' },
    ],
  },
  {
    id: 'ru-jcuken',
    label: '俄语 ЙЦУКЕН 键盘',
    country: 'RU',
    geoWeight: 0.18,
    minConfidence: 0.55,
    checks: [
      { code: 'KeyF', value: 'а' },
      { code: 'KeyD', value: 'в' },
      { code: 'KeyU', value: 'г' },
      { code: 'KeyL', value: 'д' },
    ],
  },
  {
    id: 'jp-jis',
    label: '日语 JIS 键盘',
    country: 'JP',
    geoWeight: 0.15,
    minConfidence: 0.5,
    checks: [
      { code: 'Backslash', value: '¥' },
      { code: 'IntlRo', value: '\\' },
      { code: 'Lang1', value: 'かな' },
      { code: 'Lang2', value: '英数' },
    ],
  },
  {
    id: 'us-qwerty-generic',
    label: '通用 US-QWERTY 键盘',
    country: 'US',
    geoWeight: 0.04,
    minConfidence: 0.75,
    checks: [
      { code: 'KeyQ', value: 'q' },
      { code: 'KeyW', value: 'w' },
      { code: 'KeyY', value: 'y' },
      { code: 'KeyZ', value: 'z' },
      { code: 'Digit2', value: '@' },
      { code: 'Digit3', value: '#' },
    ],
  },
]

function inferLayouts(sampledLayout: Record<string, string>): KeyboardLayoutInference[] {
  return layoutRules
    .map((rule) => {
      const matches: KeyboardLayoutInference['matches'] = []
      const misses: KeyboardLayoutInference['misses'] = []
      for (const check of rule.checks) {
        const actual = sampledLayout[check.code]
        if (actual === check.value) matches.push({ code: check.code, expected: check.value, actual })
        else misses.push({ code: check.code, expected: check.value, actual })
      }

      const known = rule.checks.filter((check) => sampledLayout[check.code] !== undefined).length
      const confidence = known === 0 ? 0 : Math.round((matches.length / rule.checks.length) * 100) / 100
      return {
        id: rule.id,
        label: rule.label,
        country: rule.country,
        confidence,
        geoWeight: confidence >= rule.minConfidence ? rule.geoWeight : 0,
        matches,
        misses,
      }
    })
    .filter((item) => item.confidence > 0)
    .sort((a, b) => b.geoWeight * b.confidence - a.geoWeight * a.confidence || b.confidence - a.confidence)
}

export const keyboardProbe: ProbeDefinition<KeyboardProbeData> = {
  id: 'keyboard',
  name: '键盘布局归因',
  description: '使用 Keyboard Layout Map 读取物理键位与字符的映射，识别 AZERTY、QWERTZ、JIS 等具有地区差异的键盘布局。',
  run: () =>
    createProbeResult<KeyboardProbeData>(keyboardProbe, async () => {
      const keyboard = (navigator as Navigator & { keyboard?: KeyboardWithLayoutMap }).keyboard
      if (!keyboard?.getLayoutMap) {
        return {
          unsupported: true,
          data: {
            supported: false,
            secureContext: window.isSecureContext,
            sampledLayout: {},
            inferredLayouts: [],
            error: 'navigator.keyboard.getLayoutMap 不可用',
          },
        }
      }

      try {
        const layoutMap = await keyboard.getLayoutMap()
        const sampledLayout = sampleCodes.reduce<Record<string, string>>((acc, code) => {
          const value = layoutMap.get(code)
          if (typeof value === 'string' && value.length > 0) acc[code] = value
          return acc
        }, {})
        const inferredLayouts = inferLayouts(sampledLayout)
        const signals: ProbeSignal[] = []
        const topRegional = inferredLayouts.find((item) => item.country && item.geoWeight >= 0.1 && item.confidence >= 0.5)

        if (topRegional) {
          signals.push(
            signal(
              'keyboard-regional-layout',
              'region',
              topRegional.confidence >= 0.75 ? 'medium' : 'low',
              `键盘布局指向${topRegional.label}`,
              `物理键位映射与 ${topRegional.label} 匹配度约 ${Math.round(topRegional.confidence * 100)}%，可作为地区环境证据。`,
              Math.min(0.82, 0.42 + topRegional.confidence * 0.42),
              { inference: topRegional, sampledLayout },
            ),
          )
        }

        return { data: { supported: true, secureContext: window.isSecureContext, sampledLayout, inferredLayouts }, signals }
      } catch (error) {
        return {
          data: {
            supported: true,
            secureContext: window.isSecureContext,
            sampledLayout: {},
            inferredLayouts: [],
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          },
          signals: [],
        }
      }
    }),
}
