import { useState, useEffect } from 'react'
import URLInput from './components/URLInput.jsx'
import AgentTimeline from './components/AgentTimeline.jsx'
import LogViewer from './components/LogViewer.jsx'
import DockerfileDisplay from './components/DockerfileDisplay.jsx'
import { useSSE } from './hooks/useSSE.js'

const PHASE = {
  IDLE: 'idle',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
}

export default function App() {
  const [phase, setPhase] = useState(PHASE.IDLE)
  const [jobId, setJobId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [logs, setLogs] = useState([])

  const { logs: sseLogs, stepStatuses, dockerfile, result, connectionStatus, currentStep }
    = useSSE(jobId)

  // Sync SSE logs into local state (so we can clear)
  useEffect(() => {
    setLogs(sseLogs)
  }, [sseLogs])

  // Listen for clear-logs event from LogViewer
  useEffect(() => {
    const handler = () => setLogs([])
    window.addEventListener('dockerforge:clear-logs', handler)
    return () => window.removeEventListener('dockerforge:clear-logs', handler)
  }, [])

  // Transition to DONE when complete
  useEffect(() => {
    if (currentStep === 'COMPLETE' || currentStep === 'RUN_SUCCESS' || currentStep === 'RUN_FAILED') {
      setPhase(PHASE.DONE)
      setSubmitting(false)
    }
    if (currentStep === 'ERROR') {
      setPhase(PHASE.ERROR)
      setSubmitting(false)
    }
  }, [currentStep])

  const handleSubmit = async (url) => {
    setSubmitting(true)
    setErrorMsg(null)
    setLogs([])
    setPhase(PHASE.RUNNING)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url: url }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Server error ${res.status}`)
      }
      const { job_id } = await res.json()
      setJobId(job_id)
    } catch (err) {
      setErrorMsg(err.message)
      setPhase(PHASE.IDLE)
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setPhase(PHASE.IDLE)
    setJobId(null)
    setLogs([])
    setErrorMsg(null)
    setSubmitting(false)
  }

  // Derive retry attempt count from stepStatuses
  const retryCount = stepStatuses['RETRYING'] ? 2 : undefined

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐳</span>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">DockerForge</h1>
              <p className="text-xs text-slate-500">AI-Powered Dockerfile Generator</p>
            </div>
          </div>
          {phase !== PHASE.IDLE && (
            <button
              onClick={handleReset}
              className="text-xs text-slate-400 hover:text-white border border-slate-700
                hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors font-mono"
            >
              ← New Repo
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">

        {/* ── IDLE ─────────────────────────────────────────────── */}
        {phase === PHASE.IDLE && (
          <div className="flex flex-col items-center text-center gap-8 mt-8">
            <div>
              <h2 className="text-4xl font-bold text-white mb-3">
                Point it at any GitHub repo.
              </h2>
              <p className="text-slate-400 text-lg max-w-xl mx-auto">
                DockerForge clones your repo, analyzes the stack, generates a
                Dockerfile with Gemini AI, and verifies it actually builds —
                all in under a minute.
              </p>
            </div>

            {errorMsg && (
              <div className="w-full max-w-2xl bg-red-900/30 border border-red-500/40 text-red-300
                rounded-xl px-4 py-3 text-sm">
                {errorMsg}
              </div>
            )}

            <URLInput onSubmit={handleSubmit} loading={submitting} />

            <div className="flex items-center gap-8 text-sm text-slate-500 mt-4">
              {['Auto language detection', 'Up to 3 AI retry attempts', 'Container verified'].map(f => (
                <div key={f} className="flex items-center gap-1.5">
                  <span className="text-green-500">✓</span> {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RUNNING ──────────────────────────────────────────── */}
        {(phase === PHASE.RUNNING || (phase === PHASE.DONE && logs.length > 0 && !dockerfile)) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-1">
              <AgentTimeline
                stepStatuses={stepStatuses}
                currentStep={currentStep}
                attempts={retryCount}
              />
            </div>
            <div className="lg:col-span-2">
              <LogViewer logs={logs} connectionStatus={connectionStatus} />
            </div>
          </div>
        )}

        {/* ── DONE with dockerfile ─────────────────────────────── */}
        {(phase === PHASE.DONE || phase === PHASE.ERROR) && dockerfile && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-1">
                <AgentTimeline
                  stepStatuses={stepStatuses}
                  currentStep={currentStep}
                  attempts={retryCount}
                />
              </div>
              <div className="lg:col-span-2">
                <LogViewer logs={logs} connectionStatus={connectionStatus} />
              </div>
            </div>
            <DockerfileDisplay dockerfile={dockerfile} result={result} />
          </div>
        )}

        {/* ── ERROR, no dockerfile ──────────────────────────────── */}
        {phase === PHASE.ERROR && !dockerfile && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="bg-red-900/20 border border-red-500/40 rounded-2xl px-8 py-6 text-center max-w-lg">
              <div className="text-3xl mb-3">💥</div>
              <h3 className="text-red-300 font-semibold mb-2">Generation Failed</h3>
              <p className="text-slate-400 text-sm">
                The agent couldn't build a working Dockerfile after 3 attempts.
                Try a simpler repository or check the logs above for clues.
              </p>
            </div>
            <div className="w-full">
              <LogViewer logs={logs} connectionStatus={connectionStatus} />
            </div>
            <button onClick={handleReset}
              className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl text-sm transition-colors">
              Try another repo
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 py-4">
        <p className="text-center text-xs text-slate-600 font-mono">
          DockerForge · Gemini 2.0 Flash · FastAPI · React · Built with love 🐳
        </p>
      </footer>
    </div>
  )
}
