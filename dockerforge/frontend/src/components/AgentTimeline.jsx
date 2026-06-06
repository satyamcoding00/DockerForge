import StatusBadge from './StatusBadge.jsx'

const STEPS = [
  { id: 'CLONING',    label: 'Clone Repository',   icon: '📦' },
  { id: 'SCANNING',   label: 'Scan & Analyze',      icon: '🔍' },
  { id: 'GENERATING', label: 'Generate Dockerfile', icon: '🤖' },
  { id: 'BUILDING',   label: 'Docker Build',        icon: '🔨' },
  { id: 'RETRYING',   label: 'AI Fix & Retry',      icon: '🔄' },
  { id: 'RUNNING',    label: 'Verify Container',    icon: '▶️' },
  { id: 'COMPLETE',   label: 'Complete',            icon: '✅' },
]

function StepDot({ status }) {
  if (status === 'active') {
    return (
      <div className="relative flex items-center justify-center">
        <span className="absolute w-3 h-3 rounded-full bg-blue-400 ping-ring opacity-75" />
        <span className="w-3 h-3 rounded-full bg-blue-400" />
      </div>
    )
  }
  if (status === 'done') {
    return <span className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center" />
  }
  if (status === 'failed') {
    return <span className="w-3 h-3 rounded-full bg-red-500" />
  }
  if (status === 'retrying') {
    return <span className="w-3 h-3 rounded-full bg-yellow-400" />
  }
  return <span className="w-3 h-3 rounded-full bg-slate-600" />
}

export default function AgentTimeline({ stepStatuses, currentStep, attempts }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-5">
        Agent Progress
      </h3>
      <ol className="relative">
        {STEPS.map((step, idx) => {
          const status = stepStatuses[step.id] || 'pending'
          const isLast = idx === STEPS.length - 1
          const isActive = status === 'active' || status === 'retrying'

          return (
            <li key={step.id} className="flex gap-3 mb-0">
              <div className="flex flex-col items-center">
                <StepDot status={status} />
                {!isLast && (
                  <div className={`w-px flex-1 mt-1 mb-1 min-h-[28px]
                    ${status === 'done' ? 'bg-green-500/40' : 'bg-slate-700/60'}`}
                  />
                )}
              </div>
              <div className={`pb-5 flex-1 flex items-start justify-between gap-2 ${isLast ? 'pb-0' : ''}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">{step.icon}</span>
                  <span className={`text-sm truncate ${
                    isActive ? 'text-white font-medium' :
                    status === 'done' ? 'text-slate-300' :
                    status === 'failed' ? 'text-red-400' :
                    'text-slate-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
                <div className="shrink-0">
                  {status !== 'pending' && (
                    <StatusBadge
                      status={status}
                      attempt={step.id === 'RETRYING' ? attempts : undefined}
                      max={3}
                    />
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
