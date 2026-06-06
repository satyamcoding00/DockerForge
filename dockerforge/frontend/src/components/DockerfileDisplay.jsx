import { useState, useEffect } from 'react'
import hljs from 'highlight.js/lib/core'
import dockerfile from 'highlight.js/lib/languages/dockerfile'

hljs.registerLanguage('dockerfile', dockerfile)

function highlight(code) {
  try {
    return hljs.highlight(code, { language: 'dockerfile' }).value
  } catch {
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all
        ${copied
          ? 'bg-green-500/20 text-green-300 border border-green-500/40'
          : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600/50'
        }`}
    >
      {copied ? '✓ Copied!' : '⎘ Copy'}
    </button>
  )
}

function DownloadButton({ text, filename }) {
  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono
        bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600/50 transition-all"
    >
      ↓ Download
    </button>
  )
}

function MetaBadge({ label, value, color = 'text-slate-300' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-500 text-xs">{label}:</span>
      <span className={`text-xs font-mono font-semibold ${color}`}>{value}</span>
    </div>
  )
}

export default function DockerfileDisplay({ dockerfile, result }) {
  const [activeTab, setActiveTab] = useState('dockerfile')
  const [highlighted, setHighlighted] = useState('')

  useEffect(() => {
    if (dockerfile) {
      setHighlighted(highlight(dockerfile))
    }
  }, [dockerfile])

  if (!dockerfile) return null

  const lineCount = dockerfile.split('\n').length

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center gap-4 px-5 py-3 border-b border-slate-700/50 bg-slate-900/40">
        <div className="flex items-center gap-1.5">
          <span className="text-green-400 font-semibold text-sm">✓ Dockerfile ready</span>
        </div>
        <div className="flex items-center gap-4 ml-auto flex-wrap">
          {result?.attempts && (
            <MetaBadge label="attempts" value={result.attempts}
              color={result.attempts === 1 ? 'text-green-400' : 'text-yellow-400'} />
          )}
          {result?.build_time && (
            <MetaBadge label="build time" value={`${result.build_time}s`} color="text-blue-400" />
          )}
          {result?.image_name && (
            <MetaBadge label="image" value={result.image_name} color="text-purple-400" />
          )}
          <MetaBadge label="lines" value={lineCount} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/50">
        <button
          onClick={() => setActiveTab('dockerfile')}
          className={`px-5 py-2.5 text-xs font-mono transition-colors ${
            activeTab === 'dockerfile'
              ? 'text-white border-b-2 border-blue-500 bg-slate-800/30'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Dockerfile
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 px-4 py-2 bg-slate-900/30 border-b border-slate-700/30">
        <CopyButton text={dockerfile} />
        <DownloadButton text={dockerfile} filename="Dockerfile" />
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <div className="relative">
          {/* Line numbers */}
          <div className="flex">
            <div className="select-none text-right pr-4 py-4 pl-4 text-slate-600 text-xs font-mono leading-6 border-r border-slate-700/50 min-w-[3rem]">
              {dockerfile.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre
              className="flex-1 p-4 text-xs font-mono leading-6 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: highlighted }}
              style={{ margin: 0, background: 'transparent' }}
            />
          </div>
        </div>
      </div>

      {/* hljs theme inline override */}
      <style>{`
        .hljs-keyword { color: #60a5fa; }
        .hljs-string  { color: #34d399; }
        .hljs-comment { color: #6b7280; font-style: italic; }
        .hljs-number  { color: #f9a8d4; }
        .hljs-literal { color: #fb923c; }
        .hljs-variable { color: #e2e8f0; }
        pre { color: #e2e8f0; }
      `}</style>
    </div>
  )
}
