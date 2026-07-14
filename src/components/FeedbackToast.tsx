import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

type FeedbackTone = 'success' | 'info' | 'warning' | 'error'

type FeedbackToastProps = {
  message: string
  onClose: () => void
  tone?: FeedbackTone | 'auto'
}

function inferTone(message: string): FeedbackTone {
  if (/error|fall[oó]|no se pudo|no se pudieron|inv[aá]lid|rechaz|denegad|problema/i.test(message)) return 'error'
  if (/no hay|falta|primero|selecciona|completa|ingresa|a[uú]n|antes de|no puede|no se puede|requiere/i.test(message)) return 'warning'
  if (/guardad|cread|actualizad|eliminad|registrad|generad|copiad|aprobado|pagado|enviado|activad|descargad|subid|cerrad|asociad|recuperad|agregad|completad/i.test(message)) return 'success'
  return 'info'
}

const styles: Record<FeedbackTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  info: 'border-blue-200 bg-blue-50 text-blue-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-red-200 bg-red-50 text-red-950',
}

const icons = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  error: AlertCircle,
}

export function FeedbackToast({ message, onClose, tone = 'auto' }: FeedbackToastProps) {
  if (!message) return null

  const resolvedTone = tone === 'auto' ? inferTone(message) : tone
  const Icon = icons[resolvedTone]

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex justify-center sm:inset-x-auto sm:bottom-6 sm:right-6 sm:block">
      <div
        role={resolvedTone === 'error' ? 'alert' : 'status'}
        aria-live={resolvedTone === 'error' ? 'assertive' : 'polite'}
        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border p-4 shadow-2xl shadow-slate-950/15 ${styles[resolvedTone]}`}
      >
        <Icon className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-semibold leading-5">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 rounded-lg p-1.5 opacity-60 transition hover:bg-black/5 hover:opacity-100"
          aria-label="Cerrar mensaje"
        >
          <X size={17} />
        </button>
      </div>
    </div>
  )
}
