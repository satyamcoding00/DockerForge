import { useState } from 'react'

const EXAMPLE_REPOS = [
  { label: 'fastapi/fastapi', url: 'https://github.com/tiangolo/fastapi' },
  { label: 'expressjs/express', url: 'https://github.com/expressjs/express' },
  { label: 'pallets/flask', url: 'https://github.com/pallets/flask' },
  { label: 'gin-gonic/gin', url: 'https://github.com/gin-gonic/gin' },
]

function isValidGithubUrl(url) {
  try {
    const u = new URL(url)
    return (u.hostname === 'github.com' && u.pathname.split('/').filter(Boolean).length >= 2)
  } catch {
    return false
  }
}

export default function URLInput({ onSubmit, loading }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Please enter a GitHub repository URL')
      return
    }
    if (!isValidGithubUrl(trimmed)) {
      setError('Must be a valid GitHub URL, e.g. https://github.com/user/repo')
      return
    }
    setError('')
    onSubmit(trimmed)
  }

  const handleExample = (exampleUrl) => {
    setUrl(exampleUrl)
    setError('')
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError('') }}
            placeholder="https://github.com/username/repository"
            disabled={loading}
            className={`w-full bg-slate-800/80 border ${error ? 'border-red-500/60' : 'border-slate-600/60'}
              rounded-xl pl-11 pr-4 py-4 text-sm text-slate-100 placeholder-slate-500
              focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30
              disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
          />
        </div>

        {error && (
          <p className="text-red-400 text-xs pl-1">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40
            disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl
            transition-all duration-200 flex items-center justify-center gap-2 text-sm"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Generating...
            </>
          ) : (
            <>
              <span>🐳</span>
              Generate Dockerfile
            </>
          )}
        </button>
      </form>

      <div className="mt-5">
        <p className="text-xs text-slate-500 mb-2">Try an example:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_REPOS.map(({ label, url: exUrl }) => (
            <button
              key={label}
              onClick={() => handleExample(exUrl)}
              disabled={loading}
              className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600/50
                text-slate-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40
                disabled:cursor-not-allowed font-mono"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
