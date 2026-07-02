export type ProbeStatus = 'idle' | 'running' | 'success' | 'warning' | 'error' | 'unsupported'

export type RiskLevel = 'info' | 'low' | 'medium' | 'high'

export type SignalCategory = 'region' | 'network' | 'consistency'

export interface ProbeSignal {
  id: string
  category: SignalCategory
  level: RiskLevel
  title: string
  summary: string
  confidence: number
  evidence?: Record<string, unknown>
}

export interface ProbeResult<T = unknown> {
  id: string
  name: string
  description: string
  status: ProbeStatus
  startedAt: string
  finishedAt: string
  durationMs: number
  data?: T
  signals: ProbeSignal[]
  error?: string
}

export interface ProbeContext {
  includeSensitiveMatrix: boolean
}

export interface ProbeDefinition<T = unknown> {
  id: string
  name: string
  description: string
  run: (context: ProbeContext) => Promise<ProbeResult<T>>
}

export interface ScoreBucket {
  category: SignalCategory
  label: string
  score: number
  level: RiskLevel
  signals: ProbeSignal[]
}
