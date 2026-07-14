import { ReactNode, useState } from 'react';
import { BarChart3, Boxes, Building2, ChevronDown, ClipboardCheck, FileSpreadsheet, Gauge, HardHat, LogOut, Menu, MessageCircle, PackageSearch, PanelLeftClose, ReceiptText, Settings, Sparkles, UsersRound, Wrench, X } from 'lucide-react';
import { useEmpresa } from '../lib/empresa';
import { supabase } from '../lib/supabase';

const groups = [
  {
    label: 'Visión general',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: Gauge },
      { key: 'google-ads', label: 'Google Ads', icon: BarChart3 },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { key: 'clientes', label: 'Clientes', icon: UsersRound },
      { key: 'cotizaciones', label: 'Cotizaciones', icon: ReceiptText },
      { key: 'ordenes', label: 'Órdenes de trabajo', icon: Wrench },
      { key: 'crm', label: 'CRM', icon: Building2 },
      { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    ],
  },
  {
    label: 'Administración',
    items: [
      { key: 'personas-pagos', label: 'Personas y pagos', icon: HardHat },
      { key: 'maquinaria', label: 'Maquinaria', icon: Boxes },
      { key: 'repuestos', label: 'Repuestos', icon: PackageSearch },
      { key: 'auditorias', label: 'Auditorías', icon: ClipboardCheck },
      { key: 'importar', label: 'Importar Excel', icon: FileSpreadsheet },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'ia', label: 'IA Técnica', icon: Sparkles },
      { key: 'supabase', label: 'Configuración', icon: Settings },
    ],
  },
];

export function Layout({ page, setPage, children }: { page: string; setPage: (p:string)=>void; children: ReactNode }) {
  const { loading, userEmail, empresas, activeEmpresa, activeEmpresaId, setEmpresaActiva } = useEmpresa()
  const [mobileOpen, setMobileOpen] = useState(false)

  function navigate(key: string) {
    setPage(key)
    setMobileOpen(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const sidebar = (
    <aside className="flex h-full w-[286px] flex-col bg-[#091525] text-white">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
        <img src="/modulos/cotizaciones/assets/th-logo.jpeg" alt="TH" className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/15" />
        <div className="min-w-0">
          <h1 className="font-black tracking-tight">TH Control</h1>
          <p className="truncate text-xs text-slate-400">Técnica Hidráulica</p>
        </div>
        <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-white/10 lg:hidden" aria-label="Cerrar menú"><X size={20} /></button>
      </div>

      <div className="border-b border-white/10 p-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Building2 size={16} className="text-cyan-300" />
            <span className="truncate">{loading ? 'Cargando empresa' : activeEmpresa?.nombre || 'Sin empresa'}</span>
          </div>
          {empresas.length > 1 ? (
            <div className="relative mt-3">
              <select className="w-full appearance-none rounded-lg border border-white/10 bg-[#07111f] px-3 py-2 pr-8 text-xs text-white" value={activeEmpresaId} onChange={(event) => setEmpresaActiva(event.target.value)}>
                {empresas.map((item) => item.empresas && <option key={item.empresas.id} value={item.empresas.id}>{item.empresas.nombre}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            </div>
          ) : <p className="mt-2 truncate text-xs text-slate-400">{userEmail}</p>}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                return <button key={item.key} onClick={() => navigate(item.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${page === item.key ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30' : 'text-slate-300 hover:bg-white/7 hover:text-white'}`}>
                  <Icon size={18} />
                  {item.label}
                </button>
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 min-w-0 px-2">
          <p className="truncate text-xs font-semibold text-slate-200">{userEmail}</p>
          <p className="mt-1 text-[11px] text-emerald-400">Sesión protegida</p>
        </div>
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-400 transition hover:bg-red-500/10 hover:text-red-300">
          <LogOut size={18} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )

  return <div className="min-h-screen bg-[#f4f7fb] lg:flex">
    <div className="fixed inset-y-0 left-0 z-50 hidden lg:block">{sidebar}</div>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden">
      <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />
      <div className="relative h-full">{sidebar}</div>
    </div>}

    <div className="min-w-0 flex-1 lg:pl-[286px]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="rounded-xl border border-slate-200 p-2.5 text-slate-700" aria-label="Abrir menú"><Menu size={21} /></button>
        <span className="font-black text-slate-900">TH Control</span>
        <PanelLeftClose className="text-slate-300" size={21} />
      </header>
      <main className="min-w-0 p-4 sm:p-6 xl:p-8">{children}</main>
    </div>
  </div>;
}
