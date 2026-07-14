import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Eye, Link2, Megaphone, MessageSquare, Package, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { Card } from '../components/Card'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'

type ProductStatus = 'borrador' | 'publicado' | 'pausado' | 'vendido'
type PublicationStatus = 'activa' | 'pausada' | 'finalizada' | 'eliminada'
type ProductType = 'maquinaria' | 'repuesto' | 'servicio' | 'vehiculo' | 'otro'

type Publication = {
  id: string
  empresa_id: string
  producto_id: string
  plataforma: string
  titulo?: string | null
  url: string
  estado: PublicationStatus
  precio_publicado?: number | null
  moneda: 'CLP' | 'UF' | 'USD'
  fecha_publicacion?: string | null
  fecha_vencimiento?: string | null
  visitas: number
  consultas: number
  notas?: string | null
}

type Product = {
  id: string
  empresa_id: string
  tipo: ProductType
  sku?: string | null
  nombre: string
  descripcion?: string | null
  precio?: number | null
  moneda: 'CLP' | 'UF' | 'USD'
  stock?: number | null
  imagen_url?: string | null
  estado: ProductStatus
  notas?: string | null
  publicaciones_productos?: Publication[]
}

const platforms = [
  ['sitio_web', 'Sitio web'],
  ['mercado_libre', 'Mercado Libre'],
  ['facebook_marketplace', 'Facebook Marketplace'],
  ['instagram', 'Instagram'],
  ['yapo', 'Yapo'],
  ['linkedin', 'LinkedIn'],
  ['google_business', 'Google Business'],
  ['whatsapp_catalogo', 'WhatsApp Catálogo'],
  ['tiktok', 'TikTok'],
  ['chileautos', 'Chileautos'],
  ['otra', 'Otra plataforma'],
] as const

const emptyProduct = {
  tipo: 'maquinaria' as ProductType,
  sku: '',
  nombre: '',
  descripcion: '',
  precio: '',
  moneda: 'CLP' as Product['moneda'],
  stock: '1',
  imagen_url: '',
  estado: 'borrador' as ProductStatus,
  notas: '',
}

const emptyPublication = {
  producto_id: '',
  plataforma: 'sitio_web',
  titulo: '',
  url: '',
  estado: 'activa' as PublicationStatus,
  precio_publicado: '',
  moneda: 'CLP' as Publication['moneda'],
  fecha_publicacion: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: '',
  visitas: '0',
  consultas: '0',
  notas: '',
}

const productTypeLabels: Record<ProductType, string> = {
  maquinaria: 'Maquinaria',
  repuesto: 'Repuesto',
  servicio: 'Servicio',
  vehiculo: 'Vehículo',
  otro: 'Otro',
}

const productStatusLabels: Record<ProductStatus, string> = {
  borrador: 'Borrador',
  publicado: 'Publicado',
  pausado: 'Pausado',
  vendido: 'Vendido',
}

const publicationStatusLabels: Record<PublicationStatus, string> = {
  activa: 'Activa',
  pausada: 'Pausada',
  finalizada: 'Finalizada',
  eliminada: 'Eliminada',
}

