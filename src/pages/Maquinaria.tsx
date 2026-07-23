import { useEffect, useState } from 'react'
import { Camera, Download, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'

type MachineRow = {
  id?: string
  code: string
  name: string
  conteo?: string
  brand?: string
  model?: string
  color?: string
  serial?: string
  tipo?: string
  anio?: number | null
  location?: string
  status?: string
  estado_fisico?: string
  estado_detalle?: string
  disponibilidad?: string
  tipo_bateria?: string
  alto_bateria?: number
  ancho_bateria?: number
  largo?: number
  altura?: number
}

const emptyForm: MachineRow = {

  code: '',
  name: '',
  conteo: '',
  brand: '',
  model: '',
  color: '',
  serial: '',
  tipo: '',
  anio: null,
  location: '',
  status: 'activo',
  estado_fisico: 'buen estado',
  estado_detalle: '',
  disponibilidad: 'disponible',
  tipo_bateria: '',
  alto_bateria: 0,
  ancho_bateria: 0,
  largo: 0,
  altura: 0,
}
const PAGE_SIZE = 10

function slug(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function generarCodigo(form: MachineRow) {
  if (form.code) return form.code

  if (form.conteo) {
    return `MAQ-${String(form.conteo).padStart(3, '0')}`
  }

  if (form.serial) {
    return `SERIE-${slug(form.serial)}`
  }

  return ''
}

function extraerNumero(value?: string | number | null) {
  const match = String(value ?? '').match(/\d+/)

  return match ? Number(match[0]) : 0
}

function extraerNumeroCodigo(code?: string | null) {
  const match = String(code || '').match(/^MAQ-(\d+)$/i)

  return match ? Number(match[1]) : 0
}

function crearIdentificadorMaquinaria(conteo: number) {
  const conteoText = String(conteo)

  return {
    conteo: conteoText,
    code: `MAQ-${conteoText.padStart(3, '0')}`,
  }
}

function generarNombre(form: MachineRow) {
  if (form.name) return form.name

  return [form.brand, form.model, form.tipo, form.serial]
    .filter(Boolean)
    .join(' ')
}

function normalizar(value?: string) {
  return String(value || '').trim().toLowerCase()
}

function mostrarValor(value?: string | number | null) {
  const text = String(value ?? '').trim()

  return text ? text.replace(/_/g, ' ') : '-'
}

function estadoFisicoFormValue(value?: string) {
  return normalizar(value) === 'buen_estado' ? 'buen estado' : value || 'buen estado'
}

function extraerDatosPlaca(text: string) {
  const normalizedText = text
    .replace(/[|]/g, '1')
    .replace(/[Oo]/g, '0')
    .replace(/\s+/g, ' ')
    .trim()

  const serialMatch = normalizedText.match(/SERIAL\s*(?:N0|NO|N°|Nº|NUM|NUMBER)?\.?\s*[:\-]?\s*([0-9]{6,})/i)
  const numbers = Array.from(normalizedText.matchAll(/\b\d{3,8}\b/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value))

  const serial = serialMatch?.[1] || ''
  const heightCandidates = numbers.filter((value) => value >= 2000 && value <= 12000 && String(value) !== serial)
  const lengthCandidates = numbers.filter((value) => value >= 300 && value <= 1250 && String(value) !== serial)

  return {
    serial,
    altura: heightCandidates.length ? Math.max(...heightCandidates) : 0,
    largo: lengthCandidates.length ? Math.max(...lengthCandidates) : 0,
  }
}

function scorePlateData(data: { serial: string; altura: number; largo: number }) {
  return (data.serial ? 3 : 0) + (data.altura ? 2 : 0) + (data.largo ? 2 : 0)
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo cargar la imagen'))
    }

    image.src = url
  })
}

