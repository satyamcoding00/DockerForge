import { useState, useEffect, useRef, useCallback } from 'react'

const STEP_ORDER = [
  'CLONING', 'SCANNING', 'GENERATING', 'BUILDING',
  'RETRYING', 'RUNNING', 'COMPLETE',
]

const TERMINAL_STEPS = new Set([
  'COMPLETE', 'ERROR', 'RUN_SUCCESS', 'RUN_FAILED',
])

export function useSSE(jobId) {
  const [logs, setLogs] = useState([])
  const [currentStep, setCurrentStep] = useState(null)
  const [stepStatuses, setStepStatuses] = useState({})
  const [dockerfile, setDockerfile] = useState(null)
  const [result, setResult] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('idle') // idle | connecting | connected | closed | error
  const esRef = useRef(null)
  const reconnectRef = useRef(false)

  const connect = useCallback((id) => {
    if (esRef.current) {
      esRef.current.close()
    }
    setConnectionStatus('connecting')
    const es = new EventSource(`/api/stream/${id}`)
    esRef.current = es

    es.onopen = () => setConnectionStatus('connected')

    es.onmessage = (e) => {
      let event
      try {
        event = JSON.parse(e.data)
      } catch {
        return
      }

      const { step, message, data } = event

      if (step === 'LOG') {
        setLogs(prev => [...prev, { type: 'log', text: message, ts: Date.now() }])
        return
      }

      // Add to log as a status line
      setLogs(prev => [...prev, { type: 'step', step, text: message, ts: Date.now() }])

      // Update current step
      setCurrentStep(step)

      // Update step status map
      setStepStatuses(prev => {
        const next = { ...prev }
        // Mark previous active steps as done
        for (const s of STEP_ORDER) {
          if (next[s] === 'active' && s !== step) {
            next[s] = 'done'
          }
        }
        if (step === 'BUILD_FAILED' || step === 'RUN_FAILED') {
          next[step] = 'failed'
          next['BUILDING'] = 'failed'
        } else if (step === 'BUILD_SUCCESS') {
          next['BUILDING'] = 'done'
        } else if (step === 'RUN_SUCCESS') {
          next['RUNNING'] = 'done'
        } else if (step === 'RETRYING') {
          next['RETRYING'] = 'active'
          next['BUILDING'] = 'retrying'
        } else if (step === 'COMPLETE') {
          next['COMPLETE'] = 'done'
          if (data?.dockerfile) setDockerfile(data.dockerfile)
          setResult(data)
        } else if (step === 'ERROR') {
          next[step] = 'failed'
          if (data?.dockerfile) setDockerfile(data.dockerfile)
        } else {
          next[step] = 'active'
        }
        return next
      })

      if (TERMINAL_STEPS.has(step) || step === 'ERROR') {
        setConnectionStatus('closed')
        es.close()
      }
    }

    es.onerror = () => {
      setConnectionStatus('error')
      es.close()
      // Reconnect once
      if (!reconnectRef.current) {
        reconnectRef.current = true
        setTimeout(() => connect(id), 2000)
      }
    }
  }, [])

  useEffect(() => {
    if (!jobId) return
    reconnectRef.current = false
    setLogs([])
    setCurrentStep(null)
    setStepStatuses({})
    setDockerfile(null)
    setResult(null)
    connect(jobId)
    return () => {
      esRef.current?.close()
    }
  }, [jobId, connect])

  return { logs, currentStep, stepStatuses, dockerfile, result, connectionStatus }
}
