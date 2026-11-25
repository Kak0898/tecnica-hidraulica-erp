export const API_URL = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

type ConnectionIssue = 'offline' | 'server' | null
let issue: ConnectionIssue = navigator.onLine ? null : 'offline'
let pendingCheck: Promise<void> | undefined
const listeners = new Set<() => void>()

function setIssue(next: ConnectionIssue) {
  if (issue === next) return
  issue = next
  listeners.forEach((listener) => listener())
}

export function getConnectionIssue() {
  return issue
}

export function subscribeToConnection(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function checkConnection() {
  if (!navigator.onLine) {
    setIssue('offline')
    return Promise.resolve()
  }
  if (pendingCheck) return pendingCheck

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 5000)
  pendingCheck = (async () => {
    try {
      const response = await fetch(`${API_URL}/health`, { cache: 'no-store', signal: controller.signal })
      const health = response.ok ? await response.json() : null
      setIssue(navigator.onLine ? (health?.ok === true && health.schema_ready === true ? null : 'server') : 'offline')
    } catch {
      setIssue(navigator.onLine ? 'server' : 'offline')
    } finally {
      window.clearTimeout(timeout)
      pendingCheck = undefined
    }
  })()
  return pendingCheck
}

export function reportConnectionFailure() {
  setIssue(navigator.onLine ? 'server' : 'offline')
  void checkConnection()
}

export function monitorConnection() {
  const checkWhenVisible = () => {
    if (!document.hidden) void checkConnection()
  }
  void checkConnection()
  const interval = window.setInterval(checkWhenVisible, 15_000)
  window.addEventListener('online', checkConnection)
  window.addEventListener('offline', checkConnection)
  document.addEventListener('visibilitychange', checkWhenVisible)
  return () => {
    window.clearInterval(interval)
    window.removeEventListener('online', checkConnection)
    window.removeEventListener('offline', checkConnection)
    document.removeEventListener('visibilitychange', checkWhenVisible)
  }
}
