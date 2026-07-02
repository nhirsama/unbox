import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, signal, withTimeout } from './utils'

export type IceCandidateAddressKind = 'public' | 'private' | 'mdns' | 'unknown'

export interface ParsedIceCandidate {
  raw: string
  foundation?: string
  component?: string
  protocol?: string
  priority?: string
  address?: string
  port?: number
  type?: string
  relatedAddress?: string
  relatedPort?: number
  addressKind: IceCandidateAddressKind
}

export interface WebRtcGeoIp {
  ip: string
  ok: boolean
  country?: string
  city?: string
  region?: string
  asn?: string
  org?: string
  timezone?: string
  error?: string
}

export interface WebRtcProbeData {
  supported: boolean
  secureContext: boolean
  mode: 'host-only' | 'host-and-public-stun'
  stunServers: string[]
  candidates: ParsedIceCandidate[]
  publicIps: string[]
  privateIps: string[]
  mdnsHosts: string[]
  geolocatedPublicIps: WebRtcGeoIp[]
  notes: string[]
}

const publicStunServers = ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478']

function isIPv4(value: string) {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const number = Number(part)
    return number >= 0 && number <= 255
  })
}

function isIPv6(value: string) {
  return /^[0-9a-f:]+$/i.test(value) && value.includes(':')
}

function isPrivateOrReservedIPv4(ip: string) {
  const [a, b] = ip.split('.').map(Number)
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 0) return true
  if (a >= 224) return true
  if (a === 192 && b === 0) return true
  if (a === 192 && b === 2) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51) return true
  if (a === 203 && b === 0) return true
  return false
}

function isPrivateOrReservedIPv6(ip: string) {
  const lower = ip.toLowerCase()
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('2001:db8:')
  )
}

function classifyAddress(address?: string): IceCandidateAddressKind {
  if (!address) return 'unknown'
  const lower = address.toLowerCase()
  if (lower.endsWith('.local')) return 'mdns'
  if (isIPv4(address)) return isPrivateOrReservedIPv4(address) ? 'private' : 'public'
  if (isIPv6(address)) return isPrivateOrReservedIPv6(address) ? 'private' : 'public'
  return 'unknown'
}

function parseIceCandidate(raw: string): ParsedIceCandidate | undefined {
  const normalized = raw.trim().replace(/^a=/, '')
  if (!normalized.startsWith('candidate:')) return undefined

  const parts = normalized.split(/\s+/)
  const typeIndex = parts.indexOf('typ')
  const raddrIndex = parts.indexOf('raddr')
  const rportIndex = parts.indexOf('rport')
  const address = parts[4]

  return {
    raw: normalized,
    foundation: parts[0]?.replace(/^candidate:/, ''),
    component: parts[1],
    protocol: parts[2]?.toLowerCase(),
    priority: parts[3],
    address,
    port: Number.isFinite(Number(parts[5])) ? Number(parts[5]) : undefined,
    type: typeIndex >= 0 ? parts[typeIndex + 1] : undefined,
    relatedAddress: raddrIndex >= 0 ? parts[raddrIndex + 1] : undefined,
    relatedPort: rportIndex >= 0 && Number.isFinite(Number(parts[rportIndex + 1])) ? Number(parts[rportIndex + 1]) : undefined,
    addressKind: classifyAddress(address),
  }
}

