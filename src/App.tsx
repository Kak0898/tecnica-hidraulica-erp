import { useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Maquinaria } from './pages/Maquinaria';
import { Repuestos } from './pages/Repuestos';
import { Auditorias } from './pages/Auditorias';
import { Importar } from './pages/Importar';
import { SupabaseSetup } from './pages/SupabaseSetup';
import { Clientes } from './pages/Clientes';
import { OrdenesTrabajo } from './pages/OrdenesTrabajo';
import { CRM } from './pages/CRM';
import { useEmpresa } from './lib/empresa';
import { WhatsApp } from './pages/WhatsApp';
import { IATecnica } from './pages/IATecnica';
import { PersonasPagos } from './pages/PersonasPagos';
import { GoogleAds } from './pages/GoogleAds';
import { Login } from './pages/Login';
import { EmpresasAsociadas } from './pages/EmpresasAsociadas';
import { FlotaVehiculos } from './pages/FlotaVehiculos';

function DocumentosComerciales({ modo }: { modo: 'presupuesto' | 'cotizacion' }) {
 const { loading, activeEmpresa, activeEmpresaId, userEmail } = useEmpresa()
 const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
 const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
 const isPresupuesto = modo === 'presupuesto'
 const titulo = isPresupuesto ? 'Presupuestos' : 'Cotizaciones'

 if (supabaseUrl && supabaseAnonKey) {
  window.localStorage.setItem('ERP_SUPABASE_URL', supabaseUrl)
  window.localStorage.setItem('ERP_SUPABASE_ANON_KEY', supabaseAnonKey)
 }

 return <div className="space-y-4">
  <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
   <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
    <div>
     <h2 className="text-2xl font-bold text-slate-950">{titulo}</h2>
     <p className="mt-1 text-sm text-slate-600">
      {loading
       ? 'Cargando empresa activa...'
       : activeEmpresa
       ? isPresupuesto
         ? `Preparando presupuestos como ${activeEmpresa.razon_social || activeEmpresa.nombre}.`
         : `Emitiendo cotizaciones como ${activeEmpresa.razon_social || activeEmpresa.nombre}.`
        : 'Sin empresa activa. Configura una empresa para emitir documentos con logo y datos comerciales.'}
     </p>
    </div>
    <div className="rounded bg-slate-100 px-3 py-2 text-sm text-slate-700">
     {userEmail || 'Sin sesión'}
    </div>
   </div>
  </div>

  <div className="h-[calc(100vh-10rem)] min-h-[720px] overflow-hidden rounded border border-slate-200 bg-white">
   <iframe
    key={`${activeEmpresaId || 'sin-empresa'}-${modo}`}
    title={`${titulo} ERP`}
    src={`/modulos/cotizaciones/index.html?modo=${modo}`}
    className="h-full w-full border-0"
   />
  </div>
 </div>
}

export default function App(){
 const [page,setPage]=useState('dashboard');
 const { loading, userEmail, activeEmpresa } = useEmpresa()

 if (loading) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
   <div className="text-center">
    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-blue-400" />
    <p className="text-sm text-slate-400">Preparando TH Control...</p>
   </div>
  </div>
 }

 if (!userEmail) return <Login />

 if (!activeEmpresa) {
  return <Layout page="supabase" setPage={setPage}><SupabaseSetup /></Layout>
 }

 return <Layout page={page} setPage={setPage}>
  {page==='dashboard' && <Dashboard/>}
  {page==='supabase' && <SupabaseSetup/>}
  {page==='clientes' && <Clientes/>}
  {page==='empresas-asociadas' && <EmpresasAsociadas/>}
  {page==='presupuestos' && <DocumentosComerciales modo="presupuesto"/>}
  {page==='cotizaciones' && <DocumentosComerciales modo="cotizacion"/>}
  {page==='ordenes' && <OrdenesTrabajo/>}
  {page==='crm' && <CRM/>}
  {page==='whatsapp' && <WhatsApp/>}
  {page==='ia' && <IATecnica/>}
  {page==='personas-pagos' && <PersonasPagos/>}
  {page==='flota-vehiculos' && <FlotaVehiculos/>}
  {page==='google-ads' && <GoogleAds/>}
  {page==='maquinaria' && <Maquinaria/>}
  {page==='repuestos' && <Repuestos/>}
  {page==='auditorias' && <Auditorias/>}
  {page==='importar' && <Importar/>}
 </Layout>
}
