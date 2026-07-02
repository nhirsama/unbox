import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, signal } from './utils'

interface EmojiRenderTarget {
  id: string
  label: string
  text: string
}

export interface EmojiRenderSample {
  id: string
  label: string
  width: number
  inkPixels: number
  inkRatio: number
}

export interface EmojiProbeData {
  supported: boolean
  samples: EmojiRenderSample[]
  specialRegionFlagAnomaly: boolean
  specialRegionWidthRatio?: number
  specialRegionInkRatio?: number
}

const samples: EmojiRenderTarget[] = [
  { id: 'flag-special-region', label: '特殊地区旗帜', text: '🇹🇼' },
  { id: 'flag-reference-a', label: '参考旗帜 A', text: '🇨🇳' },
  { id: 'flag-reference-b', label: '参考旗帜 B', text: '🇺🇸' },
  { id: 'flag-reference-c', label: '参考旗帜 C', text: '🇯🇵' },
  { id: 'flag-reference-d', label: '参考旗帜 D', text: '🇰🇷' },
]

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return undefined
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function renderSample(sample: EmojiRenderTarget): EmojiRenderSample {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 96
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { id: sample.id, label: sample.label, width: 0, inkPixels: 0, inkRatio: 0 }

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '56px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(sample.text, 8, 18)
  const metrics = ctx.measureText(sample.text)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let inkPixels = 0
  for (let index = 3; index < image.length; index += 4) {
    if (image[index] > 16) inkPixels += 1
  }

  return {
    id: sample.id,
    label: sample.label,
    width: Number(metrics.width.toFixed(2)),
    inkPixels,
    inkRatio: Number((inkPixels / (canvas.width * canvas.height)).toFixed(4)),
  }
}

export const emojiProbe: ProbeDefinition<EmojiProbeData> = {
  id: 'emoji',
  name: '区域化 Emoji 渲染',
  description: '检测具有发行地区差异的旗帜 Emoji 渲染，重点判断特殊地区旗帜是否被区域化处理。',
  run: () =>
    createProbeResult<EmojiProbeData>(emojiProbe, () => {
      const rendered = samples.map(renderSample)
      const specialRegion = rendered.find((item) => item.id === 'flag-special-region')
      const refs = rendered.filter((item) => item.id !== 'flag-special-region')
      const refWidth = median(refs.map((item) => item.width))
      const refInk = median(refs.map((item) => item.inkPixels))
      const specialRegionWidthRatio = specialRegion && refWidth ? Number((specialRegion.width / refWidth).toFixed(2)) : undefined
      const specialRegionInkRatio = specialRegion && refInk ? Number((specialRegion.inkPixels / refInk).toFixed(2)) : undefined
      const specialRegionFlagAnomaly = Boolean(
        specialRegion &&
          typeof specialRegionWidthRatio === 'number' &&
          typeof specialRegionInkRatio === 'number' &&
          (specialRegionWidthRatio < 0.72 ||
            specialRegionWidthRatio > 1.42 ||
            specialRegionInkRatio < 0.58 ||
            specialRegionInkRatio > 1.55),
      )

      const signals: ProbeSignal[] = []
      if (specialRegionFlagAnomaly) {
        signals.push(
          signal(
            'special-region-flag-render-anomaly',
            'region',
            'medium',
            '特殊地区旗帜 Emoji 渲染存在区域化差异',
            `特殊地区旗帜相对参考旗帜的宽度比约 ${specialRegionWidthRatio}、像素墨迹比约 ${specialRegionInkRatio}；这可能来自发行地区、系统字体或区域化 Emoji 策略。`,
            0.62,
            { specialRegionWidthRatio, specialRegionInkRatio, samples: rendered },
          ),
        )
      }

      return {
        data: { supported: true, samples: rendered, specialRegionFlagAnomaly, specialRegionWidthRatio, specialRegionInkRatio },
        signals,
      }
    }),
}
