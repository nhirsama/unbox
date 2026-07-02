import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, signal } from './utils'

export interface FontProbeData {
  detected: string[]
  groups: Record<string, string[]>
}

const fontGroups: Record<string, string[]> = {
  mainland: [
    'SimSun',
    'NSimSun',
    'Microsoft YaHei',
    'Microsoft YaHei UI',
    'FangSong',
    'KaiTi',
    'DengXian',
    'PingFang SC',
    'Songti SC',
    'Heiti SC',
    'HarmonyOS Sans',
    'MiSans',
    'OPPO Sans',
    'vivo Sans',
    'Noto Sans CJK SC',
    'Source Han Sans SC',
    'Source Han Serif SC',
  ],
  traditional: [
    'Microsoft JhengHei',
    'PMingLiU',
    'MingLiU',
    'DFKai-SB',
    'PingFang TC',
    'Songti TC',
    'Heiti TC',
    'LiHei Pro',
    'Noto Sans CJK TC',
    'Source Han Sans TC',
    'Source Han Serif TC',
  ],
}

const testString = 'mmmmmmmmmmlli中文汉字漢字測試台湾臺灣🙂🏳️‍🌈🇹🇼🇨🇳'
const baseFonts = ['monospace', 'sans-serif', 'serif']

function getTextMetrics(fontFamily: string) {
  const span = document.createElement('span')
  span.textContent = testString
  span.style.position = 'absolute'
  span.style.left = '-9999px'
  span.style.top = '-9999px'
  span.style.fontSize = '72px'
  span.style.lineHeight = 'normal'
  span.style.fontStyle = 'normal'
  span.style.fontWeight = '400'
  span.style.letterSpacing = '0'
  span.style.whiteSpace = 'nowrap'
  span.style.fontFamily = fontFamily
  document.body.appendChild(span)
  const rect = span.getBoundingClientRect()
  span.remove()
  return { width: Number(rect.width.toFixed(3)), height: Number(rect.height.toFixed(3)) }
}

function detectFont(font: string) {
  const quoted = font.includes(' ') ? `"${font}"` : font
  const bases = baseFonts.map((base) => getTextMetrics(base))
  const tested = baseFonts.map((base) => getTextMetrics(`${quoted}, ${base}`))
  const metricDetected = tested.some((metric, index) => {
    const base = bases[index]
    return Math.abs(metric.width - base.width) > 0.01 || Math.abs(metric.height - base.height) > 0.01
  })

  let checkDetected = false
  if ('fonts' in document && typeof document.fonts?.check === 'function') {
    try {
      checkDetected = document.fonts.check(`16px ${quoted}`)
    } catch {
      checkDetected = false
    }
  }

  return {
    detected: metricDetected || checkDetected,
    width: tested[0].width,
    height: tested[0].height,
    method: checkDetected ? ('document.fonts.check' as const) : ('metric' as const),
  }
}

export const fontProbe: ProbeDefinition<FontProbeData> = {
  id: 'fonts',
  name: '字体地区归因',
  description: '通过 CSS 尺寸差异和 Font Loading API 仅探测具有地区指向性的中日韩字体。',
  run: () =>
    createProbeResult<FontProbeData>(fontProbe, () => {
      const allFonts = [...new Set(Object.values(fontGroups).flat())]
      const detected = allFonts.filter((font) => detectFont(font).detected)
      const groups = Object.fromEntries(
        Object.entries(fontGroups).map(([group, fonts]) => [group, fonts.filter((font) => detected.includes(font))]),
      )
      const data: FontProbeData = { detected, groups }
      const signals: ProbeSignal[] = []

      if (groups.mainland.length >= 2) {
        signals.push(
          signal(
            'mainland-fonts',
            'region',
            'medium',
            '检测到多个简体中文/大陆常见字体',
            `检测到 ${groups.mainland.slice(0, 5).join('、')} 等字体，系统字体集合偏向简体中文/大陆环境。`,
            Math.min(0.9, 0.45 + groups.mainland.length * 0.06),
            { fonts: groups.mainland },
          ),
        )
      }

      if (groups.traditional.length >= 2) {
        signals.push(
          signal(
            'traditional-fonts',
            'region',
            'medium',
            '检测到多个繁体中文地区常见字体',
            `检测到 ${groups.traditional.slice(0, 5).join('、')} 等字体，系统字体集合偏向繁体中文地区环境。`,
            Math.min(0.88, 0.45 + groups.traditional.length * 0.06),
            { fonts: groups.traditional },
          ),
        )
      }

      return { data, signals }
    }),
}
