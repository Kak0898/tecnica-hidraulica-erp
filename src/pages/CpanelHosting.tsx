import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, ExternalLink, Globe2, RefreshCw, ServerCog, ShieldAlert, Unlock } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'

const CPANEL_URL = 'https://cpanel.tecnicahidraulica.cl/'
const SUPPORT_URL = 'https://www.hosting.cl/soporte-hosting'
const DOMAIN = 'tecnicahidraulica.cl'
const LOAD_TIMEOUT_MS = 10000

type PanelMode = 'cpanel' | 'support'

export function CpanelHosting() {
  const [mode, setMode] = useState<PanelMode>('cpanel')
  const [frameKey, setFrameKey] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [message, setMessage] = useState('')

  const frameUrl = useMemo(() => mode === 'cpanel' ? CPANEL_URL : SUPPORT_URL, [mode])

  useEffect(() => {
    setLoaded(false)
    setTimedOut(false)
    const timer = window.setTimeout(() => {
      if (mode === 'cpanel') {
        setTimedOut(true)
        setMode('support')
        setMessage('cPanel no respondió a tiempo. Te llevé al soporte de hosting para desbloquear la IP.')
      }
    }, LOAD_TIMEOUT_MS)

    return () => window.clearTimeout(timer)
  }, [frameKey, mode])

  async function copyDomain() {
    try {
      await navigator.clipboard.writeText(DOMAIN)
      setMessage(`Dominio copiado: ${DOMAIN}`)
    } catch {
      setMessage(`Dominio para ingresar: ${DOMAIN}`)
    }
  }

  function reloadCpanel() {
    setMode('cpanel')
    setFrameKey((current) => current + 1)
  }

  function openSupport() {
    window.open(SUPPORT_URL, '_blank', 'noopener,noreferrer')
  }

  function openCpanel() {
    window.open(CPANEL_URL, '_blank', 'noopener,noreferrer')
  }

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-3xl font-black text-slate-950">cPanel y hosting</h2>
        <p className="mt-2 text-slate-600">Acceso rapido al panel, soporte y desbloqueo de IP para el dominio {DOMAIN}.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={reloadCpanel} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700">
          <RefreshCw size={17} /> Reintentar cPanel
        </button>
        <button onClick={openCpanel} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm hover:bg-slate-50">
          <ExternalLink size={17} /> Abrir cPanel
        </button>
      </div>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <Card>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><ServerCog size={24} /></div>
          <div>
            <h3 className="text-lg font-black text-slate-950">Acceso al panel</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Si el panel no carga o el firewall bloquea tu IP, el sistema cambia automaticamente al soporte del proveedor.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Dominio para desbloqueo</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="break-all text-lg font-black text-slate-950">{DOMAIN}</p>
              <button onClick={copyDomain} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-white hover:bg-slate-800">
                <Copy size={15} /> Copiar
              </button>
            </div>
          </div>

          <button onClick={() => setMode('support')} className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left text-emerald-950 hover:bg-emerald-100">
            <span className="flex items-center gap-3 font-black"><Unlock size={20} /> Ir a desbloquear IP</span>
            <ArrowRight size={18} />
          </button>

          <button onClick={openSupport} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-800 hover:bg-slate-50">
            <span className="flex items-center gap-3 font-black"><ExternalLink size={20} /> Abrir soporte en pestaña</span>
            <ArrowRight size={18} />
          </button>

          <button onClick={reloadCpanel} className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left text-blue-950 hover:bg-blue-100">
            <span className="flex items-center gap-3 font-black"><Globe2 size={20} /> Volver a cPanel</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-1 shrink-0 text-amber-700" size={24} />
          <div>
            <h3 className="font-black text-amber-950">Sobre la automatizacion del desbloqueo</h3>
            <p className="mt-2 text-sm leading-6 text-amber-900">Por seguridad, una pagina externa no permite que el ERP escriba y presione botones dentro de su formulario si no entrega una API oficial. Por eso este modulo deja el dominio listo, te lleva al soporte cuando cPanel falla y permite volver al panel despues de desbloquear la IP.</p>
          </div>
        </div>
      </Card>
    </div>

    {timedOut && <Card className="border-red-200 bg-red-50">
      <div className="flex items-start gap-3 text-red-950">
        <AlertTriangle className="mt-1 shrink-0" size={22} />
        <div>
          <h3 className="font-black">cPanel no respondio dentro del tiempo esperado</h3>
          <p className="mt-1 text-sm leading-6">Probablemente el firewall del hosting bloqueo la IP o el panel esta lento. Usa el formulario de soporte, ingresa el dominio {DOMAIN} y despues vuelve a intentar cPanel.</p>
        </div>
      </div>
    </Card>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          {loaded ? <CheckCircle2 className="text-emerald-600" size={18} /> : <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />}
          <div>
            <p className="text-sm font-black text-slate-950">{mode === 'cpanel' ? 'cPanel Técnica Hidráulica' : 'Soporte Hosting.cl'}</p>
            <p className="break-all text-xs text-slate-500">{frameUrl}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyDomain} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"><Copy size={14} /> Copiar dominio</button>
          <button onClick={mode === 'cpanel' ? openCpanel : openSupport} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"><ExternalLink size={14} /> Abrir afuera</button>
        </div>
      </div>
      <iframe
        key={`${mode}-${frameKey}`}
        title={mode === 'cpanel' ? 'cPanel Tecnica Hidraulica' : 'Soporte Hosting'}
        src={frameUrl}
        onLoad={() => setLoaded(true)}
        referrerPolicy="no-referrer"
        className="h-[72vh] min-h-[640px] w-full border-0"
      />
    </div>

    <FeedbackToast message={message} onClose={() => setMessage('')} />
  </div>
}
