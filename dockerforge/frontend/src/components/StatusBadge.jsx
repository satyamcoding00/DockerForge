export default function StatusBadge({ status, attempt, max }) {
  const variants = {
    active: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
    done: 'bg-green-500/20 text-green-300 border border-green-500/40',
    failed: 'bg-red-500/20 text-red-300 border border-red-500/40',
    retrying: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
    pending: 'bg-slate-700/40 text-slate-500 border border-slate-600/30',
  }

  const labels = {
    active: 'running',
    done: 'done',
    failed: 'failed',
    retrying: attempt ? `retry ${attempt}/${max}` : 'retrying',
    pending: 'pending',
  }

  const cls = variants[status] || variants.pending
  const label = labels[status] || 'pending'

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${cls}`}>
      {label}
    </span>
  )
}
