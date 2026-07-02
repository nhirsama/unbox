import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ProbeResult, ProbeStatus, RiskLevel, ScoreBucket } from './types'
import type { NetworkAttributionScore, NetworkProbeData, ProxyPatternScore, ReachabilityProfile } from './probes/network'
import {
  confidenceToLevel,
  sourceDisplayName,
  summarizeIdentityAttribution,
  type CountryAttribution,
  type CountryEvidence,
  type IdentityAttributionSummary,
  type SpoofingAssessment,
} from './attribution'
import { flattenSignals, probeDefinitions, runAllProbes, summarizeScores } from './probes'
import './styles.css'

type RunState = 'idle' | 'running' | 'done'

const levelLabel: Record<RiskLevel, string> = {
  info: '信息',
  low: '偏低',
  medium: '中等',
  high: '较高',
}

const probabilityLabel: Record<RiskLevel, string> = {
  info: '很低',
  low: '偏低',
  medium: '中等',
  high: '很高',
}

const levelClass: Record<RiskLevel, string> = {
  info: 'risk-info',
  low: 'risk-low',
  medium: 'risk-medium',
  high: 'risk-high',
}

const statusLabel: Record<ProbeStatus, string> = {
  idle: '等待',
  running: '运行中',
  success: '完成',
  warning: '警告',
  error: '失败',
  unsupported: '不支持',
}

function formatDuration(ms?: number) {
  if (typeof ms !== 'number') return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatRate(value?: number) {
  if (typeof value !== 'number') return '—'
  return `${Math.round(value * 100)}%`
}

function ScoreRing({ score, level }: { score: number; level: RiskLevel }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)))
  return (
    <div className={`score-ring ${levelClass[level]}`} style={{ '--score': `${safeScore * 3.6}deg` } as React.CSSProperties}>
      <div>
        <strong>{safeScore}</strong>
        <span>/100</span>
      </div>
    </div>
  )
}

function AttributionSignalBucketCard({ bucket }: { bucket: ScoreBucket }) {
  return (
    <article className="bucket-card glass">
      <div className="bucket-head">
        <ScoreRing score={bucket.score} level={bucket.level} />
        <div>
          <h3>{bucket.label}</h3>
          <p>{bucket.signals.length} 个归因/一致性信号 · 强度 {levelLabel[bucket.level]}</p>
        </div>
      </div>
      <div className="mini-signal-list">
        {bucket.signals.slice(0, 3).map((item) => (
          <span className={`pill ${levelClass[item.level]}`} key={item.id}>
            {item.title}
          </span>
        ))}
      </div>
    </article>
  )
}

function EvidenceItem({ evidence }: { evidence: CountryEvidence }) {
  const confidence = Math.round(evidence.confidence * 100)
  const level = confidenceToLevel(confidence)
  return (
    <div className="evidence-item">
      <div className="evidence-item-head">
        <span className="source-tag">{sourceDisplayName(evidence.source)}</span>
        <span className={`pill ${levelClass[level]}`}>{evidence.label}</span>
        <span className="confidence">{confidence}%</span>
      </div>
      <p>{evidence.detail}</p>
    </div>
  )
}

function CountryCard({ attribution, rank }: { attribution: CountryAttribution; rank: number }) {
  const level = confidenceToLevel(attribution.confidence)
  return (
    <article className="country-card glass">
      <div className="country-card-head">
        <div className="rank-badge">#{rank + 1}</div>
        <div>
          <span className="country-code">{attribution.country}</span>
          <h3>{attribution.label}</h3>
          <p>{attribution.evidence.length} 条证据支持 · 归因置信度 {probabilityLabel[level]}</p>
        </div>
        <ScoreRing score={attribution.confidence} level={level} />
      </div>
      <div className="evidence-list compact-evidence">
        {attribution.evidence.slice(0, 4).map((item) => (
          <EvidenceItem evidence={item} key={item.id} />
        ))}
      </div>
    </article>
  )
}

