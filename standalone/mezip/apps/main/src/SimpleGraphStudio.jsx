import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import SimpleGraph from './SimpleGraph'
import { PAGEVIEW_ENDPOINT, postViewOnce } from './pageviewClient'
import './SimpleGraphStudio.css'

const REFRESH_INTERVAL = 30000

const emptySnapshot = { today: '', days: [], total: 0, updatedAt: null }

const cleanSnapshot = payload => {
  if (!payload || typeof payload !== 'object') return emptySnapshot
  const days = Array.isArray(payload.days)
    ? payload.days.map(day => ({
      date: String(day?.date || ''),
      total: Number.isFinite(Number(day?.total)) ? Math.max(0, Math.floor(Number(day.total))) : 0,
      hourly: Array.isArray(day?.hourly)
        ? day.hourly.map(point => ({ label: String(point?.label || ''), value: Number.isFinite(Number(point?.value)) ? Math.max(0, Math.floor(Number(point.value))) : 0 }))
        : [],
      paths: Array.isArray(day?.paths) ? day.paths : [],
      updatedAt: day?.updatedAt || null,
    }))
    : []
  return {
    today: String(payload.today || days.at(-1)?.date || ''),
    days,
    total: Number.isFinite(Number(payload.total)) ? Math.max(0, Math.floor(Number(payload.total))) : days.reduce((sum, day) => sum + day.total, 0),
    updatedAt: payload.updatedAt || days.at(-1)?.updatedAt || null,
  }
}

const hourBuckets = day => {
  const hourly = Array.isArray(day?.hourly) ? day.hourly : []
  return Array.from({ length: 12 }, (_, bucket) => {
    const first = Number(hourly[bucket * 2]?.value) || 0
    const second = Number(hourly[bucket * 2 + 1]?.value) || 0
    return { label: `${String(bucket * 2).padStart(2, '0')}:00`, value: first + second }
  })
}

const formatUpdated = value => {
  if (!value) return '等待首个事件'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return `更新于 ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

export default function SimpleGraphStudio() {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [status, setStatus] = useState('连接中')
  const [lastError, setLastError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const activeRef = useRef(true)

  const refresh = useCallback(async signal => {
    try {
      const response = await fetch(`${PAGEVIEW_ENDPOINT}?days=1`, { cache: 'no-store', signal })
      if (!response.ok) throw new Error(`pageview snapshot failed (${response.status})`)
      const next = cleanSnapshot(await response.json())
      if (!activeRef.current) return next
      setSnapshot(next)
      setStatus('实时')
      setLastError('')
      return next
    } catch (error) {
      if (error?.name === 'AbortError') return null
      if (activeRef.current) {
        setStatus('暂不可用')
        setLastError('访问统计服务暂不可用，正在重试')
      }
      return null
    }
  }, [])

  const manualRefresh = useCallback(() => {
    setRefreshToken(value => value + 1)
  }, [])

  useEffect(() => {
    activeRef.current = true
    const controller = new AbortController()
    const boot = async () => {
      setStatus('记录中')
      try {
        const response = await postViewOnce()
        if (activeRef.current && response) setSnapshot(cleanSnapshot({ ...response, days: [response] }))
      } catch (error) {
        if (activeRef.current) {
          setStatus('暂不可用')
          setLastError('访问统计服务暂不可用，正在重试')
        }
      }
      await refresh(controller.signal)
    }
    boot()
    const timer = window.setInterval(() => { if(document.visibilityState==='visible') void refresh() }, REFRESH_INTERVAL)
    const onFocus = () => { void refresh() }
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      activeRef.current = false
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  useEffect(() => {
    if (!refreshToken) return undefined
    const controller = new AbortController()
    setStatus('刷新中')
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refreshToken, refresh])

  const currentDay = snapshot.days.at(-1) || { date: snapshot.today, total: 0, hourly: [] }
  const graphData = useMemo(() => hourBuckets(currentDay), [currentDay])
  const activeHour = graphData[Math.min(11, Math.floor(new Date().getHours() / 2))]?.value || 0
  const peak = graphData.reduce((max, point) => Math.max(max, point.value), 0)
  const total = currentDay.total || 0

  return <section
    className="simple-graph-studio section-wrap"
    id="simple-graph"
    aria-labelledby="simple-graph-studio-title"
    data-simple-graph-studio
    data-pageview-endpoint={PAGEVIEW_ENDPOINT}
    data-pageview-total={total}
    data-pageview-status={status}
    data-pageview-date={currentDay.date || snapshot.today}
  >
    <div className="simple-graph-studio-copy">
      <p className="eyebrow">SIMPLE GRAPH / LIVE VIEWS</p>
      <h2 id="simple-graph-studio-title">让每一次打开，都留下当天的曲线。</h2>
      <p>沿用 Simple Graph 的平滑曲线、点位悬浮和渐隐填充，把本站每一次真实打开记录为当天的浏览量。数据写入本地服务端，页面会持续刷新。</p>
      <div className="simple-graph-metrics" aria-live="polite">
        <div className="simple-graph-metric simple-graph-metric-primary">
          <span>今日浏览量</span>
          <strong>{total.toLocaleString()}</strong>
          <small>{currentDay.date || '等待日期'}</small>
        </div>
        <div className="simple-graph-metric">
          <span>最近两小时</span>
          <strong>{activeHour.toLocaleString()}</strong>
          <small>峰值 {peak.toLocaleString()}</small>
        </div>
      </div>
      <div className="simple-graph-status-line">
        <span className={`simple-graph-live-dot ${status === '实时' ? 'is-live' : ''}`} aria-hidden="true" />
        <span>{status}</span>
        <span className="simple-graph-status-separator">·</span>
        <span>{formatUpdated(snapshot.updatedAt)}</span>
      </div>
      <p className="simple-graph-note">仅保存匿名事件 ID、页面锚点与 Asia/Taipei 日期桶；不记录 IP、Cookie 或浏览器指纹。</p>
      {lastError && <p className="simple-graph-error" role="status">{lastError}</p>}
    </div>

    <div className="simple-graph-studio-visual">
      <div className="simple-graph-frame" data-media-slot="simple-graph" aria-busy={status === '连接中' || status === '记录中' || status === '刷新中'}>
        <div className="simple-graph-frame-head">
          <span>LIVE / TODAY · {currentDay.date || '—'}</span>
          <button type="button" className="simple-graph-refresh-button" onClick={manualRefresh} aria-label="刷新今日浏览量" data-simple-graph-refresh>
            <span aria-hidden="true">↻</span>
          </button>
        </div>
        <div className="simple-graph-canvas" aria-label="今日每两小时浏览量曲线">
          <SimpleGraph
            key={`${currentDay.date || 'empty'}-${snapshot.updatedAt || 'initial'}`}
            data={graphData}
            lineColor="#B19EEF"
            dotColor="#B19EEF"
            height={340}
            animationDuration={1.4}
            showGrid
            gridStyle="dashed"
            gridLines="horizontal"
            gridLineThickness={1.5}
            showDots
            dotSize={7}
            dotHoverGlow
            curved
            gradientFade
            graphLineThickness={3}
            animateOnScroll
            animateOnce={false}
            className="simple-graph-effect"
          />
        </div>
        <div className="simple-graph-frame-foot">
          <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span>
        </div>
      </div>
      <p className="simple-graph-stage-note">HOVER POINTS TO INSPECT · REFRESHES EVERY 5S</p>
    </div>
  </section>
}