function nullable(value: string) { return value.trim() || null }
function platformLabel(value: string) { return platforms.find(([key]) => key === value)?.[1] || value }
function formatMoney(value?: number | null, currency = 'CLP') {
  if (value === null || value === undefined) return 'Sin precio'
  if (currency === 'CLP') return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value)
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value)} ${currency}`
}
function moduleError(message: string) {
  return /productos_comerciales|publicaciones_productos|schema cache|could not find/i.test(message)
    ? 'El módulo aún no está activado en la base de datos. Ejecuta el SQL 12_publicaciones_productos.sql en Supabase.'
    : message
}
function productStatusClass(status: ProductStatus) {
  if (status === 'publicado') return 'bg-emerald-50 text-emerald-700'
  if (status === 'pausado') return 'bg-amber-50 text-amber-700'
  if (status === 'vendido') return 'bg-blue-50 text-blue-700'
  return 'bg-slate-100 text-slate-600'
}
function publicationStatusClass(status: PublicationStatus) {
  if (status === 'activa') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
  if (status === 'pausada') return 'bg-amber-50 text-amber-700 ring-amber-600/10'
  return 'bg-slate-100 text-slate-600 ring-slate-500/10'
}

export function PublicacionesProductos() {
  const { activeEmpresaId } = useEmpresa()
  const [products, setProducts] = useState<Product[]>([])
  const [productForm, setProductForm] = useState(emptyProduct)
  const [publicationForm, setPublicationForm] = useState(emptyPublication)
  const [editingProductId, setEditingProductId] = useState('')
  const [editingPublicationId, setEditingPublicationId] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [showPublicationForm, setShowPublicationForm] = useState(false)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('todas')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase
      .from('productos_comerciales')
      .select('*, publicaciones_productos(*)')
      .eq('empresa_id', activeEmpresaId)
      .order('created_at', { ascending: false })
    if (error) { setProducts([]); setMessage(moduleError(error.message)) } else setProducts((data || []) as Product[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [activeEmpresaId])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      const publications = product.publicaciones_productos || []
      const matchesPlatform = platformFilter === 'todas' || publications.some((item) => item.plataforma === platformFilter)
      const matchesTerm = !term || [product.nombre, product.sku, product.descripcion, product.tipo, ...publications.flatMap((item) => [item.titulo, item.url, platformLabel(item.plataforma)])]
        .some((value) => String(value || '').toLowerCase().includes(term))
      return matchesPlatform && matchesTerm
    })
  }, [products, search, platformFilter])

  const activeLinks = products.flatMap((product) => product.publicaciones_productos || []).filter((item) => item.estado === 'activa')
  const publishedProducts = products.filter((product) => (product.publicaciones_productos || []).some((item) => item.estado === 'activa')).length
  const withoutLinks = products.filter((product) => !(product.publicaciones_productos || []).some((item) => item.estado === 'activa')).length

  function resetProductForm() {
    setProductForm(emptyProduct)
    setEditingProductId('')
    setShowProductForm(false)
  }

  function resetPublicationForm() {
    setPublicationForm(emptyPublication)
    setEditingPublicationId('')
    setShowPublicationForm(false)
  }

  function startProduct(product?: Product) {
    if (product) {
      setEditingProductId(product.id)
      setProductForm({
        tipo: product.tipo,
        sku: product.sku || '',
        nombre: product.nombre,
        descripcion: product.descripcion || '',
        precio: product.precio === null || product.precio === undefined ? '' : String(product.precio),
        moneda: product.moneda,
        stock: product.stock === null || product.stock === undefined ? '' : String(product.stock),
        imagen_url: product.imagen_url || '',
        estado: product.estado,
        notas: product.notas || '',
      })
    } else {
      setEditingProductId('')
      setProductForm(emptyProduct)
    }
    setShowProductForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startPublication(product?: Product, publication?: Publication) {
    if (publication) {
      setEditingPublicationId(publication.id)
      setPublicationForm({
        producto_id: publication.producto_id,
        plataforma: publication.plataforma,
        titulo: publication.titulo || '',
        url: publication.url,
        estado: publication.estado,
        precio_publicado: publication.precio_publicado === null || publication.precio_publicado === undefined ? '' : String(publication.precio_publicado),
        moneda: publication.moneda,
        fecha_publicacion: publication.fecha_publicacion || '',
        fecha_vencimiento: publication.fecha_vencimiento || '',
        visitas: String(publication.visitas || 0),
        consultas: String(publication.consultas || 0),
        notas: publication.notas || '',
      })
    } else {
      setEditingPublicationId('')
      setPublicationForm({ ...emptyPublication, producto_id: product?.id || products[0]?.id || '', precio_publicado: product?.precio === null || product?.precio === undefined ? '' : String(product.precio), moneda: product?.moneda || 'CLP' })
    }
    setShowPublicationForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault()
    if (!activeEmpresaId || !productForm.nombre.trim()) { setMessage('Ingresa el nombre del producto.'); return }
    setSaving(true); setMessage('')
    const payload = {
      empresa_id: activeEmpresaId,
      tipo: productForm.tipo,
      sku: nullable(productForm.sku),
      nombre: productForm.nombre.trim(),
      descripcion: nullable(productForm.descripcion),
      precio: productForm.precio === '' ? null : Math.max(0, Number(productForm.precio) || 0),
      moneda: productForm.moneda,
      stock: productForm.stock === '' ? null : Math.max(0, Number(productForm.stock) || 0),
      imagen_url: nullable(productForm.imagen_url),
      estado: productForm.estado,
      notas: nullable(productForm.notas),
    }
    const query = editingProductId
      ? supabase.from('productos_comerciales').update(payload).eq('id', editingProductId).eq('empresa_id', activeEmpresaId)
      : supabase.from('productos_comerciales').insert(payload)
    const { error } = await query
    setSaving(false)
    if (error) { setMessage(moduleError(error.message)); return }
    setMessage(editingProductId ? 'Producto actualizado.' : 'Producto agregado al catálogo.')
    resetProductForm(); await load()
  }

  async function savePublication(event: FormEvent) {
    event.preventDefault()
    if (!activeEmpresaId || !publicationForm.producto_id || !publicationForm.url.trim()) { setMessage('Selecciona un producto e ingresa el enlace de la publicación.'); return }
    let normalizedUrl = publicationForm.url.trim()
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`
    try { new URL(normalizedUrl) } catch { setMessage('El enlace de la publicación no es válido.'); return }
    setSaving(true); setMessage('')
    const payload = {
      empresa_id: activeEmpresaId,
      producto_id: publicationForm.producto_id,
      plataforma: publicationForm.plataforma,
      titulo: nullable(publicationForm.titulo),
      url: normalizedUrl,
      estado: publicationForm.estado,
      precio_publicado: publicationForm.precio_publicado === '' ? null : Math.max(0, Number(publicationForm.precio_publicado) || 0),
      moneda: publicationForm.moneda,
      fecha_publicacion: nullable(publicationForm.fecha_publicacion),
      fecha_vencimiento: nullable(publicationForm.fecha_vencimiento),
      visitas: Math.max(0, Math.round(Number(publicationForm.visitas) || 0)),
      consultas: Math.max(0, Math.round(Number(publicationForm.consultas) || 0)),
      notas: nullable(publicationForm.notas),
    }
    const query = editingPublicationId
      ? supabase.from('publicaciones_productos').update(payload).eq('id', editingPublicationId).eq('empresa_id', activeEmpresaId)
      : supabase.from('publicaciones_productos').insert(payload)
    const { error } = await query
    setSaving(false)
    if (error) { setMessage(moduleError(error.message)); return }
    setMessage(editingPublicationId ? 'Publicación actualizada.' : 'Enlace de publicación agregado.')
    resetPublicationForm(); await load()
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(`¿Eliminar ${product.nombre} y todos sus enlaces publicados?`)) return
    const { error } = await supabase.from('productos_comerciales').delete().eq('id', product.id).eq('empresa_id', activeEmpresaId)
    if (error) { setMessage(moduleError(error.message)); return }
    setMessage('Producto eliminado.'); await load()
  }

  async function removePublication(publication: Publication) {
    if (!window.confirm(`¿Eliminar el enlace de ${platformLabel(publication.plataforma)}?`)) return
    const { error } = await supabase.from('publicaciones_productos').delete().eq('id', publication.id).eq('empresa_id', activeEmpresaId)
    if (error) { setMessage(moduleError(error.message)); return }
    setMessage('Enlace eliminado.'); await load()
  }

  async function copyLinks(product?: Product) {
    const links = (product ? product.publicaciones_productos || [] : activeLinks).filter((item) => item.estado === 'activa')
    if (!links.length) { setMessage('No hay enlaces activos para copiar.'); return }
    const text = links.map((item) => `${platformLabel(item.plataforma)}: ${item.url}`).join('\n')
    try { await navigator.clipboard.writeText(text); setMessage(product ? `Enlaces de ${product.nombre} copiados.` : 'Todos los enlaces activos fueron copiados.') } catch { setMessage('No se pudieron copiar los enlaces desde este navegador.') }
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700"><Megaphone size={14} /> Comercial</div>
          <h2 className="text-3xl font-bold text-slate-950">Publicaciones de productos</h2>
          <p className="mt-2 max-w-3xl text-slate-600">Reúne cada producto y todos sus enlaces de venta en un solo lugar para saber dónde está publicado y qué canal genera consultas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void copyLinks()} disabled={!activeLinks.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-40"><Copy size={17} /> Copiar enlaces activos</button>
          <button onClick={() => startPublication()} disabled={!products.length} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 disabled:opacity-40"><Link2 size={17} /> Agregar enlace</button>
          <button onClick={() => startProduct()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm"><Plus size={17} /> Nuevo producto</button>
        </div>
      </div>

      {message && <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${/activado|error|válido|completa|ingresa|selecciona|pudieron/i.test(message) ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm font-medium text-slate-500">Productos</p><p className="mt-2 text-3xl font-black text-slate-950">{products.length}</p><p className="mt-1 text-xs text-slate-500">en el catálogo comercial</p></Card>
        <Card><p className="text-sm font-medium text-slate-500">Con publicación activa</p><p className="mt-2 text-3xl font-black text-emerald-600">{publishedProducts}</p><p className="mt-1 text-xs text-slate-500">productos visibles en canales</p></Card>
        <Card><p className="text-sm font-medium text-slate-500">Enlaces activos</p><p className="mt-2 text-3xl font-black text-blue-600">{activeLinks.length}</p><p className="mt-1 text-xs text-slate-500">en todas las plataformas</p></Card>
        <Card><p className="text-sm font-medium text-slate-500">Sin publicar</p><p className={`mt-2 text-3xl font-black ${withoutLinks ? 'text-amber-600' : 'text-slate-950'}`}>{withoutLinks}</p><p className="mt-1 text-xs text-slate-500">requieren agregar un enlace</p></Card>
      </div>

      {(showProductForm || showPublicationForm) && <Card className="mb-6 border-blue-200">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h3 className="text-xl font-bold text-slate-950">{showProductForm ? (editingProductId ? 'Editar producto' : 'Nuevo producto') : (editingPublicationId ? 'Editar publicación' : 'Nuevo enlace de publicación')}</h3><p className="mt-1 text-sm text-slate-500">{showProductForm ? 'Completa la ficha que será compartida entre todas sus publicaciones.' : 'Puedes agregar cuantos canales necesites para el mismo producto.'}</p></div>
          <button onClick={showProductForm ? resetProductForm : resetPublicationForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar formulario"><X size={20} /></button>
        </div>

        {showProductForm ? <form onSubmit={saveProduct} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Tipo<select value={productForm.tipo} onChange={(event) => setProductForm({ ...productForm, tipo: event.target.value as ProductType })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">{Object.entries(productTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">SKU / código<input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} placeholder="Ej. TH-BOM-001" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Nombre *<input required value={productForm.nombre} onChange={(event) => setProductForm({ ...productForm, nombre: event.target.value })} placeholder="Nombre comercial del producto" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Precio<input type="number" min="0" step="any" value={productForm.precio} onChange={(event) => setProductForm({ ...productForm, precio: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Moneda<select value={productForm.moneda} onChange={(event) => setProductForm({ ...productForm, moneda: event.target.value as Product['moneda'] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option>CLP</option><option>UF</option><option>USD</option></select></label>
          <label className="text-sm font-medium text-slate-700">Stock<input type="number" min="0" step="any" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Estado<select value={productForm.estado} onChange={(event) => setProductForm({ ...productForm, estado: event.target.value as ProductStatus })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">{Object.entries(productStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">URL de imagen<input type="url" value={productForm.imagen_url} onChange={(event) => setProductForm({ ...productForm, imagen_url: event.target.value })} placeholder="https://..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Descripción<textarea value={productForm.descripcion} onChange={(event) => setProductForm({ ...productForm, descripcion: event.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Notas internas<textarea value={productForm.notas} onChange={(event) => setProductForm({ ...productForm, notas: event.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-4"><button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Guardando...' : editingProductId ? 'Guardar cambios' : 'Crear producto'}</button><button type="button" onClick={resetProductForm} className="rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-600">Cancelar</button></div>
        </form> : <form onSubmit={savePublication} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Producto *<select required value={publicationForm.producto_id} onChange={(event) => { const product = products.find((item) => item.id === event.target.value); setPublicationForm({ ...publicationForm, producto_id: event.target.value, precio_publicado: product?.precio === null || product?.precio === undefined ? publicationForm.precio_publicado : String(product.precio), moneda: product?.moneda || publicationForm.moneda }) }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="">Seleccionar producto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku ? `${product.sku} · ` : ''}{product.nombre}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Plataforma<select value={publicationForm.plataforma} onChange={(event) => setPublicationForm({ ...publicationForm, plataforma: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">{platforms.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Estado<select value={publicationForm.estado} onChange={(event) => setPublicationForm({ ...publicationForm, estado: event.target.value as PublicationStatus })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">{Object.entries(publicationStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Título en la plataforma<input value={publicationForm.titulo} onChange={(event) => setPublicationForm({ ...publicationForm, titulo: event.target.value })} placeholder="Puede ser distinto al nombre interno" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Enlace *<input required value={publicationForm.url} onChange={(event) => setPublicationForm({ ...publicationForm, url: event.target.value })} placeholder="https://..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Precio publicado<input type="number" min="0" step="any" value={publicationForm.precio_publicado} onChange={(event) => setPublicationForm({ ...publicationForm, precio_publicado: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Moneda<select value={publicationForm.moneda} onChange={(event) => setPublicationForm({ ...publicationForm, moneda: event.target.value as Publication['moneda'] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option>CLP</option><option>UF</option><option>USD</option></select></label>
          <label className="text-sm font-medium text-slate-700">Fecha publicación<input type="date" value={publicationForm.fecha_publicacion} onChange={(event) => setPublicationForm({ ...publicationForm, fecha_publicacion: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Fecha vencimiento<input type="date" value={publicationForm.fecha_vencimiento} onChange={(event) => setPublicationForm({ ...publicationForm, fecha_vencimiento: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Visitas<input type="number" min="0" value={publicationForm.visitas} onChange={(event) => setPublicationForm({ ...publicationForm, visitas: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700">Consultas<input type="number" min="0" value={publicationForm.consultas} onChange={(event) => setPublicationForm({ ...publicationForm, consultas: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">Notas internas<textarea value={publicationForm.notas} onChange={(event) => setPublicationForm({ ...publicationForm, notas: event.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-4"><button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Guardando...' : editingPublicationId ? 'Guardar cambios' : 'Agregar publicación'}</button><button type="button" onClick={resetPublicationForm} className="rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-600">Cancelar</button></div>
        </form>}
      </Card>}

      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-[1fr_260px_auto]">
          <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto, SKU, plataforma o enlace..." className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4" /></label>
          <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3"><option value="todas">Todas las plataformas</option>{platforms.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-600 disabled:opacity-40"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Actualizar</button>
        </div>
      </Card>

      {loading ? <Card><div className="flex items-center justify-center gap-3 py-12 text-slate-500"><RefreshCw className="animate-spin" size={20} /> Cargando publicaciones...</div></Card> : filteredProducts.length === 0 ? <Card><div className="py-12 text-center"><Package className="mx-auto text-slate-300" size={44} /><h3 className="mt-4 font-bold text-slate-800">{products.length ? 'No hay resultados para esos filtros' : 'Aún no hay productos'}</h3><p className="mt-1 text-sm text-slate-500">{products.length ? 'Prueba con otra búsqueda o plataforma.' : 'Crea el primer producto y luego agrega todos los enlaces donde está publicado.'}</p>{!products.length && <button onClick={() => startProduct()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"><Plus size={17} /> Crear primer producto</button>}</div></Card> : <div className="space-y-5">
        {filteredProducts.map((product) => {
          const publications = [...(product.publicaciones_productos || [])].sort((a, b) => Number(b.estado === 'activa') - Number(a.estado === 'activa'))
          const activeCount = publications.filter((item) => item.estado === 'activa').length
          return <Card key={product.id} className="overflow-hidden p-0">
            <div className="grid lg:grid-cols-[220px_1fr]">
              <div className="flex min-h-44 items-center justify-center bg-slate-100">
                {product.imagen_url ? <img src={product.imagen_url} alt={product.nombre} className="h-full max-h-64 w-full object-cover" /> : <Package className="text-slate-300" size={54} />}
              </div>
              <div className="min-w-0 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-blue-600">{productTypeLabels[product.tipo]}</span>{product.sku && <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{product.sku}</span>}<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${productStatusClass(product.estado)}`}>{productStatusLabels[product.estado]}</span></div>
                    <h3 className="mt-2 text-xl font-bold text-slate-950">{product.nombre}</h3>
                    {product.descripcion && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{product.descripcion}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span className="font-bold text-slate-950">{formatMoney(product.precio, product.moneda)}</span><span className="text-slate-500">Stock: {product.stock ?? 'Sin dato'}</span><span className={activeCount ? 'text-emerald-700' : 'font-semibold text-amber-700'}>{activeCount ? `${activeCount} enlace${activeCount === 1 ? '' : 's'} activo${activeCount === 1 ? '' : 's'}` : 'Sin enlaces activos'}</span></div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button onClick={() => startPublication(product)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Plus size={15} /> Publicar</button>
                    <button onClick={() => void copyLinks(product)} disabled={!activeCount} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-30" title="Copiar enlaces activos"><Copy size={17} /></button>
                    <button onClick={() => startProduct(product)} className="rounded-lg border border-slate-200 p-2 text-slate-600" title="Editar producto"><Pencil size={17} /></button>
                    <button onClick={() => void removeProduct(product)} className="rounded-lg border border-red-100 p-2 text-red-500" title="Eliminar producto"><Trash2 size={17} /></button>
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  {!publications.length ? <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">Este producto aún no tiene publicaciones. <button onClick={() => startPublication(product)} className="font-semibold text-blue-600">Agregar primer enlace</button></div> : <div className="grid gap-3 xl:grid-cols-2">
                    {publications.map((publication) => <div key={publication.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900">{platformLabel(publication.plataforma)}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${publicationStatusClass(publication.estado)}`}>{publicationStatusLabels[publication.estado]}</span></div>{publication.titulo && <p className="mt-1 truncate text-sm text-slate-600">{publication.titulo}</p>}</div>
                        <div className="flex shrink-0 gap-1"><a href={publication.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Abrir publicación"><ExternalLink size={17} /></a><button onClick={() => startPublication(product, publication)} className="rounded-lg p-2 text-slate-500 hover:bg-white" title="Editar"><Pencil size={16} /></button><button onClick={() => void removePublication(publication)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Eliminar"><Trash2 size={16} /></button></div>
                      </div>
                      <a href={publication.url} target="_blank" rel="noreferrer" className="mt-3 block truncate text-sm text-blue-600 underline decoration-blue-200 underline-offset-2">{publication.url}</a>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span>{formatMoney(publication.precio_publicado, publication.moneda)}</span><span className="inline-flex items-center gap-1"><Eye size={13} /> {publication.visitas || 0} visitas</span><span className="inline-flex items-center gap-1"><MessageSquare size={13} /> {publication.consultas || 0} consultas</span>{publication.fecha_publicacion && <span>Publicada: {new Date(`${publication.fecha_publicacion}T12:00:00`).toLocaleDateString('es-CL')}</span>}</div>
                    </div>)}
                  </div>}
                </div>
              </div>
            </div>
          </Card>
        })}
      </div>}
    </div>
  )
}