function SpoofingCard({ spoofing }: { spoofing: SpoofingAssessment }) {
  return (
    <article className="spoofing-card glass">
      <div className="spoofing-head">
        <ScoreRing score={spoofing.score} level={spoofing.level} />
        <div>
          <span className="eyebrow">Consistency</span>
          <h3>伪装/不一致概率</h3>
          <p>{spoofing.summary}</p>
        </div>
      </div>
      {spoofing.conflicts.length > 0 ? (
        <ul className="conflict-list">
          {spoofing.conflicts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted compact-note">未发现出口 IP、语言、时区、字体之间的主要国籍/地区冲突。</p>
      )}
    </article>
  )
}

function MatrixScoreCard({ attribution }: { attribution: NetworkAttributionScore }) {
  const level = confidenceToLevel(attribution.score)
  return (
    <article className="matrix-score-card glass">
      <div className="matrix-score-head">
        <div>
          <span className="country-code">{attribution.country}</span>
          <h3>{attribution.label}</h3>
          <p>网络环境分 · 置信度 {formatPercent(attribution.confidence)}</p>
        </div>
        <ScoreRing score={attribution.score} level={level} />
      </div>
      <ul className="reason-list">
        {attribution.reasons.slice(0, 4).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </article>
  )
}

function ProfileRow({ profile }: { profile: ReachabilityProfile }) {
  const level = confidenceToLevel(profile.score)
  return (
    <div className="profile-row">
      <div>
        <b>{profile.label}</b>
        <p>{profile.interpretation}</p>
      </div>
      <div className="profile-metrics">
        <span className={`pill ${levelClass[level]}`}>{profile.score}/100</span>
        <span>{profile.ok}/{profile.total} 可达</span>
        <span>失败 {formatRate(profile.failRate)}</span>
        <span>{typeof profile.medianMs === 'number' ? `${profile.medianMs}ms` : '—'}</span>
      </div>
    </div>
  )
}

function ProxyPatternCard({ proxyPattern }: { proxyPattern: ProxyPatternScore }) {
  const level = confidenceToLevel(proxyPattern.score)
  return (
    <article className="matrix-score-card proxy-score-card glass">
      <div className="matrix-score-head">
        <div>
          <span className="eyebrow">Split / Proxy</span>
          <h3>代理/分流异常分</h3>
          <p>{proxyPattern.reasons.length ? proxyPattern.reasons[0] : '连通性矩阵与出口 IP 暂未形成明显冲突。'}</p>
        </div>
        <ScoreRing score={proxyPattern.score} level={level} />
      </div>
      {proxyPattern.reasons.length > 1 && (
        <ul className="reason-list">
          {proxyPattern.reasons.slice(1, 5).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </article>
  )
}

function NetworkMatrixScorePanel({ results }: { results: ProbeResult[] }) {
  const network = results.find((item) => item.id === 'network')?.data as NetworkProbeData | undefined
  if (!network?.summary.reachabilityProfiles?.length) return null

  const attributions = network.summary.networkAttribution ?? []
  const proxyPattern = network.summary.proxyPattern
  const profiles = network.summary.reachabilityProfiles
  const baselineProfiles = profiles.filter((profile) => profile.kind === 'baseline')
  const mainlandProfiles = profiles.filter((profile) => profile.kind === 'mainland-service' || profile.kind === 'restriction-signature')
  const globalProfiles = profiles.filter((profile) => profile.kind === 'global-service')
  const regionalProfiles = profiles.filter((profile) => profile.kind === 'regional-service')

  const profileSections = [
    { title: '基线', description: '用于判断浏览器是否能加载通用 HTTPS 图片资源，以及计算相对耗时。', profiles: baselineProfiles },
    { title: '大陆网络特征', description: '大陆常用站点可达性与常见阻断目标失败率分开统计，组合后才形成大陆网络环境分。', profiles: mainlandProfiles },
    { title: '全球服务可达性', description: '全球社交、开发者和知识站点用于判断限制、代理覆盖和分流规则。', profiles: globalProfiles },
    { title: '地区强站点', description: '低于 90% 可达率不进入该地区归因，只作为覆盖不足展示。', profiles: regionalProfiles },
  ].filter((section) => section.profiles.length > 0)

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <span className="eyebrow">Network Matrix Scores</span>
          <h2>连通性矩阵评分</h2>
        </div>
      </div>

      <div className="matrix-score-grid">
        {attributions.length > 0 ? (
          attributions.slice(0, 4).map((item) => <MatrixScoreCard attribution={item} key={item.country} />)
        ) : (
          <div className="empty glass">连通性结果分散，暂未形成明确网络环境归因分。</div>
        )}
        {proxyPattern && <ProxyPatternCard proxyPattern={proxyPattern} />}
      </div>

      <div className="profile-section-grid">
        {profileSections.map((section) => (
          <div className="profile-table glass" key={section.title}>
            <div className="profile-table-head">
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </div>
            <div className="profile-list">
              {section.profiles.map((profile) => (
                <ProfileRow profile={profile} key={profile.id} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AttributionEvidencePanel({ identity }: { identity: IdentityAttributionSummary }) {
  const evidence = [...identity.evidence].sort((a, b) => b.weight * b.confidence - a.weight * a.confidence)
  if (evidence.length === 0) {
    return <div className="empty glass">运行探针后会在这里显示国籍/地区归因证据。</div>
  }
  return (
    <section className="evidence-list">
      {evidence.map((item) => (
        <article className="signal-card glass" key={item.id}>
          <div className="signal-card-head">
            <span className="source-tag">{sourceDisplayName(item.source)}</span>
            <span className={`pill ${levelClass[confidenceToLevel(item.confidence * 100)]}`}>{item.label}</span>
            <span className="confidence">{formatPercent(item.confidence)}</span>
          </div>
          <h3>{item.label}</h3>
          <p>{item.detail}</p>
        </article>
      ))}
    </section>
  )
}

function ProbeStatusBadge({ result }: { result?: ProbeResult }) {
  if (!result) return <span className="status idle">等待</span>
  return <span className={`status ${result.status}`}>{statusLabel[result.status]}</span>
}

function ProbeCard({ definition, result }: { definition: (typeof probeDefinitions)[number]; result?: ProbeResult }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="probe-card glass">
      <button className="probe-summary" onClick={() => setOpen((value) => !value)}>
        <span className="probe-dot" />
        <span>
          <strong>{definition.name}</strong>
          <small>{definition.description}</small>
        </span>
        <span className="probe-meta">
          {result ? formatDuration(result.durationMs) : ''}
          <ProbeStatusBadge result={result} />
        </span>
      </button>
      {result && open && (
        <div className="probe-body">
          {result.error && <div className="error-box">{result.error}</div>}
          {result.signals.length > 0 ? (
            <div className="signal-list compact">
              {result.signals.map((signal) => (
                <div className="signal-row" key={signal.id}>
                  <span className={`risk-dot ${levelClass[signal.level]}`} />
                  <div>
                    <b>{signal.title}</b>
                    <p>{signal.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">未产生明显归因或一致性信号。</p>
          )}
        </div>
      )}
    </article>
  )
}

function AttributionSignalTable({ results }: { results: ProbeResult[] }) {
  const signals = flattenSignals(results)
  if (signals.length === 0) {
    return <div className="empty glass">运行探针后会在这里显示归因/一致性信号。</div>
  }
  return (
    <section className="signal-list">
      {signals.map((item) => (
        <article className="signal-card glass" key={`${item.probeId}-${item.id}`}>
          <div className="signal-card-head">
            <span className={`pill ${levelClass[item.level]}`}>{levelLabel[item.level]}</span>
            <span className="muted">{item.probeName}</span>
            <span className="confidence">{formatPercent(item.confidence)}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
        </article>
      ))}
    </section>
  )
}

function ExportButton({ results, identity }: { results: ProbeResult[]; identity: IdentityAttributionSummary }) {
  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), identityAttribution: identity, results }, null, 2)],
      {
        type: 'application/json;charset=utf-8',
      },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nationality-attribution-probe-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button className="secondary" onClick={exportJson} disabled={results.length === 0}>
      导出 JSON
    </button>
  )
}

function App() {
  const [runState, setRunState] = useState<RunState>('idle')
  const [results, setResults] = useState<ProbeResult[]>([])
  const [includeSensitiveMatrix, setIncludeSensitiveMatrix] = useState(false)

  const scores = useMemo(() => summarizeScores(results), [results])
  const identity = useMemo(() => summarizeIdentityAttribution(results), [results])
  const totalSignals = useMemo(() => results.reduce((sum, item) => sum + item.signals.length, 0), [results])
  const topAttribution = identity.topCountries[0]

  const run = async () => {
    if (runState === 'running') return
    setRunState('running')
    setResults([])
    const context = { includeSensitiveMatrix }
    await runAllProbes(context, (result) => {
      setResults((prev) => {
        const next = prev.filter((item) => item.id !== result.id)
        return [...next, result]
      })
    })
    setRunState('done')
  }

  return (
    <main>
      <header className="topbar-wrapper">
        <nav className="topbar">
          <div className="brand">
            <span className="brand-mark">🧭</span>
            <span>Nationality Attribution Probe</span>
          </div>
          <div className="nav-actions">
            <ExportButton results={results} identity={identity} />
            <button className="primary" onClick={run} disabled={runState === 'running'}>
              {runState === 'running' ? '探测中…' : results.length ? '重新探测' : '开始探测'}
            </button>
          </div>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">Attribution · Consistency · HTTPS Static</span>
          <h1>别人会把你的环境归因到哪里？</h1>
          <p>
            纯前端探针会汇总出口 IP、语言、时区、日历系统、区域化 Emoji、字体、键盘布局、语音包、TLS/JA3/JA4、WebRTC/STUN 和连通性线索，估算外部观察者认为你属于某个国家/地区的置信度，
            并判断环境是否像经过代理、跨区配置或环境伪装。
          </p>
          <div className="hero-actions">
            <button className="primary large" onClick={run} disabled={runState === 'running'}>
              {runState === 'running' ? '探测中…' : '开始探测'}
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeSensitiveMatrix}
                onChange={(event) => setIncludeSensitiveMatrix(event.target.checked)}
              />
              <span />
              扩展站点/STUN/缓存矩阵
            </label>
          </div>
        </div>

        {results.length > 0 && (
          <div className="hero-stats identity-stats">
            <div className="stat-card glass">
              <ScoreRing score={topAttribution?.confidence ?? 0} level={confidenceToLevel(topAttribution?.confidence ?? 0)} />
              <div className="stat-info">
                <h3>最高归因：{topAttribution?.label ?? '证据不足'}</h3>
                <p>
                  {identity.evidence.length} 条归因证据 · {results.length}/{probeDefinitions.length} 个模块 · {totalSignals} 个归因/一致性信号
                </p>
              </div>
            </div>
            <div className="stat-card glass">
              <ScoreRing score={identity.spoofing.score} level={identity.spoofing.level} />
              <div className="stat-info">
                <h3>伪装/不一致概率</h3>
                <p>{identity.spoofing.summary}</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {results.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Attribution Candidates</span>
              <h2>国籍/地区归因候选</h2>
            </div>
          </div>
          <div className="attribution-grid">
            {identity.topCountries.length > 0 ? (
              identity.topCountries.slice(0, 4).map((country, index) => (
                <CountryCard attribution={country} rank={index} key={country.country} />
              ))
            ) : (
              <div className="empty glass wide-empty">当前证据不足，无法形成稳定的国籍/地区归因。</div>
            )}
            <SpoofingCard spoofing={identity.spoofing} />
          </div>
        </section>
      )}

      {results.length > 0 && <NetworkMatrixScorePanel results={results} />}

      {scores.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Attribution Signals</span>
              <h2>归因/一致性信号分组</h2>
            </div>
          </div>
          <div className="bucket-grid">
            {scores.map((bucket) => (
              <AttributionSignalBucketCard key={bucket.category} bucket={bucket} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="content-grid">
          <div className="main-column">
            <div className="section-head">
              <div>
                <span className="eyebrow">Modules</span>
                <h2>探针模块</h2>
              </div>
            </div>
            <div className="probe-list">
              {probeDefinitions.map((definition) => (
                <ProbeCard definition={definition} result={results.find((item) => item.id === definition.id)} key={definition.id} />
              ))}
            </div>
          </div>

          <div className="sidebar-column">
            <div className="section-head sticky-head">
              <div>
                <span className="eyebrow">Evidence</span>
                <h2>归因证据</h2>
              </div>
            </div>
            <AttributionEvidencePanel identity={identity} />
          </div>
        </div>
      </section>

      {results.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Signals</span>
              <h2>归因/一致性信号明细</h2>
            </div>
          </div>
          <AttributionSignalTable results={results} />
        </section>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
