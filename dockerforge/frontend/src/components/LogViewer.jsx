import { useEffect, useRef, useState } from 'react'

const STEP_COLORS = {
  CLONING:      'text-cyan-400',
  SCANNING:     'text-purple-400',
  GENERATING:   'text-yellow-300',
  BUILDING:     'text-orange-400',
  BUILD_SUCCESS:'text-green-400',
  BUILD_FAILED: 'text-red-400',
  RETRYING:     'text-yellow-400',
  RUNNING:      'text-blue-400',
  RUN_SUCCESS:  'text-green-400',
  RUN_FAILED:   'text-red-400',
  COMPLETE:     'text-green-300',
  ERROR:        'text-red-400',
}

function LogLine({ entry }) {
  if (entry.type === 'step') {
    const color = STEP_COLORS[entry.step] || 'text-slate-300'
    return (
      <div className={`${color} font-semibold`}>
        ▸ [{entry.step}] {entry.text}
      </div>
    )
  }
  return (
    <div className="text-green-400/80 whitespace-pre-wrap break-all leading-relaxed">
      {entry.text}
    </div>
  )
}

export default function LogViewer({ logs, connectionStatus }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setAutoScroll(atBottom)
  }

  const handleClear = () => {
    // Can't clear parent state from here — signal via a custom event
    window.dispatchEvent(new CustomEvent('dockerforge:clear-logs'))
  }

  const statusDot = {
    idle: 'bg-slate-600',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-green-400 animate-pulse',
    closed: 'bg-slate-400',
    error: 'bg-red-400',
  }[connectionStatus] || 'bg-slate-600'

  return (
    <div className="bg-[#0a0e1a] border border-slate-700/50 rounded-2xl flex flex-col h-full min-h-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="text-xs text-slate-400 font-mono">
            agent logs
            {connectionStatus === 'connected' && <span className="ml-1 text-green-400">● live</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600">{logs.length} lines</span>
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              ↓ scroll to bottom
            </button>
          )}
        </div>
      </div>

      {/* Log area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-5 space-y-0.5"
        style={{ maxHeight: '480px' }}
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">Waiting for agent to start...</div>
        ) : (
          logs.map((entry, i) => <LogLine key={i} entry={entry} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
