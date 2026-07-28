import { lazy, Suspense, useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { SupabaseSetup } from './pages/SupabaseSetup';
import { useEmpresa } from './lib/empresa';
import { Login } from './pages/Login';
import { CambioClaveInicial } from './pages/CambioClaveInicial';
import { usePermisos } from './lib/permisos';
import { ModuleErrorBoundary } from './components/ModuleErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })))
const Maquinaria = lazy(() => import('./pages/Maquinaria').then((module) => ({ default: module.Maquinaria })))
const Repuestos = lazy(() => import('./pages/Repuestos').then((module) => ({ default: module.Repuestos })))
const Auditorias = lazy(() => import('./pages/Auditorias').then((module) => ({ default: module.Auditorias })))
const Importar = lazy(() => import('./pages/Importar').then((module) => ({ default: module.Importar })))
const Clientes = lazy(() => import('./pages/Clientes').then((module) => ({ default: module.Clientes })))
const OrdenesTrabajo = lazy(() => import('./pages/OrdenesTrabajo').then((module) => ({ default: module.OrdenesTrabajo })))
const CRM = lazy(() => import('./pages/CRM').then((module) => ({ default: module.CRM })))
const WhatsApp = lazy(() => import('./pages/WhatsApp').then((module) => ({ default: module.WhatsApp })))
const IATecnica = lazy(() => import('./pages/IATecnica').then((module) => ({ default: module.IATecnica })))
const PersonasPagos = lazy(() => import('./pages/PersonasPagos').then((module) => ({ default: module.PersonasPagos })))
const RrhhPersonas = lazy(() => import('./pages/RrhhPersonas').then((module) => ({ default: module.RrhhPersonas })))
const RrhhContratos = lazy(() => import('./pages/RrhhContratos').then((module) => ({ default: module.RrhhContratos })))
const RrhhAusencias = lazy(() => import('./pages/RrhhAusencias').then((module) => ({ default: module.RrhhAusencias })))
const RrhhDocumentos = lazy(() => import('./pages/RrhhDocumentos').then((module) => ({ default: module.RrhhDocumentos })))
const GoogleAds = lazy(() => import('./pages/GoogleAds').then((module) => ({ default: module.GoogleAds })))
const EmpresasAsociadas = lazy(() => import('./pages/EmpresasAsociadas').then((module) => ({ default: module.EmpresasAsociadas })))
const FlotaVehiculos = lazy(() => import('./pages/FlotaVehiculos').then((module) => ({ default: module.FlotaVehiculos })))
const PublicacionesProductos = lazy(() => import('./pages/PublicacionesProductos').then((module) => ({ default: module.PublicacionesProductos })))
const EppRopa = lazy(() => import('./pages/EppRopa').then((module) => ({ default: module.EppRopa })))
const UsuariosPermisos = lazy(() => import('./pages/UsuariosPermisos').then((module) => ({ default: module.UsuariosPermisos })))

function CargandoModulo() {
 return <div className="flex min-h-[50vh] items-center justify-center"><div className="text-center"><div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /><p className="text-sm font-semibold text-slate-500">Abriendo sección...</p></div></div>
}

function SinModulos() {
 return <div className="flex min-h-[60vh] items-center justify-center">
  <div className="max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
   <h2 className="text-2xl font-black text-amber-950">Sin secciones asignadas</h2>
   <p className="mt-3 leading-6 text-amber-900">Tu cuenta está activa, pero todavía no tiene secciones habilitadas para esta empresa. Solicita a un administrador que configure tus permisos.</p>
  </div>
 </div>
}

function DocumentosComerciales({ modo }: { modo: 'presupuesto' | 'cotizacion' }) {
 const { loading, activeEmpresa, activeEmpresaId, userEmail } = useEmpresa()
 const isPresupuesto = modo === 'presupuesto'
 const titulo = isPresupuesto ? 'Presupuestos' : 'Cotizaciones'

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
 const { loading, userEmail, activeEmpresa, requiresPasswordChange, refreshEmpresa } = useEmpresa()
 const { loading: permissionsLoading, hasPagePermission, firstAllowedPage } = usePermisos()

 useEffect(() => {
  if (!loading && !permissionsLoading && userEmail && activeEmpresa && !hasPagePermission(page) && firstAllowedPage) {
   setPage(firstAllowedPage)
  }
 }, [activeEmpresa, firstAllowedPage, hasPagePermission, loading, page, permissionsLoading, userEmail])

 if (loading || (userEmail && activeEmpresa && permissionsLoading)) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
   <div className="text-center">
    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-blue-400" />
    <p className="text-sm text-slate-400">Preparando TH Control...</p>
   </div>
  </div>
 }

 if (!userEmail) return <Login />

 if (requiresPasswordChange) return <CambioClaveInicial onComplete={refreshEmpresa} />

 if (!activeEmpresa) {
  return <Layout page="supabase" setPage={setPage}><SupabaseSetup /></Layout>
 }

 if (!hasPagePermission(page)) {
  return <Layout page={page} setPage={setPage}><SinModulos /></Layout>
 }

 return <Layout page={page} setPage={setPage}><ModuleErrorBoundary key={page} section={page}><Suspense fallback={<CargandoModulo />}>
  {page==='dashboard' && <Dashboard/>}
  {page==='supabase' && <SupabaseSetup/>}
  {page==='clientes' && <Clientes/>}
  {page==='empresas-asociadas' && <EmpresasAsociadas/>}
  {page==='presupuestos' && <DocumentosComerciales modo="presupuesto"/>}
  {page==='cotizaciones' && <DocumentosComerciales modo="cotizacion"/>}
  {page==='publicaciones-productos' && <PublicacionesProductos/>}
  {page==='ordenes' && <OrdenesTrabajo/>}
  {page==='crm' && <CRM/>}
  {page==='whatsapp' && <WhatsApp/>}
  {page==='ia' && <IATecnica/>}
  {page==='rrhh-personas' && <RrhhPersonas/>}
  {page==='rrhh-contratos' && <RrhhContratos/>}
  {page==='rrhh-ausencias' && <RrhhAusencias/>}
  {page==='rrhh-documentos' && <RrhhDocumentos/>}
  {page==='personas-pagos' && <PersonasPagos/>}
  {page==='flota-vehiculos' && <FlotaVehiculos/>}
  {page==='google-ads' && <GoogleAds/>}
  {page==='maquinaria' && <Maquinaria/>}
  {page==='repuestos' && <Repuestos/>}
  {page==='epp-ropa' && <EppRopa/>}
  {page==='auditorias' && <Auditorias/>}
  {page==='importar' && <Importar/>}
  {page==='usuarios-permisos' && <UsuariosPermisos/>}
 </Suspense></ModuleErrorBoundary></Layout>
}