function createPlateVariant(
  image: HTMLImageElement,
  rotation: 0 | 90 | 180 | 270,
  crop = { x: 0, y: 0, width: 1, height: 1 },
) {
  const rotatedWidth = rotation === 90 || rotation === 270 ? image.height : image.width
  const rotatedHeight = rotation === 90 || rotation === 270 ? image.width : image.height
  const sourceCanvas = document.createElement('canvas')
  const sourceContext = sourceCanvas.getContext('2d')

  sourceCanvas.width = rotatedWidth
  sourceCanvas.height = rotatedHeight

  if (!sourceContext) return ''

  sourceContext.translate(rotatedWidth / 2, rotatedHeight / 2)
  sourceContext.rotate((rotation * Math.PI) / 180)
  sourceContext.drawImage(image, -image.width / 2, -image.height / 2)

  const cropX = Math.round(rotatedWidth * crop.x)
  const cropY = Math.round(rotatedHeight * crop.y)
  const cropWidth = Math.round(rotatedWidth * crop.width)
  const cropHeight = Math.round(rotatedHeight * crop.height)
  const scale = 2
  const outputCanvas = document.createElement('canvas')
  const outputContext = outputCanvas.getContext('2d')

  outputCanvas.width = cropWidth * scale
  outputCanvas.height = cropHeight * scale

  if (!outputContext) return ''

  outputContext.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  )

  const imageData = outputContext.getImageData(0, 0, outputCanvas.width, outputCanvas.height)

  for (let index = 0; index < imageData.data.length; index += 4) {
    const gray = imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 2.8 + 128))

    imageData.data[index] = contrasted
    imageData.data[index + 1] = contrasted
    imageData.data[index + 2] = contrasted
  }

  outputContext.putImageData(imageData, 0, 0)

  return outputCanvas.toDataURL('image/png')
}

async function createPlateVariants(file: File) {
  const image = await loadImage(file)
  const crops = [
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 0.05, y: 0.1, width: 0.9, height: 0.75 },
    { x: 0.08, y: 0.15, width: 0.8, height: 0.6 },
    { x: 0.05, y: 0.2, width: 0.45, height: 0.6 },
  ]

  return ([0, 90, 180, 270] as const).flatMap((rotation) => {
    return crops.map((crop) => createPlateVariant(image, rotation, crop)).filter(Boolean)
  })
}

function badgeClass(value?: string) {
  const estado = normalizar(value)

  if (estado.includes('activo') || estado.includes('disponible') || estado.includes('buen')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }

  if (estado.includes('mantenimiento') || estado.includes('regular')) {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }

  if (estado.includes('inactivo') || estado.includes('baja') || estado.includes('malo')) {
    return 'bg-red-50 text-red-700 border-red-200'
  }

  return 'bg-slate-50 text-slate-700 border-slate-200'
}