function uniqueCandidates(candidates: ParsedIceCandidate[]) {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.address ?? ''}|${candidate.port ?? ''}|${candidate.type ?? ''}|${candidate.protocol ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function geolocateIp(ip: string): Promise<WebRtcGeoIp> {
  try {
    const data = await withTimeout(async (abortSignal) => {
      const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: abortSignal,
        headers: { Accept: 'application/json,text/plain,*/*' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return (await response.json()) as Record<string, unknown>
    }, 6500)

    return {
      ip,
      ok: true,
      country: typeof data.country === 'string' ? data.country : undefined,
      city: typeof data.city === 'string' ? data.city : undefined,
      region: typeof data.region === 'string' ? data.region : undefined,
      asn: typeof data.asn === 'string' ? data.asn : undefined,
      org: typeof data.org === 'string' ? data.org : typeof data.as_name === 'string' ? data.as_name : undefined,
      timezone: typeof data.timezone === 'string' ? data.timezone : undefined,
    }
  } catch (error) {
    return {
      ip,
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

export const webrtcProbe: ProbeDefinition<WebRtcProbeData> = {
  id: 'webrtc',
  name: 'WebRTC 出口一致性',
  description: '通过 RTCPeerConnection 收集 ICE 候选；扩展模式会使用公共 STUN 辅助发现可能绕过 HTTPS 代理的公网出口。',
  run: (context) =>
    createProbeResult<WebRtcProbeData>(webrtcProbe, async () => {
      if (typeof RTCPeerConnection === 'undefined') {
        return {
          unsupported: true,
          data: {
            supported: false,
            secureContext: window.isSecureContext,
            mode: context.includeSensitiveMatrix ? 'host-and-public-stun' : 'host-only',
            stunServers: [],
            candidates: [],
            publicIps: [],
            privateIps: [],
            mdnsHosts: [],
            geolocatedPublicIps: [],
            notes: ['RTCPeerConnection 不可用'],
          },
        }
      }

      const stunServers = context.includeSensitiveMatrix ? publicStunServers : []
      const pc = new RTCPeerConnection({
        iceServers: stunServers.length > 0 ? [{ urls: stunServers }] : [],
        iceCandidatePoolSize: 0,
      })
      const candidates: ParsedIceCandidate[] = []
      const notes: string[] = []

      const addCandidate = (raw?: string) => {
        if (!raw) return
        const parsed = parseIceCandidate(raw)
        if (parsed) candidates.push(parsed)
      }

      try {
        pc.createDataChannel('geo-attribution-probe')
        pc.onicecandidate = (event) => addCandidate(event.candidate?.candidate)
        const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
        await pc.setLocalDescription(offer)

        await new Promise<void>((resolve) => {
          let done = false
          const finish = () => {
            if (done) return
            done = true
            resolve()
          }
          pc.onicecandidate = (event) => {
            if (event.candidate?.candidate) addCandidate(event.candidate.candidate)
            else finish()
          }
          window.setTimeout(finish, context.includeSensitiveMatrix ? 4500 : 2500)
        })

        const sdp = pc.localDescription?.sdp ?? ''
        sdp
          .split('\n')
          .filter((line) => line.trim().startsWith('a=candidate:'))
          .forEach(addCandidate)
      } finally {
        pc.close()
      }

      const deduped = uniqueCandidates(candidates)
      const publicIps = [...new Set(deduped.filter((item) => item.addressKind === 'public').map((item) => item.address!))]
      const privateIps = [...new Set(deduped.filter((item) => item.addressKind === 'private').map((item) => item.address!))]
      const mdnsHosts = [...new Set(deduped.filter((item) => item.addressKind === 'mdns').map((item) => item.address!))]
      const geolocatedPublicIps = await Promise.all(publicIps.slice(0, 4).map(geolocateIp))

      if (mdnsHosts.length > 0 && privateIps.length === 0) {
        notes.push('浏览器使用 mDNS 主机名遮蔽本地地址')
      }
      if (!context.includeSensitiveMatrix) {
        notes.push('当前为 host-only 模式；开启扩展矩阵后会加入公共 STUN 候选')
      }

      const data: WebRtcProbeData = {
        supported: true,
        secureContext: window.isSecureContext,
        mode: context.includeSensitiveMatrix ? 'host-and-public-stun' : 'host-only',
        stunServers,
        candidates: deduped,
        publicIps,
        privateIps,
        mdnsHosts,
        geolocatedPublicIps,
        notes,
      }

      const signals: ProbeSignal[] = []
      const geolocated = geolocatedPublicIps.filter((item) => item.ok && item.country)
      if (geolocated.length > 0) {
        signals.push(
          signal(
            'webrtc-public-candidate-geo',
            'network',
            'medium',
            'WebRTC/STUN 提供公网出口归属',
            `WebRTC 公网候选指向 ${geolocated.map((item) => `${item.ip}(${item.country})`).join('、')}，可与 HTTPS IP API 对比判断出口一致性。`,
            0.78,
            { geolocatedPublicIps: geolocated },
          ),
        )
      }

      if (privateIps.length > 0) {
        signals.push(
          signal(
            'webrtc-private-address-visible',
            'network',
            'low',
            'WebRTC host 候选包含局域网地址',
            `检测到 ${privateIps.length} 个局域网候选；它们通常不直接指向国家/地区，但可提示浏览器未完全 mDNS 化。`,
            0.42,
            { privateIps },
          ),
        )
      }

      return { data, signals }
    }),
}
