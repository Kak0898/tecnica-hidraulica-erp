import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = { children: ReactNode; section: string }
type State = { error: Error | null }

export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TH Control] Error al abrir sección', { section: this.props.section, error, info })
  }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="flex min-h-[55vh] items-center justify-center p-5">
      <div className="max-w-xl rounded-2xl border border-red-200 bg-red-50 p-7 text-center shadow-sm">
        <AlertTriangle className="mx-auto text-red-600" size={34} />
        <h2 className="mt-3 text-2xl font-black text-red-950">No se pudo abrir esta sección</h2>
        <p className="mt-3 leading-6 text-red-900">El sistema encontró un dato que no pudo procesar. La información guardada no se eliminó.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 font-black text-white">
          <RefreshCw size={17} />Recargar y volver a intentar
        </button>
      </div>
    </div>
  }
}