function Badge({ value }: { value?: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(value)}`}>
      {mostrarValor(value)}
    </span>
  )
}

function DetailItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-900">{mostrarValor(value)}</div>
    </div>
  )
}

export function Maquinaria() {
  const [items, setItems] = useState<MachineRow[]>([])
  const [form, setForm] = useState<MachineRow>(emptyForm)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedMachine, setSelectedMachine] = useState<MachineRow | null>(null)
  const [page, setPage] = useState(1)
  const [totalRows, setTotalRows] = useState(0)
  const [serieInput, setSerieInput] = useState('')
  const [marcaInput, setMarcaInput] = useState('')
  const [tipoInput, setTipoInput] = useState('')
  const [searchSerie, setSearchSerie] = useState('')
  const [searchMarca, setSearchMarca] = useState('')
  const [searchTipo, setSearchTipo] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrText, setOcrText] = useState('')
  const [message, setMessage] = useState('')

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))

  async function load(
    currentPage = page,
    serie = searchSerie,
    marca = searchMarca,
    tipo = searchTipo,
  ) {
    setLoading(true)

    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('machines')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (serie.trim()) {
      query = query.ilike('serial', `%${serie.trim()}%`)
    }

    if (marca.trim()) {
      query = query.ilike('brand', `%${marca.trim()}%`)
    }

    if (tipo.trim()) {
      query = query.ilike('tipo', `%${tipo.trim()}%`)
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
      setMessage(error.message)
      setItems([])
      setTotalRows(0)
      setLoading(false)
      return
    }

    setItems(data || [])
    setTotalRows(count || 0)
    setLoading(false)
  }

  useEffect(() => {
    load(page, searchSerie, searchMarca, searchTipo)
  }, [page, searchSerie, searchMarca, searchTipo])

  function buscarFiltros() {
    const serie = serieInput.trim()
    const marca = marcaInput.trim()
    const tipo = tipoInput.trim()

    setPage(1)
    setSearchSerie(serie)
    setSearchMarca(marca)
    setSearchTipo(tipo)

    if (page === 1 && searchSerie === serie && searchMarca === marca && searchTipo === tipo) {
      load(1, serie, marca, tipo)
    }
  }

  function limpiarBusqueda() {
    setSerieInput('')
    setMarcaInput('')
    setTipoInput('')
    setPage(1)
    setSearchSerie('')
    setSearchMarca('')
    setSearchTipo('')

    if (page === 1 && searchSerie === '' && searchMarca === '' && searchTipo === '') {
      load(1, '', '', '')
    }
  }

  async function obtenerSiguienteIdentificador() {
    let maxConteo = 0
    let from = 0
    const batchSize = 1000

    while (true) {
      const to = from + batchSize - 1
      const { data, error } = await supabase
        .from('machines')
        .select('conteo, code')
        .range(from, to)

      if (error) {
        throw error
      }

      const rows = data || []

      rows.forEach((machine: { conteo?: string; code?: string }) => {
        maxConteo = Math.max(
          maxConteo,
          extraerNumero(machine.conteo),
          extraerNumeroCodigo(machine.code),
        )
      })

      if (rows.length < batchSize) break
      from += batchSize
    }

    return crearIdentificadorMaquinaria(maxConteo + 1)
  }

  async function nuevaMaquinaria() {
    setLoading(true)

    try {
      const identificador = await obtenerSiguienteIdentificador()

      setForm({
        ...emptyForm,
        ...identificador,
      })
    } catch (error: any) {
      setMessage(error.message)
      setForm(emptyForm)
    }

    setLoading(false)
    setEditingCode(null)
    setSelectedMachine(null)
    setShowForm(true)
  }

  async function save() {
    setSaving(true)
    setMessage('')
    let formToSave = form

    if (!editingCode) {
      try {
        const identificador = await obtenerSiguienteIdentificador()
        formToSave = {
          ...form,
          ...identificador,
        }
        setForm(formToSave)
      } catch (error: any) {
        setSaving(false)
        setMessage(error.message)
        return
      }
    }

    const code = generarCodigo(formToSave)
    const name = generarNombre(formToSave)

    if (!code || !name) {
      setSaving(false)
      setMessage('Ingresa el nombre o al menos marca, modelo, tipo o serie de la máquina.')
      return
    }

    const payload = {
      code,
      name,
      conteo: formToSave.conteo || '',
      brand: formToSave.brand || '',
      model: formToSave.model || '',
      color: formToSave.color || '',
      serial: formToSave.serial || '',
      tipo: formToSave.tipo || '',
      anio: formToSave.anio ? Number(formToSave.anio) : null,
      location: formToSave.location || '',
      status: formToSave.status || 'activo',
      estado_fisico: formToSave.estado_fisico || 'buen estado',
      estado_detalle: formToSave.estado_detalle || '',
      disponibilidad: formToSave.disponibilidad || '',
      tipo_bateria: formToSave.tipo_bateria || '',
      alto_bateria: Number(formToSave.alto_bateria || 0),
      ancho_bateria: Number(formToSave.ancho_bateria || 0),
      largo: Number(formToSave.largo || 0),
      altura: Number(formToSave.altura || 0),
    }

    const { error } = editingCode && formToSave.id
      ? await supabase
        .from('machines')
        .update(payload)
        .eq('id', formToSave.id)
      : editingCode
        ? await supabase
          .from('machines')
          .upsert(payload, { onConflict: 'empresa_id,code' })
        : await supabase
          .from('machines')
          .insert(payload)
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm(emptyForm)
    setEditingCode(null)
    setShowForm(false)
    await load(page, searchSerie, searchMarca, searchTipo)
    setMessage(editingCode ? 'Maquinaria actualizada correctamente.' : 'Maquinaria guardada correctamente.')
  }

  function editarMaquina(machine: MachineRow) {
    setForm({
      id: machine.id,
      code: machine.code || '',
      name: machine.name || '',
      conteo: machine.conteo || '',
      brand: machine.brand || '',
      model: machine.model || '',
      color: machine.color || '',
      serial: machine.serial || '',
      tipo: machine.tipo || '',
      anio: machine.anio || null,
      location: machine.location || '',
      status: machine.status || 'activo',
      estado_fisico: estadoFisicoFormValue(machine.estado_fisico),
      estado_detalle: machine.estado_detalle || '',
      disponibilidad: machine.disponibilidad || '',
      tipo_bateria: machine.tipo_bateria || '',
      alto_bateria: Number(machine.alto_bateria || 0),
      ancho_bateria: Number(machine.ancho_bateria || 0),
      largo: Number(machine.largo || 0),
      altura: Number(machine.altura || 0),
    })

    setEditingCode(machine.code)
    setSelectedMachine(null)
    setShowForm(true)
  }

  function cancelarEdicion() {
    setForm(emptyForm)
    setEditingCode(null)
    setShowForm(false)
    setOcrText('')
  }

  async function analizarFotoPlaca(file: File) {
    setOcrLoading(true)
    setOcrText('')
    let worker: any = null

    try {
      const { createWorker, PSM } = await import('tesseract.js')
      const variants = await createPlateVariants(file)
      const detectedTexts: string[] = []
      let bestText = ''
      let detected = { serial: '', altura: 0, largo: 0 }

      worker = await createWorker('eng')
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.:-°º ',
      })

      for (const variant of variants) {
        const { data } = await worker.recognize(variant)
        const detectedText = data.text || ''
        const variantData = extraerDatosPlaca(detectedText)

        detectedTexts.push(detectedText)

        if (scorePlateData(variantData) > scorePlateData(detected)) {
          detected = variantData
          bestText = detectedText
        }

        if (detected.serial && detected.altura && detected.largo) break
      }

      const combinedText = detectedTexts.join('\n\n---\n\n')
      const combinedData = extraerDatosPlaca(combinedText)

      if (scorePlateData(combinedData) >= scorePlateData(detected)) {
        detected = combinedData
        bestText = combinedText
      }

      setOcrText(bestText || combinedText)
      setForm((currentForm) => ({
        ...currentForm,
        serial: detected.serial || currentForm.serial,
        altura: detected.altura || currentForm.altura,
        largo: detected.largo || currentForm.largo,
      }))

      if (!detected.serial && !detected.altura && !detected.largo) {
        setMessage('No pude detectar serie, altura o largo en la imagen. Puedes ingresarlos manualmente.')
      }
    } catch (error: any) {
      setMessage(error.message || 'No se pudo analizar la imagen')
    } finally {
      if (worker) {
        await worker.terminate()
      }

      setOcrLoading(false)
    }
  }

  async function eliminarMaquina(machine: MachineRow) {
    const confirmar = confirm(`¿Seguro que quieres eliminar la maquinaria ${machine.code}?`)

    if (!confirmar) return

    let query = supabase
      .from('machines')
      .delete()

    query = machine.id ? query.eq('id', machine.id) : query.eq('code', machine.code)

    const { error } = await query

    if (error) {
      setMessage(error.message)
      return
    }

    await load(page, searchSerie, searchMarca, searchTipo)
    if (selectedMachine?.id === machine.id || selectedMachine?.code === machine.code) {
      setSelectedMachine(null)
    }
    setMessage('Maquinaria eliminada correctamente.')
  }

  return (
    <div className="pb-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:mb-6">
        <h2 className="text-2xl font-bold md:text-3xl">Maquinaria</h2>
        <a href="/formatos/formato-inventario-maquinaria.xlsx" download className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100">
          <Download size={17} /> Descargar formato inventario maquinaria
        </a>
      </div>

      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <Card>
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <button
            onClick={nuevaMaquinaria}
            className="inline-flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white sm:w-auto"
          >
            <Plus size={18} />
            Nueva maquinaria
          </button>

          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-[repeat(3,minmax(150px,1fr))_auto_auto] xl:items-center">
            <input
              className="w-full rounded border p-3"
              placeholder="Buscar por serie"
              value={serieInput}
              onChange={(e) => setSerieInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') buscarFiltros()
              }}
            />

            <input
              className="w-full rounded border p-3"
              placeholder="Buscar por marca"
              value={marcaInput}
              onChange={(e) => setMarcaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') buscarFiltros()
              }}
            />

            <input
              className="w-full rounded border p-3"
              placeholder="Buscar por tipo"
              value={tipoInput}
              onChange={(e) => setTipoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') buscarFiltros()
              }}
            />

            <button
              onClick={buscarFiltros}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
            >
              <Search size={18} />
              Buscar
            </button>

            <button
              onClick={limpiarBusqueda}
              disabled={
                loading &&
                !serieInput &&
                !marcaInput &&
                !tipoInput &&
                !searchSerie &&
                !searchMarca &&
                !searchTipo
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded bg-slate-700 px-4 py-3 text-white disabled:opacity-50"
            >
              <X size={18} />
              Limpiar
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-6 border-b pb-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">
                {editingCode ? 'Editar maquinaria' : 'Nueva maquinaria'}
              </h3>

              <button
                onClick={cancelarEdicion}
                className="inline-flex items-center justify-center rounded border px-3 py-2 text-slate-700"
                title="Cerrar formulario"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input
                className="w-full min-w-0 rounded border bg-slate-100 p-3 text-slate-600"
                placeholder="Código automático"
                value={form.code}
                disabled
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />

              <input
                className={`w-full min-w-0 rounded border p-3 ${!editingCode ? 'bg-slate-100 text-slate-600' : ''}`}
                placeholder="Conteo automático"
                value={form.conteo || ''}
                disabled={!editingCode}
                onChange={(e) => setForm({ ...form, conteo: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Nombre"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Modelo"
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Color"
                value={form.color || ''}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Marca"
                value={form.brand || ''}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Serie"
                value={form.serial || ''}
                onChange={(e) => setForm({ ...form, serial: e.target.value })}
              />

              <label className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded bg-slate-800 px-4 py-3 text-white">
                <Camera size={18} />
                {ocrLoading ? 'Analizando...' : 'Leer placa'}
                <input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={ocrLoading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) analizarFotoPlaca(file)
                    e.currentTarget.value = ''
                  }}
                />
              </label>

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Tipo"
                value={form.tipo || ''}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                type="number"
                placeholder="Año"
                value={form.anio || ''}
                onChange={(e) =>
                  setForm({ ...form, anio: e.target.value ? Number(e.target.value) : null })
                }
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Ubicación"
                value={form.location || ''}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />

              <select
                className="w-full min-w-0 rounded border p-3"
                value={form.estado_fisico || 'buen estado'}
                onChange={(e) => setForm({ ...form, estado_fisico: e.target.value })}
              >
                <option value="nuevo">Nuevo</option>
                <option value="usado">Usado</option>
                <option value="buen estado">Buen estado</option>
                <option value="regular">Regular</option>
                <option value="malo">Malo</option>
              </select>

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Estado detalle"
                value={form.estado_detalle || ''}
                onChange={(e) => setForm({ ...form, estado_detalle: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Disponibilidad"
                value={form.disponibilidad || ''}
                onChange={(e) => setForm({ ...form, disponibilidad: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                placeholder="Tipo de batería"
                value={form.tipo_bateria || ''}
                onChange={(e) => setForm({ ...form, tipo_bateria: e.target.value })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                type="number"
                placeholder="Alto batería"
                value={form.alto_bateria || ''}
                onChange={(e) => setForm({ ...form, alto_bateria: Number(e.target.value) })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                type="number"
                placeholder="Ancho batería"
                value={form.ancho_bateria || ''}
                onChange={(e) => setForm({ ...form, ancho_bateria: Number(e.target.value) })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                type="number"
                placeholder="Largo"
                value={form.largo || ''}
                onChange={(e) => setForm({ ...form, largo: Number(e.target.value) })}
              />

              <input
                className="w-full min-w-0 rounded border p-3"
                type="number"
                placeholder="Altura"
                value={form.altura || ''}
                onChange={(e) => setForm({ ...form, altura: Number(e.target.value) })}
              />

              <button
                onClick={save}
                disabled={saving}
                className="rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editingCode ? 'Actualizar' : 'Guardar'}
              </button>

              <button
                onClick={cancelarEdicion}
                className="rounded bg-slate-700 px-4 py-3 text-white"
              >
                Cancelar
              </button>
            </div>

            {ocrText && (
              <details className="mt-3 rounded border bg-slate-50 p-3 text-sm text-slate-600">
                <summary className="cursor-pointer font-semibold text-slate-800">
                  Texto detectado desde la placa
                </summary>
                <pre className="mt-2 whitespace-pre-wrap">{ocrText}</pre>
              </details>
            )}
          </div>
        )}

        <div className="mb-3 flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>{loading ? 'Cargando maquinaria...' : `${totalRows} registro${totalRows === 1 ? '' : 's'}`}</span>
          <span>Página {page} de {totalPages}</span>
        </div>

        <div className="space-y-3 md:hidden">
          {!loading && items.map((m) => (
            <div className="rounded border bg-white p-4 shadow-sm" key={m.id || m.code}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase text-slate-500">Conteo {m.conteo || '-'}</div>
                  <div className="truncate text-base font-bold text-slate-900">{m.brand || 'Sin marca'}</div>
                  <div className="truncate text-sm text-slate-600">{m.model || '-'}</div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold text-slate-500">Serie</div>
                  <div className="max-w-[130px] truncate text-sm font-semibold text-slate-900">{m.serial || '-'}</div>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Tipo</div>
                  <div className="truncate text-slate-900">{m.tipo || '-'}</div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Ubicación</div>
                  <div className="truncate text-slate-900">{m.location || '-'}</div>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Badge value={m.estado_fisico} />
                <Badge value={m.disponibilidad} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSelectedMachine(m)}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded border px-2 py-2 text-sm text-slate-700"
                >
                  <Eye size={16} />
                  Ver
                </button>

                <button
                  onClick={() => editarMaquina(m)}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded bg-yellow-500 px-2 py-2 text-sm text-white"
                >
                  <Pencil size={16} />
                  Editar
                </button>

                <button
                  onClick={() => eliminarMaquina(m)}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded bg-red-600 px-2 py-2 text-sm text-white"
                >
                  <Trash2 size={16} />
                  Borrar
                </button>
              </div>
            </div>
          ))}

          {!loading && items.length === 0 && (
            <div className="rounded border bg-slate-50 p-4 text-center text-sm text-slate-500">
              No hay maquinaria para mostrar
            </div>
          )}

          {loading && (
            <div className="rounded border bg-slate-50 p-4 text-center text-sm text-slate-500">
              Cargando maquinaria...
            </div>
          )}
        </div>

        <div className="hidden overflow-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Conteo</th>
                <th className="py-2">Serie</th>
                <th className="py-2">Marca</th>
                <th className="py-2">Modelo</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Ubicación</th>
                <th className="py-2">Estado físico</th>
                <th className="py-2">Disponibilidad</th>
                <th className="py-2">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!loading && items.map((m) => (
                <tr className="border-b hover:bg-slate-50" key={m.id || m.code}>
                  <td className="py-3 font-semibold">{m.conteo || '-'}</td>
                  <td className="py-3">
                    <div className="font-semibold">{m.serial || '-'}</div>
                    <div className="text-xs text-slate-500">{m.code || '-'}</div>
                  </td>
                  <td className="py-3">{m.brand || '-'}</td>
                  <td className="py-3">{m.model || '-'}</td>
                  <td className="py-2">{m.tipo || '-'}</td>
                  <td className="py-2">{m.location || '-'}</td>
                  <td className="py-2"><Badge value={m.estado_fisico} /></td>
                  <td className="py-2"><Badge value={m.disponibilidad} /></td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedMachine(m)}
                        className="inline-flex items-center justify-center rounded border px-3 py-2 text-slate-700"
                        title="Ver detalle"
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        onClick={() => editarMaquina(m)}
                        className="inline-flex items-center justify-center rounded bg-yellow-500 px-3 py-2 text-white"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        onClick={() => eliminarMaquina(m)}
                        className="inline-flex items-center justify-center rounded bg-red-600 px-3 py-2 text-white"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && items.length === 0 && (
                <tr>
                  <td className="py-4 text-center text-slate-500" colSpan={9}>
                    No hay maquinaria para mostrar
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="py-4 text-center text-slate-500" colSpan={9}>
                    Cargando maquinaria...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedMachine && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center sm:p-4">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded bg-white p-4 shadow-xl sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold sm:text-xl">
                    {selectedMachine.brand || 'Maquinaria'} {selectedMachine.model || ''}
                  </h3>
                  <div className="mt-1 text-sm text-slate-500">
                    Serie {selectedMachine.serial || '-'} - Código {selectedMachine.code || '-'}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedMachine(null)}
                  className="inline-flex items-center justify-center rounded border px-3 py-2 text-slate-700"
                  title="Cerrar detalle"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-6 flex flex-wrap gap-2">
                <Badge value={selectedMachine.estado_fisico} />
                <Badge value={selectedMachine.disponibilidad} />
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <DetailItem label="Conteo" value={selectedMachine.conteo} />
                <DetailItem label="Modelo" value={selectedMachine.model} />
                <DetailItem label="Color" value={selectedMachine.color} />
                <DetailItem label="Marca" value={selectedMachine.brand} />
                <DetailItem label="Serie" value={selectedMachine.serial} />
                <DetailItem label="Tipo" value={selectedMachine.tipo} />
                <DetailItem label="Año" value={selectedMachine.anio} />
                <DetailItem label="Ubicación" value={selectedMachine.location} />
                <DetailItem label="Estado físico" value={selectedMachine.estado_fisico} />
                <DetailItem label="Estado detalle" value={selectedMachine.estado_detalle} />
                <DetailItem label="Disponibilidad" value={selectedMachine.disponibilidad} />
                <DetailItem label="Tipo batería" value={selectedMachine.tipo_bateria} />
                <DetailItem label="Alto batería" value={selectedMachine.alto_bateria} />
                <DetailItem label="Ancho batería" value={selectedMachine.ancho_bateria} />
                <DetailItem label="Largo" value={selectedMachine.largo} />
                <DetailItem label="Altura" value={selectedMachine.altura} />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => editarMaquina(selectedMachine)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded bg-yellow-500 px-4 py-3 text-white sm:w-auto sm:py-2"
                >
                  <Pencil size={16} />
                  Editar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-600">{totalRows} resultados</div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={loading || page <= 1}
              className="rounded bg-slate-700 px-4 py-3 text-white disabled:opacity-50 sm:py-2"
            >
              Anterior
            </button>

            <button
              onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              disabled={loading || page >= totalPages}
              className="rounded bg-slate-700 px-4 py-3 text-white disabled:opacity-50 sm:py-2"
            >
              Siguiente
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
