import { useEffect, useState, useSyncExternalStore } from 'react'
import { RefreshCw, ServerOff, WifiOff } from 'lucide-react'
import { checkConnection, getConnectionIssue, monitorConnection, subscribeToConnection } from '../lib/intranet-connection'

export function ConnectionNotice() {
  const issue = useSyncExternalStore(subscribeToConnection, getConnectionIssue)
  const [checking, setChecking] = useState(false)
  useEffect(monitorConnection, [])

  async function retry() {
    setChecking(true)
    try {
      await checkConnection()
    } finally {
      setChecking(false)
    }
  }

  if (!issue) return null
  const offline = issue === 'offline'
  const Icon = offline ? WifiOff : ServerOff

  return (
    <aside className="fixed right-3 bottom-3 left-3 z-[100] flex max-w-lg items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-md sm:left-auto">
      <Icon className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm" role="alert">
        <p className="font-bold">{offline ? 'Sin conexión a internet o a la red' : 'El servidor de intranet no responde'}</p>
        <p>{offline ? 'Revisa tu conexión antes de guardar.' : 'Revisa el acceso a la red de la intranet o a Tailscale antes de guardar.'}</p>
      </div>
      <button type="button" onClick={() => void retry()} disabled={checking} aria-label="Comprobar conexión"
        title="Comprobar conexión" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-300 bg-white">
        <RefreshCw size={17} className={checking ? 'animate-spin' : ''} />
      </button>
    </aside>
  )
}
