const IVA = 0.19;
const BASE_LAST_COTIZACION = 11865;
const LEGACY_TH_RUT = '76.171.450-3';
const DEFAULT_BRAND = {
  nombre: 'Empresa sin configurar',
  razonSocial: 'Empresa sin configurar',
  descripcion: 'Configura los datos comerciales de la empresa activa',
  rubroLinea: '',
  rut: '',
  email: '',
  telefono: '',
  direccion: '',
  logoUrl: '',
  firmaNombre: '',
  firmaCargo: '',
  firmaEmail: '',
  firmaTelefono: '',
  firmaCelular: '',
  condicionesDefault: '',
  observacionesDefault: '',
  transferenciaBanco: 'Banco de Chile',
  transferenciaRut: '76.171.450-3',
  transferenciaTipoCuenta: 'Cuenta corriente',
  transferenciaNumeroCuenta: '9010944505',
  transferenciaEmailFallback: 'francodareck@tecnicahidraulica.cl',
  transferenciaAsuntoTemplate: 'Pago {{folio}} - {{vendedor}}',
  comisionArriendoMensual: 35000,
  comisionTrabajoHidraulicoPct: 6,
  comisionVentaApilador: 600000
};
let brand = {...DEFAULT_BRAND};
const CLP = new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
const UF = new Intl.NumberFormat('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
const USD = new Intl.NumberFormat('es-CL',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const today = new Date().toISOString().slice(0,10);
const INITIAL_MODE = new URLSearchParams(window.location.search).get('modo') === 'presupuesto' ? 'presupuesto' : 'cotizacion';
const AUTOSAVE_KEY = `th_current_autosave_${INITIAL_MODE}`;
const LEGACY_AUTOSAVE_KEY = 'th_current_autosave';
const LEGACY_CURRENT_KEY = 'th_current';
const AUTOSAVE_TTL_MS = 24 * 60 * 60 * 1000;
const EJEMPLO_SERVICIO = 'Servicio de arriendo de un (1) apilador eléctrico marca Jungheinrich modelo ETV 214 con las siguientes características técnicas:';
const EJEMPLO_NOTAS = `1.- Valores sujetos a confirmación según alcance final del servicio.
2.- Plazo de entrega a coordinar según disponibilidad técnica.
3.- Condiciones comerciales configurables por empresa.
4.- Documento válido para revisión y aprobación del cliente.`;
const PRE_SPEC_LABELS = [
  'Altura mástil replegado',
  'Altura útil de levante',
  'Ancho exterior horquillas',
  'Batería',
  'Capacidad carga',
  'Capacidad carga en altura',
  'Cargador de batería',
  'Color',
  'Largo útil de las horquillas',
  'Mástil',
  'Operador',
  'Peso del equipo c/batería',
  'Radio de giro',
  'Tipo',
  'Tipo de freno',
  'Tipo de pallet',
  'Tipo ruedas'
];
const REGIONES_COMUNAS = [
  {region:'Arica y Parinacota', comunas:['Arica','Camarones','Putre','General Lagos']},
  {region:'Tarapacá', comunas:['Iquique','Alto Hospicio','Pozo Almonte','Camiña','Colchane','Huara','Pica']},
  {region:'Antofagasta', comunas:['Antofagasta','Mejillones','Sierra Gorda','Taltal','Calama','Ollagüe','San Pedro de Atacama','Tocopilla','María Elena']},
  {region:'Atacama', comunas:['Copiapó','Caldera','Tierra Amarilla','Chañaral','Diego de Almagro','Vallenar','Alto del Carmen','Freirina','Huasco']},
  {region:'Coquimbo', comunas:['La Serena','Coquimbo','Andacollo','La Higuera','Paiguano','Vicuña','Illapel','Canela','Los Vilos','Salamanca','Ovalle','Combarbalá','Monte Patria','Punitaqui','Río Hurtado']},
  {region:'Valparaíso', comunas:['Valparaíso','Casablanca','Concón','Juan Fernández','Puchuncaví','Quintero','Viña del Mar','Isla de Pascua','Los Andes','Calle Larga','Rinconada','San Esteban','La Ligua','Cabildo','Papudo','Petorca','Zapallar','Quillota','Calera','Hijuelas','La Cruz','Nogales','San Antonio','Algarrobo','Cartagena','El Quisco','El Tabo','Santo Domingo','San Felipe','Catemu','Llaillay','Panquehue','Putaendo','Santa María','Quilpué','Limache','Olmué','Villa Alemana']},
  {region:'Región Metropolitana de Santiago', comunas:['Cerrillos','Cerro Navia','Conchalí','El Bosque','Estación Central','Huechuraba','Independencia','La Cisterna','La Florida','La Granja','La Pintana','La Reina','Las Condes','Lo Barnechea','Lo Espejo','Lo Prado','Macul','Maipú','Ñuñoa','Pedro Aguirre Cerda','Peñalolén','Providencia','Pudahuel','Quilicura','Quinta Normal','Recoleta','Renca','Santiago','San Joaquín','San Miguel','San Ramón','Vitacura','Puente Alto','Pirque','San José de Maipo','Colina','Lampa','Tiltil','San Bernardo','Buin','Calera de Tango','Paine','Melipilla','Alhué','Curacaví','María Pinto','San Pedro','Talagante','El Monte','Isla de Maipo','Padre Hurtado','Peñaflor']},
  {region:'Región del Libertador Gral. Bernardo O’Higgins', comunas:['Rancagua','Codegua','Coinco','Coltauco','Doñihue','Graneros','Las Cabras','Machalí','Malloa','Mostazal','Olivar','Peumo','Pichidegua','Quinta de Tilcoco','Rengo','Requínoa','San Vicente','Pichilemu','La Estrella','Litueche','Marchihue','Navidad','Paredones','San Fernando','Chépica','Chimbarongo','Lolol','Nancagua','Palmilla','Peralillo','Placilla','Pumanque','Santa Cruz']},
  {region:'Región del Maule', comunas:['Talca','Constitución','Curepto','Empedrado','Maule','Pelarco','Pencahue','Río Claro','San Clemente','San Rafael','Cauquenes','Chanco','Pelluhue','Curicó','Hualañé','Licantén','Molina','Rauco','Romeral','Sagrada Familia','Teno','Vichuquén','Linares','Colbún','Longaví','Parral','Retiro','San Javier','Villa Alegre','Yerbas Buenas']},
  {region:'Región de Ñuble', comunas:['Cobquecura','Coelemu','Ninhue','Portezuelo','Quirihue','Ránquil','Treguaco','Bulnes','Chillán Viejo','Chillán','El Carmen','Pemuco','Pinto','Quillón','San Ignacio','Yungay','Coihueco','Ñiquén','San Carlos','San Fabián','San Nicolás']},
  {region:'Región del Biobío', comunas:['Concepción','Coronel','Chiguayante','Florida','Hualqui','Lota','Penco','San Pedro de la Paz','Santa Juana','Talcahuano','Tomé','Hualpén','Lebu','Arauco','Cañete','Contulmo','Curanilahue','Los Álamos','Tirúa','Los Ángeles','Antuco','Cabrero','Laja','Mulchén','Nacimiento','Negrete','Quilaco','Quilleco','San Rosendo','Santa Bárbara','Tucapel','Yumbel','Alto Biobío']},
  {region:'Región de la Araucanía', comunas:['Temuco','Carahue','Cunco','Curarrehue','Freire','Galvarino','Gorbea','Lautaro','Loncoche','Melipeuco','Nueva Imperial','Padre las Casas','Perquenco','Pitrufquén','Pucón','Saavedra','Teodoro Schmidt','Toltén','Vilcún','Villarrica','Cholchol','Angol','Collipulli','Curacautín','Ercilla','Lonquimay','Los Sauces','Lumaco','Purén','Renaico','Traiguén','Victoria']},
  {region:'Región de Los Ríos', comunas:['Valdivia','Corral','Lanco','Los Lagos','Máfil','Mariquina','Paillaco','Panguipulli','La Unión','Futrono','Lago Ranco','Río Bueno']},
  {region:'Región de Los Lagos', comunas:['Puerto Montt','Calbuco','Cochamó','Fresia','Frutillar','Los Muermos','Llanquihue','Maullín','Puerto Varas','Castro','Ancud','Chonchi','Curaco de Vélez','Dalcahue','Puqueldón','Queilén','Quellón','Quemchi','Quinchao','Osorno','Puerto Octay','Purranque','Puyehue','Río Negro','San Juan de la Costa','San Pablo','Chaitén','Futaleufú','Hualaihué','Palena']},
  {region:'Región Aisén del Gral. Carlos Ibáñez del Campo', comunas:['Coihaique','Lago Verde','Aisén','Cisnes','Guaitecas','Cochrane','O’Higgins','Tortel','Chile Chico','Río Ibáñez']},
  {region:'Región de Magallanes y de la Antártica Chilena', comunas:['Punta Arenas','Laguna Blanca','Río Verde','San Gregorio','Cabo de Hornos (Ex Navarino)','Antártica','Porvenir','Primavera','Timaukel','Natales','Torres del Paine']}
];

const defaultDoc = {
  id:null,
  documentKind:INITIAL_MODE,
  tipo:INITIAL_MODE === 'cotizacion' ? 'COTIZACIÓN' : 'PRESUPUESTO',
  estado:INITIAL_MODE === 'cotizacion' ? 'cotizacion_borrador' : 'pre_cotizacion',
  correspondePresupuesto:false,
  presupuestoOrigenId:null,
  presupuestoOrigenNumero:'',
  preNumero:'',
  numero:'',
  serieCotizacion:'TH',
  origenDocumento:'sistema',
  importacionArchivo:'',
  numeroReservado:false,
  fecha:today,
  vcto:'',
  moneda:'CLP',
  clienteId:null,
  contactoId:null,
  rutEmpresa:'',
  cliente:'',
  contacto:'',
  rut:'',
  direccion:'',
  giro:'',
  comuna:'',
  telefono:'',
  ciudad:'',
  email:'',
  vendedorNombre:'',
  vendedorEmail:'',
  asuntoTransferencia:'',
  referencia:'',
  referencias:[{texto:'', items:[{codigo:'', descripcion:'', cantidad:1, um:'UN', precio:0, dscto:0}]}],
  preOrden:{
    servicio:'',
    caracteristicas:PRE_SPEC_LABELS.map(nombre=>({nombre, valor:''})),
    datosOperativos:[],
    cargos:[{detalle:'', precio:0, cantidad:1}]
  },
  garantia:'30 días',
  condiciones:'',
  observaciones:EJEMPLO_NOTAS,
  items:[],
  savedAt:null,
  savedInSupabase:false,
  dirty:true
};

let counterStatus = { type:'warn', text:'Número generado en modo local. Configura la API PostgreSQL para varios computadores.' };
let saveStatus = { type:'warn', text:'Guarda el documento para activar PDF / Imprimir.' };
let loadingNumber = false;
let savingDoc = false;
let busyMessage = '';
let actionMessage = '';
let supabaseClient = null;
let state = loadCurrent();
let saved = JSON.parse(localStorage.getItem('th_saved')||'[]');
let previewMode = 'actual';
let workflowMode = INITIAL_MODE;
let availableClients = [];
let activeCompanyId = '';
let clientSearch = '';

function loadCurrent(){
  let autosave = null;
  try { autosave = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || localStorage.getItem(LEGACY_AUTOSAVE_KEY) || 'null'); } catch(e) { autosave = null; }
  localStorage.removeItem(LEGACY_CURRENT_KEY);
  const isFreshAutosave = autosave?.doc && autosave.savedAtMs && Date.now() - autosave.savedAtMs <= AUTOSAVE_TTL_MS;
  if (autosave && !isFreshAutosave) localStorage.removeItem(AUTOSAVE_KEY);
  const cached = isFreshAutosave ? autosave.doc : null;
  const cachedKind = cached?.documentKind || (cached?.numeroReservado || cached?.numero ? 'cotizacion' : 'presupuesto');
  const shouldRestoreDraft = Boolean(cached && !cached.id && !cached.numeroReservado && cachedKind === INITIAL_MODE);
  const doc = shouldRestoreDraft ? {...defaultDoc, ...cached} : {...defaultDoc};
  if (shouldRestoreDraft) {
    saveStatus = { type:'warn', text:'Borrador local recuperado. Se conservará por 24 horas.' };
  }
  if (doc.ciudad === 'Santiago') doc.ciudad = 'Región Metropolitana de Santiago';
  if (!REGIONES_COMUNAS.some(r => r.region === doc.ciudad)) {
    doc.ciudad = '';
    doc.comuna = '';
  } else if (doc.comuna && !getComunas(doc.ciudad).includes(doc.comuna)) {
    doc.comuna = '';
  }
  doc.rut = formatRut(doc.rut);
  doc.telefono = formatPhone(doc.telefono);
  if (doc.rutEmpresa === LEGACY_TH_RUT && !brandRut()) doc.rutEmpresa = '';
  normalizeReferencias(doc);
  const restoredFolio = normalizedFolio(doc.numero);
  doc.numero = restoredFolio === null ? '' : String(restoredFolio);
  doc.numeroReservado = restoredFolio !== null;
  doc.documentKind = doc.documentKind || (restoredFolio !== null ? 'cotizacion' : INITIAL_MODE);
  if (!shouldRestoreDraft && !doc.id) doc.documentKind = INITIAL_MODE;
  const quoteDoc = doc.documentKind === 'cotizacion' || Boolean(doc.numeroReservado || doc.numero);
  doc.documentKind = quoteDoc ? 'cotizacion' : 'presupuesto';
  doc.estado = quoteDoc ? (doc.numeroReservado ? 'cotizacion_emitida' : 'cotizacion_borrador') : 'pre_cotizacion';
  doc.tipo = quoteDoc ? 'COTIZACIÓN' : 'PRESUPUESTO';
  doc.correspondePresupuesto = Boolean(doc.correspondePresupuesto);
  doc.presupuestoOrigenId = doc.presupuestoOrigenId || null;
  doc.presupuestoOrigenNumero = doc.presupuestoOrigenNumero || '';
  doc.preNumero = doc.preNumero || '';
  doc.moneda = currentCurrency(doc);
  if (!doc.numeroReservado && !String(doc.observaciones || '').trim()) doc.observaciones = EJEMPLO_NOTAS;
  if (doc.savedAt && !doc.dirty) {
    saveStatus = { type:'ok', text:'Documento guardado. PDF / Imprimir habilitado.' };
  }
  return doc;
}

function initSupabase(){
  if (window.intranetApi) {
    supabaseClient = window.intranetApi;
    counterStatus = { type:'ok', text:'PostgreSQL conectado para presupuestos y cotizaciones.' };
    saveStatus = state.savedAt && !state.dirty
      ? { type:'ok', text:'Documento guardado. PDF / Imprimir habilitado.' }
      : { type:'warn', text:`PostgreSQL conectado. Guarda ${INITIAL_MODE === 'cotizacion' ? 'la cotización' : 'el presupuesto'} para habilitar el PDF.` };
  }
}

async function loadBranding(){
  if (!supabaseClient) {
    applyBrandToDoc(state);
    return;
  }

  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const user = sessionData.session?.user;
    const userMetadata = user?.user_metadata || {};
    const { data: activeData } = await supabaseClient
      .from('usuario_empresa_activa')
      .select('empresa_id')
      .maybeSingle();

    let empresaId = activeData?.empresa_id || '';

    if (!empresaId) {
      const { data: memberships } = await supabaseClient
        .from('usuarios_empresas')
        .select('empresa_id')
        .limit(1);

      empresaId = memberships?.[0]?.empresa_id || '';
    }

    if (!empresaId) {
      applyBrandToDoc(state);
      return;
    }

    const { data: empresa, error } = await supabaseClient
      .from('empresas')
      .select('nombre, razon_social, rut, email, telefono, direccion, website, logo_url, descripcion_corta, firma_nombre, firma_cargo, firma_email, firma_telefono, firma_celular, condiciones_default, observaciones_default, transferencia_banco, transferencia_rut, transferencia_tipo_cuenta, transferencia_numero_cuenta, transferencia_email_fallback, transferencia_asunto_template, comision_arriendo_mensual, comision_trabajo_hidraulico_pct, comision_venta_apilador')
      .eq('id', empresaId)
      .single();

    if (error) throw error;

    brand = {
      ...DEFAULT_BRAND,
      nombre: empresa.nombre || DEFAULT_BRAND.nombre,
      razonSocial: empresa.razon_social || empresa.nombre || DEFAULT_BRAND.razonSocial,
      descripcion: empresa.descripcion_corta || DEFAULT_BRAND.descripcion,
      rubroLinea: empresa.descripcion_corta || DEFAULT_BRAND.rubroLinea,
      rut: empresa.rut || DEFAULT_BRAND.rut,
      email: empresa.email || DEFAULT_BRAND.email,
      telefono: empresa.telefono || DEFAULT_BRAND.telefono,
      direccion: empresa.direccion || DEFAULT_BRAND.direccion,
      website: empresa.website || '',
      logoUrl: empresa.logo_url || DEFAULT_BRAND.logoUrl,
      firmaNombre: userMetadata.erp_nombre || empresa.firma_nombre || '',
      firmaCargo: userMetadata.erp_cargo || empresa.firma_cargo || 'Representante comercial',
      firmaEmail: userMetadata.erp_email_comercial || user?.email || empresa.firma_email || '',
      firmaTelefono: userMetadata.erp_fono || empresa.firma_telefono || '',
      firmaCelular: userMetadata.erp_celular || empresa.firma_celular || '',
      condicionesDefault: empresa.condiciones_default || '',
      observacionesDefault: empresa.observaciones_default || '',
      transferenciaBanco: empresa.transferencia_banco || DEFAULT_BRAND.transferenciaBanco,
      transferenciaRut: empresa.transferencia_rut || empresa.rut || DEFAULT_BRAND.transferenciaRut,
      transferenciaTipoCuenta: empresa.transferencia_tipo_cuenta || DEFAULT_BRAND.transferenciaTipoCuenta,
      transferenciaNumeroCuenta: empresa.transferencia_numero_cuenta || DEFAULT_BRAND.transferenciaNumeroCuenta,
      transferenciaEmailFallback: empresa.transferencia_email_fallback || DEFAULT_BRAND.transferenciaEmailFallback,
      transferenciaAsuntoTemplate: empresa.transferencia_asunto_template || DEFAULT_BRAND.transferenciaAsuntoTemplate,
      comisionArriendoMensual: Number(empresa.comision_arriendo_mensual || 0),
      comisionTrabajoHidraulicoPct: Number(empresa.comision_trabajo_hidraulico_pct || 0),
      comisionVentaApilador: Number(empresa.comision_venta_apilador || 0)
    };

    const { data: sellerProfile } = await supabaseClient
      .from('personas')
      .select('nombre, email, cargo, configuracion_extra')
      .eq('empresa_id', empresaId)
      .eq('usuario_id', user?.id || '')
      .maybeSingle();
    const sellerExtra = sellerProfile?.configuracion_extra || {};
    const sellerCommercial = sellerExtra.comercial || {};
    brand = {
      ...brand,
      firmaNombre: sellerProfile?.nombre || brand.firmaNombre,
      firmaCargo: sellerProfile?.cargo || brand.firmaCargo,
      firmaEmail: sellerProfile?.email || brand.firmaEmail,
      transferenciaBanco: sellerCommercial.transferencia_banco || brand.transferenciaBanco,
      transferenciaRut: sellerCommercial.transferencia_rut || brand.transferenciaRut,
      transferenciaTipoCuenta: sellerCommercial.transferencia_tipo_cuenta || brand.transferenciaTipoCuenta,
      transferenciaNumeroCuenta: sellerCommercial.transferencia_numero_cuenta || brand.transferenciaNumeroCuenta,
      transferenciaEmailFallback: sellerCommercial.transferencia_email_fallback || brand.transferenciaEmailFallback,
      transferenciaAsuntoTemplate: sellerCommercial.transferencia_asunto_template || brand.transferenciaAsuntoTemplate,
      comisionArriendoMensual: Number(sellerCommercial.comision_arriendo_mensual ?? brand.comisionArriendoMensual),
      comisionTrabajoHidraulicoPct: Number(sellerCommercial.comision_trabajo_hidraulico_pct ?? brand.comisionTrabajoHidraulicoPct),
      comisionVentaApilador: Number(sellerCommercial.comision_venta_apilador ?? brand.comisionVentaApilador)
    };

    activeCompanyId = empresaId;
    state.vendedorNombre = state.vendedorNombre || brand.firmaNombre || userMetadata.erp_nombre || user?.email || '';
    state.vendedorEmail = state.vendedorEmail || brand.firmaEmail || brand.transferenciaEmailFallback;
    state.asuntoTransferencia = state.asuntoTransferencia || transferSubject(state);
    await loadRegisteredClients(empresaId);

    applyBrandToDoc(state);
  } catch (err) {
    console.error(err);
    counterStatus = { type:'warn', text:'No se pudo cargar branding de empresa. Usando datos por defecto.' };
    applyBrandToDoc(state);
  }
}

async function loadRegisteredClients(empresaId=activeCompanyId){
  if (!supabaseClient || !empresaId) return;
  try {
    const { data, error } = await supabaseClient
      .from('clientes')
      .select('id, razon_social, nombre_fantasia, rut, giro, email, telefono, direccion, comuna, ciudad, region, estado, contactos(id, nombre, cargo, email, telefono, principal)')
      .eq('empresa_id', empresaId)
      .order('razon_social');
    if (error) throw error;
    availableClients = (data || []).filter(client=>client.estado !== 'inactivo');
  } catch (err) {
    console.error(err);
    availableClients = [];
    saveStatus = {type:'warn', text:'No se pudo cargar la agenda de clientes. Puedes completar los datos manualmente.'};
  }
}

function money(v){
  return moneyFor(state, v);
}
function clpMoney(v){return CLP.format(Math.round(finiteNumber(v))).replace(/^CLP\s?/, '').trim()}
function currentCurrency(doc=state){
  const currency = String(doc?.moneda || 'CLP').toUpperCase();
  return ['CLP','UF','USD'].includes(currency) ? currency : 'CLP';
}
function finiteNumber(value, fallback=0){const number=Number(value); return Number.isFinite(number) ? number : fallback}
function validFolio(value){const number=Number(value); return Number.isSafeInteger(number) && number >= BASE_LAST_COTIZACION + 1 && number <= 9999999}
function normalizedFolio(value){return validFolio(value) ? Number(value) : null}
function normalizedImportedFolio(value){const number=Number(value); return Number.isSafeInteger(number) && number > 0 && number <= 999999999 ? number : null}
function normalizedDocumentFolio(doc=state){return doc?.origenDocumento === 'importado' ? normalizedImportedFolio(doc.numero) : normalizedFolio(doc.numero)}
function moneyFor(doc, v){
  const n = finiteNumber(v);
  const currency = currentCurrency(doc);
  if (currency === 'UF') return `UF ${UF.format(n)}`;
  if (currency === 'USD') return USD.format(n);
  return CLP.format(Math.round(n)).replace(/^CLP\s?/, '').trim();
}
function roundAmount(v, doc=state){const number=finiteNumber(v); return currentCurrency(doc) === 'CLP' ? Math.round(number) : Math.round(number*100)/100}
function pricePlaceholder(doc=state, compact=false){
  const currency = currentCurrency(doc);
  if (currency === 'UF') return '25.00';
  if (currency === 'USD') return compact ? '250.00' : '1250.00';
  return compact ? '35000' : '1015267';
}
function blankItem(){return {codigo:'', descripcion:'', cantidad:1, um:'UN', precio:0, dscto:0}}
function subtotalItem(it){return (Number(it.cantidad)||0)*(Number(it.precio)||0)*(1-(Number(it.dscto)||0)/100)}
function cleanImportCell(value){
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .trim();
}
function parseImportedAmount(value){
  const raw = cleanImportCell(value)
    .replace(/[^\d,.\-]/g, '')
    .trim();
  if (!raw) return 0;
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw;
  if (hasComma && hasDot) {
    normalized = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (hasComma) {
    normalized = raw.replace(',', '.');
  } else if (hasDot) {
    const parts = raw.split('.');
    normalized = parts.length > 2 || parts[parts.length - 1]?.length === 3 ? raw.replace(/\./g, '') : raw;
  }
  return finiteNumber(normalized, 0);
}
function importColumnIndex(headers, names, fallback){
  const normalized = headers.map(header=>String(header || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const index = normalized.findIndex(header=>names.some(name=>header.includes(name)));
  return index >= 0 ? index : fallback;
}
function parseItemsFromText(text){
  const lines = String(text || '').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const tableLines = lines.filter(line=>line.includes('|'));
  if (!tableLines.length) return [];
  const rows = tableLines
    .map(line=>line.replace(/^\||\|$/g, '').split('|').map(cleanImportCell))
    .filter(cells=>cells.some(Boolean))
    .filter(cells=>!cells.every(cell=>/^:?-{3,}:?$/.test(cell.replace(/\s/g, ''))));
  if (!rows.length) return [];
  const first = rows[0].map(cell=>cell.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const hasHeader = first.some(cell=>cell.includes('descripcion') || cell.includes('cant') || cell.includes('valor') || cell.includes('precio'));
  const headers = hasHeader ? rows[0] : ['descripcion', 'cantidad', 'valor unitario neto'];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const descIndex = importColumnIndex(headers, ['descripcion', 'detalle', 'producto', 'item', 'servicio'], 0);
  const qtyIndex = importColumnIndex(headers, ['cant', 'cantidad', 'qty'], 1);
  const priceIndex = importColumnIndex(headers, ['valor unitario', 'precio unitario', 'unitario', 'precio', 'valor'], 2);
  return dataRows.map(cells=>{
    const description = cleanImportCell(cells[descIndex] || cells[0] || '');
    const descriptionKey = description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!description || /^(subtotal|neto|iva|i\.v\.a|total|total con iva|total iva)/.test(descriptionKey)) return null;
    const quantity = parseImportedAmount(cells[qtyIndex]) || 1;
    const price = parseImportedAmount(cells[priceIndex]);
    if (!price && !description) return null;
    return {
      codigo: '',
      descripcion: description,
      cantidad: quantity,
      um: 'UN',
      precio: roundAmount(price),
      dscto: 0
    };
  }).filter(Boolean);
}
function specExample(i){return ['2.600 mm','6.000 mm','540 mm','24V / 220 AH','1.600 Kg','980 Kg','Incluido / Monofásico','Amarillo Industrial','1.150 mm','Doble','Hombre a Bordo','2500 Kg app','2.360 mm','PTP (*)','Magnético','Abierto','Poliuretano'][i] || ''}
function normalizeSpecName(s){return String(s || '').trim().toLowerCase()}
function fixedPreSpecs(po){
  const existing = [
    ...(Array.isArray(po?.caracteristicas) ? po.caracteristicas : []),
    ...(Array.isArray(po?.datosOperativos) ? po.datosOperativos : [])
  ].filter(Boolean);
  const byName = new Map(existing.map(it=>[normalizeSpecName(it.nombre), it]));
  return PRE_SPEC_LABELS.map((nombre,i)=>{
    const matched = byName.get(normalizeSpecName(nombre));
    const fallback = existing[i];
    return {nombre, valor:matched?.valor ?? fallback?.valor ?? ''};
  });
}
function normalizeReferencias(doc){
  const itemsAreSections = Array.isArray(doc.items) && doc.items.length && Array.isArray(doc.items[0]?.items);
  if (itemsAreSections && (!Array.isArray(doc.referencias) || typeof doc.referencias[0] === 'string')) {
    doc.referencias = doc.items;
  }
  const oldItems = Array.isArray(doc.items) && doc.items.length && !itemsAreSections ? doc.items : [blankItem()];
  if (!Array.isArray(doc.referencias) || !doc.referencias.length) {
    doc.referencias = [{texto:doc.referencia || '', items:oldItems}];
  } else if (typeof doc.referencias[0] === 'string') {
    doc.referencias = doc.referencias.map((ref, i)=>({texto:ref || '', items:i === 0 ? oldItems : [blankItem()]}));
  } else {
    doc.referencias = doc.referencias.map((ref)=>({
      texto:ref?.texto || '',
      items:Array.isArray(ref?.items) && ref.items.length ? ref.items : [blankItem()]
    }));
  }
  doc.items = doc.referencias.flatMap(ref=>ref.items || []);
  doc.referencia = doc.referencias.map(ref=>ref.texto).filter(Boolean).join('\n');
  doc.preOrden = {
    servicio: doc.preOrden?.servicio || '',
    caracteristicas: fixedPreSpecs(doc.preOrden),
    datosOperativos: [],
    cargos: Array.isArray(doc.preOrden?.cargos) && doc.preOrden.cargos.length ? doc.preOrden.cargos : [blankCargo()]
  };
}
function allItems(){return (state.referencias || []).flatMap(ref=>ref.items || [])}
function totals(){const neto=allItems().reduce((s,it)=>s+subtotalItem(it),0); const iva=neto*IVA; return {neto,iva,total:neto+iva}}
function itemsFromDoc(doc){return (doc.referencias || []).flatMap(ref=>ref.items || [])}
function totalsFromDoc(doc){const neto=itemsFromDoc(doc).reduce((s,it)=>s+subtotalItem(it),0); const iva=neto*IVA; return {neto,iva,total:neto+iva}}
function cargosPreOrden(doc=state){return doc.preOrden?.cargos || []}
function cargosTotal(doc=state){return cargosPreOrden(doc).reduce((s,it)=>s+subtotalCargo(it),0)}
function totalsPreOrden(doc=state){const base=totalsFromDoc(doc); const neto=base.neto + cargosTotal(doc); const iva=neto*IVA; return {neto,iva,total:neto+iva}}
function persist(){localStorage.setItem(AUTOSAVE_KEY,JSON.stringify({savedAtMs:Date.now(),doc:state}))}
function clearAutosave(){localStorage.removeItem(AUTOSAVE_KEY); localStorage.removeItem(LEGACY_AUTOSAVE_KEY); localStorage.removeItem(LEGACY_CURRENT_KEY)}
function isQuoteDoc(doc=state){return doc?.documentKind === 'cotizacion' || Boolean(doc?.numeroReservado || doc?.numero)}
function documentKindOf(doc){return isQuoteDoc(doc) ? 'cotizacion' : 'presupuesto'}
function budgetDocuments(){return saved.filter(item=>documentKindOf(item.doc) === 'presupuesto')}
function quoteDocuments(){return saved.filter(item=>documentKindOf(item.doc) === 'cotizacion')}
function normalizedSearch(value){
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
function filteredClients(){
  const term = normalizedSearch(clientSearch);
  if (!term) return availableClients;
  return availableClients.filter(client=>{
    const contactText = clientContacts(client).map(contact=>`${contact.nombre || ''} ${contact.email || ''} ${contact.telefono || ''}`).join(' ');
    return normalizedSearch(`${clientDisplayName(client)} ${client.rut || ''} ${client.email || ''} ${client.telefono || ''} ${client.direccion || ''} ${contactText}`).includes(term);
  });
}
function sameClientDocument(doc, client=registeredClient(state.clienteId)){
  if (!doc) return false;
  if (client?.id && doc.clienteId && String(doc.clienteId) === String(client.id)) return true;
  const clientRut = normalizedSearch(client?.rut || state.rut);
  const docRut = normalizedSearch(doc.rut);
  if (clientRut && docRut && clientRut === docRut) return true;
  const selectedName = normalizedSearch(clientDisplayName(client) || state.cliente);
  const docName = normalizedSearch(doc.cliente);
  return Boolean(selectedName && docName && selectedName === docName);
}
function clientPreviousDocuments(){
  if (!state.clienteId && !String(state.cliente || state.rut || '').trim()) return [];
  return saved
    .filter(item=>sameClientDocument(item.doc))
    .sort((a,b)=>String(b.doc.savedAt || '').localeCompare(String(a.doc.savedAt || '')))
    .slice(0, 12);
}
function quoteIdentifier(doc, id){
  const series = doc?.serieCotizacion || 'TH';
  const date = doc?.fecha || 'sin fecha';
  return `COTIZACIÓN N° ${doc?.numero || 'SIN N°'} · ${series} · ${date}${id ? ` · ID ${id}` : ''}`;
}
function markDirty(){state.dirty=true; state.savedAt=null; state.savedInSupabase=false; actionMessage=''; saveStatus={type:'warn', text:`Hay cambios sin guardar. Guarda ${isQuoteDoc() ? 'la cotización' : 'el presupuesto'} antes de imprimir.`};}
function setSilent(k,v){state[k]=v; markDirty(); persist()}
function syncReferenciaText(){state.referencia=(state.referencias||[]).map(ref=>ref.texto).filter(Boolean).join('\n'); state.items=allItems()}
function setRefItemSilent(r,i,k,v){state.referencias[r].items[i][k]=v; syncReferenciaText(); markDirty(); persist()}
function setReferenciaSilent(i,v){state.referencias[i].texto=v; syncReferenciaText(); markDirty(); persist()}
function addReferencia(){state.referencias.push({texto:'', items:[blankItem()]}); syncReferenciaText(); markDirty(); persist(); render()}
function delReferencia(i){state.referencias.splice(i,1); if (!state.referencias.length) state.referencias=[{texto:'', items:[blankItem()]}]; syncReferenciaText(); markDirty(); persist(); render()}
function addRefItem(r){state.referencias[r].items.push(blankItem()); syncReferenciaText(); markDirty(); persist(); render()}
function delRefItem(r,i){state.referencias[r].items.splice(i,1); if (!state.referencias[r].items.length) state.referencias[r].items=[blankItem()]; syncReferenciaText(); markDirty(); persist(); render()}
function importChatGptItems(refIndex){
  const input = document.getElementById(`quick-import-${refIndex}`);
  const items = parseItemsFromText(input?.value || '');
  if (!items.length) {
    actionMessage = 'No encontré ítems válidos. Pega una tabla con columnas Descripción, Cant. y Valor unitario neto.';
    render({preserveScroll:true});
    return;
  }
  const current = state.referencias[refIndex]?.items || [];
  const hasOnlyBlank = current.length === 1
    && !String(current[0].descripcion || '').trim()
    && !Number(current[0].precio || 0);
  state.referencias[refIndex].items = hasOnlyBlank ? items : [...current, ...items];
  actionMessage = `${items.length} ítem(s) importado(s) desde la tabla pegada.`;
  syncReferenciaText();
  markDirty();
  actionMessage = `${items.length} ítem(s) importado(s) desde la tabla pegada.`;
  persist();
  render({preserveScroll:true});
}
function blankSpec(){return {nombre:'', valor:''}}
function blankCargo(){return {detalle:'', precio:0, cantidad:1}}
function subtotalCargo(it){return (Number(it.cantidad)||1)*(Number(it.precio)||0)}
function ensurePreOrden(){if (!state.preOrden) state.preOrden={servicio:'',caracteristicas:[],datosOperativos:[],cargos:[]}}
function setPreOrdenSilent(k,v){ensurePreOrden(); state.preOrden[k]=v; markDirty(); persist()}
function setSpecSilent(group,i,k,v){
  ensurePreOrden();
  if (group === 'caracteristicas') state.preOrden.caracteristicas = fixedPreSpecs(state.preOrden);
  if (!state.preOrden[group]) state.preOrden[group] = [];
  if (!state.preOrden[group][i]) state.preOrden[group][i] = blankSpec();
  state.preOrden[group][i][k]=v;
  if (group === 'caracteristicas') state.preOrden[group][i].nombre = PRE_SPEC_LABELS[i] || state.preOrden[group][i].nombre || '';
  markDirty();
  persist();
}
function addSpec(group){ensurePreOrden(); state.preOrden[group].push(blankSpec()); markDirty(); persist(); render()}
function delSpec(group,i){ensurePreOrden(); state.preOrden[group].splice(i,1); markDirty(); persist(); render()}
function setCargoSilent(i,k,v){ensurePreOrden(); state.preOrden.cargos[i][k]=v; markDirty(); persist()}
function addCargo(){ensurePreOrden(); state.preOrden.cargos.push(blankCargo()); markDirty(); persist(); render()}
function delCargo(i){ensurePreOrden(); state.preOrden.cargos.splice(i,1); markDirty(); persist(); render()}
function setPreviewMode(mode){previewMode=mode; render()}
function setRutSilent(v){state.rut=formatRut(v); markDirty(); persist()}
function setPhoneSilent(v){state.telefono=formatPhone(v); markDirty(); persist()}
function setRegionSilent(v){state.ciudad=v; if (!getComunas(v).includes(state.comuna)) state.comuna=''; markDirty(); persist(); render({preserveScroll:true})}
function clientDisplayName(client){return client?.razon_social || client?.nombre_fantasia || 'Cliente sin nombre'}
function registeredClient(id){return availableClients.find(client=>String(client.id)===String(id)) || null}
function clientContacts(client=registeredClient(state.clienteId)){return Array.isArray(client?.contactos) ? client.contactos : []}
function selectRegisteredClient(value){
  if (!value || value === 'manual') {
    state.clienteId = null;
    state.contactoId = null;
    markDirty();
    persist();
    render({preserveScroll:true});
    return;
  }
  const client = registeredClient(value);
  if (!client) return;
  const contacts = clientContacts(client);
  const contact = contacts.find(item=>item.principal) || contacts[0] || null;
  state.clienteId = client.id;
  state.contactoId = contact?.id || null;
  state.cliente = clientDisplayName(client);
  state.contacto = contact?.nombre || '';
  state.rut = formatRut(client.rut || '');
  state.direccion = client.direccion || '';
  state.giro = client.giro || '';
  state.comuna = client.comuna || '';
  state.telefono = formatPhone(contact?.telefono || client.telefono || '');
  state.ciudad = client.region || client.ciudad || '';
  state.email = contact?.email || client.email || '';
  markDirty();
  persist();
  render({preserveScroll:true});
}
function setClientSearch(value){
  clientSearch = value;
  render({preserveScroll:true});
}
function selectRegisteredContact(value){
  const contact = clientContacts().find(item=>String(item.id)===String(value));
  if (!contact) return;
  state.contactoId = contact.id;
  state.contacto = contact.nombre || '';
  state.telefono = formatPhone(contact.telefono || state.telefono || '');
  state.email = contact.email || state.email || '';
  markDirty();
  persist();
  render({preserveScroll:true});
}
function cloneDocumentAsNew(source, targetKind=documentKindOf(source)){
  const cloned = JSON.parse(JSON.stringify(source || {}));
  const kind = targetKind === 'presupuesto' ? 'presupuesto' : 'cotizacion';
  delete cloned.preSnapshot;
  return {
    ...defaultDoc,
    ...cloned,
    id:null,
    documentKind:kind,
    tipo:kind === 'cotizacion' ? 'COTIZACIÓN' : 'PRESUPUESTO',
    estado:kind === 'cotizacion' ? 'cotizacion_borrador' : 'pre_cotizacion',
    numero:'',
    preNumero:'',
    numeroReservado:false,
    origenDocumento:'sistema',
    importacionArchivo:'',
    importacionUid:null,
    fecha:today,
    vcto:'',
    correspondePresupuesto:false,
    presupuestoOrigenId:null,
    presupuestoOrigenNumero:'',
    savedAt:null,
    savedInSupabase:false,
    dirty:true,
    observaciones: cloned.observaciones || brand.observacionesDefault || EJEMPLO_NOTAS,
    condiciones: cloned.condiciones || brand.condicionesDefault || ''
  };
}
function duplicateSavedDoc(id, targetKind='same'){
  const found = saved.find(item=>String(item.id) === String(id));
  if (!found) {
    saveStatus = {type:'bad', text:'No encontré el documento anterior para copiarlo.'};
    render({preserveScroll:true});
    return;
  }
  const sourceKind = documentKindOf(found.doc);
  const kind = targetKind === 'same' ? sourceKind : targetKind;
  workflowMode = kind === 'presupuesto' ? 'presupuesto' : 'cotizacion';
  previewMode = 'actual';
  clearAutosave();
  state = cloneDocumentAsNew(found.doc, workflowMode);
  normalizeReferencias(state);
  applyBrandToDoc(state);
  persist();
  saveStatus = {type:'warn', text:`Documento copiado desde ${sourceKind === 'cotizacion' ? 'cotización' : 'presupuesto'} anterior. Revisa los datos y guarda para crear uno nuevo.`};
  actionMessage = 'La copia no modifica el documento original.';
  render();
}
function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
function downloadText(filename, content, type='text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function exportRecord(item){
  const doc = item.doc || {};
  const t = isQuoteDoc(doc) ? totalsFromDoc(doc) : totalsPreOrden(doc);
  return {
    id: item.id || doc.id || '',
    tipo: documentKindOf(doc),
    numero: doc.numero || '',
    pre_numero: doc.preNumero || '',
    serie_cotizacion: doc.serieCotizacion || 'TH',
    origen_documento: doc.origenDocumento || 'sistema',
    importacion_archivo: doc.importacionArchivo || '',
    fecha_emision: doc.fecha || '',
    fecha_vcto: doc.vcto || '',
    cliente_id: doc.clienteId || '',
    cliente_nombre: doc.cliente || '',
    cliente_contacto: doc.contacto || '',
    cliente_rut: doc.rut || '',
    cliente_direccion: doc.direccion || '',
    cliente_giro: doc.giro || '',
    cliente_comuna: doc.comuna || '',
    cliente_ciudad: doc.ciudad || '',
    cliente_telefono: doc.telefono || '',
    cliente_email: doc.email || '',
    vendedor_nombre: doc.vendedorNombre || '',
    vendedor_email: doc.vendedorEmail || '',
    moneda: currentCurrency(doc),
    referencia: referenciasTextoFromDoc(doc),
    observaciones: doc.observaciones || '',
    garantia: doc.garantia || '',
    condiciones: doc.condiciones || '',
    neto: roundAmount(t.neto, doc),
    iva: roundAmount(t.iva, doc),
    total: roundAmount(t.total, doc),
    items_json: JSON.stringify(doc.referencias || []),
    data_json: JSON.stringify(doc)
  };
}
function referenciasTextoFromDoc(doc){
  return (doc.referencias || []).map(ref=>ref.texto).filter(ref=>String(ref || '').trim()).join('\n');
}
function exportDocuments(kind='cotizaciones', format='csv'){
  const docs = kind === 'todo' ? saved : quoteDocuments();
  if (!docs.length) {
    actionMessage = kind === 'todo' ? 'No hay documentos para exportar.' : 'No hay cotizaciones para exportar.';
    render({preserveScroll:true});
    return;
  }
  const records = docs.map(exportRecord);
  const date = new Date().toISOString().slice(0, 10);
  const base = kind === 'todo' ? `documentos-erp-${date}` : `cotizaciones-erp-${date}`;
  if (format === 'json') {
    downloadText(`${base}.json`, JSON.stringify(records, null, 2), 'application/json;charset=utf-8');
  } else {
    const headers = Object.keys(records[0]);
    const csv = [headers.join(';'), ...records.map(row=>headers.map(header=>csvCell(row[header])).join(';'))].join('\n');
    downloadText(`${base}.csv`, csv, 'text/csv;charset=utf-8');
  }
  actionMessage = `Exportados ${records.length} documento(s) en ${format.toUpperCase()}.`;
  render({preserveScroll:true});
}
function addItem(){addRefItem(0)}
function delItem(i){delRefItem(0,i)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function canExport(){return Boolean(state.savedAt && !state.dirty)}
function errorText(err){
  if (err?.code === '22P02') return 'Uno de los campos tiene un formato inválido. Revisa el folio, las cantidades y los precios antes de volver a guardar.';
  return err?.message || err?.details || err?.hint || String(err || 'Error desconocido');
}
function cleanNoteLine(line){return String(line || '').trim().replace(/^\d+\s*\.-\s*/, '')}
function autosaveText(){
  try {
    const raw = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
    if (!raw?.savedAtMs) return '';
    const expires = new Date(raw.savedAtMs + AUTOSAVE_TTL_MS).toLocaleString('es-CL');
    return `Borrador local guardado automáticamente. Disponible hasta: ${expires}`;
  } catch(e) {
    return '';
  }
}
function referenciasTexto(){return (state.referencias || []).map(r=>r.texto).filter(r=>String(r||'').trim()).join('\n')}
function getComunas(region){return REGIONES_COMUNAS.find(r=>r.region===region)?.comunas || []}
function options(list, selected, placeholder){
  return `<option value="">${esc(placeholder)}</option>` + list.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
}
function formatRut(value){
  const clean = String(value || '').replace(/[^0-9kK]/g,'').toUpperCase().slice(0,9);
  if (clean.length <= 1) return clean;
  const body = clean.slice(0,-1);
  const dv = clean.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return `${formattedBody}-${dv}`;
}
function formatPhone(value){
  return String(value || '').replace(/\D/g,'').slice(0,12);
}

function formatDateDisplay(value){
  if (!value) return '-';
  const [y,m,d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return esc(value);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic'];
  return `${String(d).padStart(2,'0')}-${meses[m-1]}-${y}`;
}

function brandRut(){return brand.rut || DEFAULT_BRAND.rut}
function brandEmail(){return brand.email || DEFAULT_BRAND.email}
function brandPhone(){return brand.telefono || DEFAULT_BRAND.telefono}
function brandName(){return brand.razonSocial || brand.nombre || DEFAULT_BRAND.razonSocial}
function brandLogo(){return brand.logoUrl || DEFAULT_BRAND.logoUrl}
function brandDescription(){return brand.descripcion || DEFAULT_BRAND.descripcion}
function brandAddressLine(){return brand.direccion || DEFAULT_BRAND.direccion}
function sellerName(doc=state){return doc.vendedorNombre || brand.firmaNombre || brandName()}
function sellerEmail(doc=state){return doc.vendedorEmail || brand.firmaEmail || brand.transferenciaEmailFallback || brandEmail()}
function documentFolio(doc=state){return doc.numero || doc.preNumero || 'pendiente'}
function transferSubject(doc=state){
  const template = brand.transferenciaAsuntoTemplate || DEFAULT_BRAND.transferenciaAsuntoTemplate;
  return template
    .replace(/\{\{folio\}\}/gi, documentFolio(doc))
    .replace(/\{\{vendedor\}\}/gi, sellerName(doc))
    .replace(/\{\{email\}\}/gi, sellerEmail(doc));
}
function brandContactLine(){
  const parts = [];
  if (brandPhone()) parts.push(`<b>Teléfono:</b> ${esc(brandPhone())}`);
  if (brandEmail()) parts.push(`<b>E-mail:</b> ${esc(brandEmail())}`);
  return parts.join(' · ');
}
function renderBrandBlock(){
  const logo = brandLogo();
  const contact = brandContactLine();
  return `
    <div class="brand-block">
      <div class="brand-name">${esc(brandName()).toUpperCase()}</div>
      <div class="brand-desc">${esc(brandDescription()).toUpperCase()}</div>
      ${brandAddressLine() ? `<div>${esc(brandAddressLine()).toUpperCase()}</div>` : ''}
      ${contact ? `<div class="brand-contact">${contact}</div>` : ''}
      ${logo ? `<img class="brand-logo" src="${esc(logo)}" alt="Logo ${esc(brandName())}">` : '<div class="brand-logo brand-logo-empty">Sin logo</div>'}
    </div>`;
}
function applyBrandToDoc(doc){
  if (!doc.rutEmpresa || doc.rutEmpresa === DEFAULT_BRAND.rut || doc.rutEmpresa === LEGACY_TH_RUT) doc.rutEmpresa = brandRut();
  if ((!doc.observaciones || doc.observaciones === EJEMPLO_NOTAS) && brand.observacionesDefault) {
    doc.observaciones = brand.observacionesDefault;
  }
  if (!doc.condiciones && brand.condicionesDefault) {
    doc.condiciones = brand.condicionesDefault;
  }
  return doc;
}

function renderCotizacionSheet(t, docLabel, displayNumber){
  return `
    <article class="sheet">
      <header class="sheet-header">
        ${renderBrandBlock()}

        <div class="quote-block">
          <div class="quote-main">
            <div class="quote-label">${esc(docLabel)} N°</div>
            <div class="quote-number ${state.numeroReservado ? '' : 'pre-number'}">${esc(displayNumber)}</div>
          </div>
          <div class="date-block date-block-under">
            <div class="date-row"><b>Fecha Emisión:</b><div class="date-value">${esc(state.fecha)}</div></div>
            <div class="date-row"><b>Fecha Vcto:</b><div class="date-value">${esc(state.vcto||'-')}</div></div>
            <div class="date-row"><b>R.U.T.:</b><div class="date-value">${esc(state.rutEmpresa || brandRut())}</div></div>
            <div class="date-row"><b>Moneda:</b><div class="date-value">${esc(currentCurrency(state))}</div></div>
          </div>
        </div>
      </header>

      <table class="client">
        <tr><th colspan="4">DATOS CLIENTE</th></tr>
        <tr><td class="label">Señor(es)</td><td>${esc(state.cliente)}</td><td class="label">Contacto</td><td>${esc(state.contacto)}</td></tr>
        <tr><td class="label">Rut</td><td>${esc(state.rut)}</td><td class="label">Dirección</td><td>${esc(state.direccion)}</td></tr>
        <tr><td class="label">Giro</td><td>${esc(state.giro)}</td><td class="label">Comuna</td><td>${esc(state.comuna)}</td></tr>
        <tr><td class="label">Teléfono</td><td>${esc(state.telefono)}</td><td class="label">Región</td><td>${esc(state.ciudad)}</td></tr>
        <tr><td class="label">E-mail</td><td>${esc(state.email)}</td><td class="label">Fecha</td><td>${esc(state.fecha)}</td></tr>
      </table>

      ${(state.referencias || []).map((ref,r)=>`
        <div class="ref">${r+1}. ${esc(ref.texto || `Referencia ${r+1}`)}</div>
        <table class="items">
          <tr><th>COD.</th><th>DESCRIPCIÓN</th><th>CANT.</th><th>U.M.</th><th>PRECIO UNIT.</th><th>DSCTO.</th><th>SUBTOTAL</th></tr>
          ${(ref.items || []).map(it=>`<tr><td>${esc(it.codigo)}</td><td class="desc-cell">${esc(it.descripcion)}</td><td class="num">${esc(it.cantidad)}</td><td class="center">${esc(it.um)}</td><td class="num">${money(it.precio)}</td><td class="num">${esc(it.dscto||0)}%</td><td class="num">${money(subtotalItem(it))}</td></tr>`).join('')}
        </table>
      `).join('')}

      <div class="obs-totals">
        <div class="obs"><b>OBSERVACIONES:</b>\n${esc(state.observaciones)}\n\n<b>Garantía:</b> ${esc(state.garantia)}${state.condiciones ? `\n<b>Condiciones:</b> ${esc(state.condiciones)}` : ''}</div>
        <table class="totals">
          <tr><td>SUBTOTAL</td><td class="num">${money(t.neto)}</td></tr>
          <tr><td>NETO</td><td class="num">${money(t.neto)}</td></tr>
          <tr><td>I.V.A. (19%)</td><td class="num">${money(t.iva)}</td></tr>
          <tr class="total-final"><td>TOTAL</td><td class="num">${money(t.total)}</td></tr>
        </table>
      </div>

      <div class="bank"><b>DATOS DE TRANSFERENCIA</b><br>Titular: ${esc(brandName())} · RUT: ${esc(brand.transferenciaRut || brandRut())}<br>${esc(brand.transferenciaBanco)} · ${esc(brand.transferenciaTipoCuenta)} N° ${esc(brand.transferenciaNumeroCuenta)}<br>E-mail: ${esc(sellerEmail(state))}<br>Asunto: ${esc(transferSubject(state))}</div>
    </article>`;
}

function renderPreOrdenSheet(t, displayNumber, doc=state){
  const po = doc.preOrden || {};
  const specs = fixedPreSpecs(po);
  const cargos = (po.cargos || []).filter(it=>it.detalle || Number(it.precio));
  const notas = String(doc.observaciones || 'Documento sujeto a revisión y aprobación del cliente.')
    .split('\n')
    .map(cleanNoteLine)
    .filter(Boolean);
  const mainRef = (doc.referencias || [])[0] || {texto:'', items:[]};
  const mainItems = mainRef.items || [];
  const serviceText = po.servicio || mainRef.texto || 'Detalle del servicio presupuestado.';
  const mainItemRows = mainItems.length ? mainItems : [{cantidad:1, descripcion:'', precio:0}];
  return `
    <article class="sheet preorder-sheet budget-sheet">
      <header class="sheet-header budget-header">
        <section>${renderBrandBlock()}</section>
        <section class="quote-block">
          <div class="quote-main">
            <div class="quote-label">PRESUPUESTO N°</div>
            <div class="quote-number pre-number">${esc(displayNumber)}</div>
          </div>
          <div class="date-block date-block-under">
            <div class="date-row"><b>Fecha Emisión:</b><div class="date-value">${formatDateDisplay(doc.fecha)}</div></div>
            <div class="date-row"><b>Fecha Vcto:</b><div class="date-value">${doc.vcto ? formatDateDisplay(doc.vcto) : '-'}</div></div>
            <div class="date-row"><b>R.U.T.:</b><div class="date-value">${esc(doc.rutEmpresa || brandRut())}</div></div>
            <div class="date-row"><b>Moneda:</b><div class="date-value">${esc(currentCurrency(doc))}</div></div>
          </div>
        </section>
      </header>

      <section class="budget-top-info">
        <table class="budget-info-table">
          <tr><th colspan="2">DATOS CLIENTE</th></tr>
          <tr><td class="label">Señor(es)</td><td>${esc(doc.cliente)}</td></tr>
          <tr><td class="label">Contacto</td><td>${esc(doc.contacto)}</td></tr>
          <tr><td class="label">Rut</td><td>${esc(doc.rut)}</td></tr>
          <tr><td class="label">Dirección</td><td>${esc(doc.direccion)}</td></tr>
          <tr><td class="label">E-mail</td><td>${esc(doc.email)}</td></tr>
          <tr><td class="label">Fono</td><td>${esc(doc.telefono)}</td></tr>
          <tr><td class="label">Fecha</td><td>${formatDateDisplay(doc.fecha)}</td></tr>
        </table>
        <table class="budget-info-table budget-order-table">
          <tr><th colspan="2">DATOS ORDEN DE COMPRA</th></tr>
          <tr><td class="label">Presupuesto N°</td><td>${esc(displayNumber)}</td></tr>
          <tr><td class="label">Razón social</td><td>${esc(brandName())}</td></tr>
          <tr><td class="label">R.U.T.</td><td>${esc(doc.rutEmpresa || brandRut())}</td></tr>
          <tr><td class="label">Fono</td><td>${esc(brand.firmaTelefono || brandPhone())}</td></tr>
        </table>
      </section>

      <table class="budget-main-table">
        <tr>
          <th style="width:38px">Cant.</th>
          <th>Detalle</th>
          <th style="width:92px">Valor Unitario</th>
          <th style="width:92px">Valor Total</th>
        </tr>
        ${mainItemRows.map((it,i)=>`
          <tr>
            <td class="center budget-qty">${esc(it.cantidad || 1)}</td>
            <td class="budget-detail">
              ${i === 0 ? `<div class="budget-service">${esc(serviceText)}</div>` : ''}
              ${it.descripcion ? `<div class="desc-cell">${esc(it.descripcion)}</div>` : ''}
              ${i === 0 && specs.length ? `<div class="budget-specs">${specs.map(sp=>`
                <span>${esc(sp.nombre)}</span><span>:</span><span>${esc(sp.valor)}</span>
              `).join('')}</div>` : ''}
            </td>
            <td class="num">${moneyFor(doc, it.precio)}</td>
            <td class="num">${moneyFor(doc, subtotalItem(it))}</td>
          </tr>`).join('')}
      </table>

      <div class="budget-block-title">CARGOS ADICIONALES</div>
      <section class="budget-extra">
        <table>
          <tr><th>Detalle</th><th style="width:92px">Valor Unitario</th><th style="width:92px">Valor Total</th></tr>
          ${cargos.length ? cargos.map(it=>`
            <tr><td>${esc(it.detalle)}</td><td class="num">${moneyFor(doc, it.precio)}</td><td class="num">${moneyFor(doc, subtotalCargo(it))}</td></tr>
          `).join('') : `<tr><td>&nbsp;</td><td class="num">${moneyFor(doc, 0)}</td><td class="num">${moneyFor(doc, 0)}</td></tr>`}
        </table>
      </section>

      <div class="budget-block-title">NOTAS Y CONDICIONES</div>
      <section class="budget-notes">
        <div class="budget-notes-list">
          ${notas.map((nota,i)=>`<span>${i+1}.-</span><span>${esc(nota)}</span>`).join('')}
        </div>
      </section>

      <section class="budget-bottom">
        <table class="budget-terms">
          <tr><td>Validez de la cotización</td><td>${esc(doc.garantia || '15 días')}</td></tr>
          <tr><td>Plazo de entrega</td><td>${esc(doc.vcto ? 'Según fecha indicada' : 'A coordinar')}</td></tr>
          <tr><td>Forma de pago</td><td>${esc(doc.condiciones || '30 días')}</td></tr>
        </table>
        <table class="budget-totals">
          <tr><td>Neto</td><td class="num">${moneyFor(doc, t.neto)}</td></tr>
          <tr><td>0,19</td><td class="num">${moneyFor(doc, t.iva)}</td></tr>
          <tr><td>Total</td><td class="num">${moneyFor(doc, t.total)}</td></tr>
        </table>
      </section>

      <section class="budget-sign">
        <b>${esc(brand.firmaNombre || brandName())}</b>
        <span>${esc(brand.firmaCargo || 'Representante comercial')}</span><br>
        <span>${esc(brand.firmaEmail || brandEmail())}</span><br>
        <span>Fono: ${esc(brand.firmaTelefono || brandPhone())}</span><br>
        <span>Cel.: ${esc(brand.firmaCelular || '')}</span>
      </section>
      <div class="bank"><b>DATOS DE TRANSFERENCIA</b><br>Titular: ${esc(brandName())} · RUT: ${esc(brand.transferenciaRut || brandRut())}<br>${esc(brand.transferenciaBanco)} · ${esc(brand.transferenciaTipoCuenta)} N° ${esc(brand.transferenciaNumeroCuenta)}<br>E-mail: ${esc(sellerEmail(doc))}<br>Asunto: ${esc(transferSubject(doc))}</div>
    </article>`;
}

function localNextNumber(){
  const stored = Number(localStorage.getItem('th_last_cotizacion') || BASE_LAST_COTIZACION);
  const current = validFolio(state.numero) ? Number(state.numero) : BASE_LAST_COTIZACION;
  const last = Math.max(stored, BASE_LAST_COTIZACION, state.numeroReservado ? current : BASE_LAST_COTIZACION);
  const next = Math.trunc(last) + 1;
  localStorage.setItem('th_last_cotizacion', String(next));
  return next;
}

function localNextPreNumber(){
  const stored = Number(localStorage.getItem('th_last_pre_cotizacion') || 0);
  const next = stored + 1;
  localStorage.setItem('th_last_pre_cotizacion', String(next));
  return `PRE-${String(next).padStart(5,'0')}`;
}

async function reservePreNumber(){
  if (state.preNumero) return state.preNumero;
  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient.rpc('next_erp_pre_cotizacion');
      if (error) throw error;
      state.preNumero = String(data);
      counterStatus = { type:'ok', text:'PostgreSQL conectado. Contador de presupuestos activo.' };
    } else {
      state.preNumero = localNextPreNumber();
      counterStatus = { type:'warn', text:'Modo local activo. Los presupuestos no son compartidos.' };
    }
  } catch (err) {
    console.error(err);
    if (supabaseClient) {
      state.preNumero = '';
      counterStatus = { type:'bad', text:'No se pudo reservar el folio en PostgreSQL. No se guardó para evitar números duplicados.' };
      persist();
      throw err;
    }
    state.preNumero = localNextPreNumber();
    counterStatus = { type:'warn', text:'Modo local activo. Se usó un folio de presupuesto local.' };
  }
  persist();
  return state.preNumero;
}

async function reserveNextNumber({force=false}={}){
  if (loadingNumber) return;
  if (!force && state.numeroReservado && state.numero) return;
  loadingNumber = true;
  render();

  try {
    let nextNum = null;
    if (supabaseClient) {
      const { data, error } = await supabaseClient.rpc('next_erp_cotizacion');
      if (error) throw error;
      nextNum = Number(data);
      counterStatus = { type:'ok', text:'PostgreSQL conectado. Contador de cotizaciones activo.' };
    } else {
      nextNum = localNextNumber();
      counterStatus = { type:'warn', text:'Modo local activo. Configura PostgreSQL para usar varios computadores.' };
    }

    if (!validFolio(nextNum)) {
      throw new Error('Número inválido recibido del contador.');
    }

    state.numero = String(nextNum);
    state.numeroReservado = true;
    state.dirty = true;
    state.savedAt = null;
    persist();
  } catch (err) {
    console.error(err);
    if (supabaseClient) {
      state.numero = '';
      state.numeroReservado = false;
      state.dirty = true;
      state.savedAt = null;
      counterStatus = { type:'bad', text:'No se pudo reservar el folio en PostgreSQL. No se guardó para evitar números duplicados.' };
      persist();
      throw err;
    }
    const fallback = localNextNumber();
    state.numero = String(fallback);
    state.numeroReservado = true;
    state.dirty = true;
    state.savedAt = null;
    counterStatus = { type:'bad', text:'PostgreSQL no respondió. Se usó contador local de respaldo.' };
    persist();
  } finally {
    loadingNumber = false;
    render();
  }
}

function buildDbPayload(){
  const quoteDoc = isQuoteDoc();
  const t = quoteDoc ? totals() : totalsPreOrden();
  const numero = quoteDoc ? normalizedDocumentFolio(state) : null;
  if (quoteDoc && numero === null) throw new Error('La cotización no tiene un folio entero válido. Intenta guardarla nuevamente para reservar otro número.');
  state.vendedorNombre = sellerName(state);
  state.vendedorEmail = sellerEmail(state);
  state.asuntoTransferencia = transferSubject(state);
  const documentData = {
    ...state,
    numero: numero === null ? '' : String(numero),
    numeroReservado: numero !== null,
    dirty:false,
    savedAt:new Date().toISOString()
  };
  return {
    tipo: quoteDoc ? 'COTIZACIÓN' : 'PRESUPUESTO',
    estado: quoteDoc ? (state.numeroReservado ? 'cotizacion_emitida' : 'cotizacion_borrador') : 'pre_cotizacion',
    pre_numero: quoteDoc ? null : (state.preNumero || null),
    numero,
    serie_cotizacion: state.serieCotizacion || 'TH',
    origen_documento: state.origenDocumento || 'sistema',
    importacion_archivo: state.importacionArchivo || null,
    fecha_emision: state.fecha || null,
    fecha_vcto: state.vcto || null,
    cliente_id: state.clienteId || null,
    contacto_id: state.contactoId || null,
    rut_empresa: state.rutEmpresa || brandRut(),
    cliente_nombre: state.cliente || '',
    cliente_contacto: state.contacto || '',
    cliente_rut: state.rut || '',
    cliente_direccion: state.direccion || '',
    cliente_giro: state.giro || '',
    cliente_comuna: state.comuna || '',
    cliente_telefono: state.telefono || '',
    cliente_ciudad: state.ciudad || '',
    cliente_email: state.email || '',
    vendedor_nombre: state.vendedorNombre,
    vendedor_email: state.vendedorEmail,
    asunto_transferencia: state.asuntoTransferencia,
    referencia: referenciasTexto(),
    observaciones: state.observaciones || '',
    garantia: state.garantia || '',
    condiciones: state.condiciones || '',
    items: state.referencias || [],
    subtotal: roundAmount(t.neto, state),
    neto: roundAmount(t.neto, state),
    iva: roundAmount(t.iva, state),
    total: roundAmount(t.total, state),
    data: documentData,
    updated_at: new Date().toISOString()
  };
}

function docFromDb(row){
  const d = row.data || {};
  const origin = row.origen_documento || d.origenDocumento || 'sistema';
  const savedFolio = origin === 'importado' ? normalizedImportedFolio(row.numero ?? d.numero) : normalizedFolio(row.numero ?? d.numero);
  const documentKind = d.documentKind || (savedFolio !== null ? 'cotizacion' : 'presupuesto');
  const doc = {
    ...defaultDoc,
    ...d,
    id: row.id,
    documentKind,
    tipo: documentKind === 'cotizacion' ? 'COTIZACIÓN' : 'PRESUPUESTO',
    estado: documentKind === 'cotizacion' ? (row.numero ? 'cotizacion_emitida' : 'cotizacion_borrador') : 'pre_cotizacion',
    correspondePresupuesto: Boolean(d.correspondePresupuesto),
    presupuestoOrigenId: d.presupuestoOrigenId || null,
    presupuestoOrigenNumero: d.presupuestoOrigenNumero || '',
    preNumero: row.pre_numero || d.preNumero || '',
    numero: savedFolio === null ? '' : String(savedFolio),
    numeroReservado: savedFolio !== null,
    serieCotizacion: row.serie_cotizacion || d.serieCotizacion || 'TH',
    origenDocumento: origin,
    importacionArchivo: row.importacion_archivo || d.importedFrom || '',
    fecha: row.fecha_emision || d.fecha || today,
    vcto: row.fecha_vcto || d.vcto || '',
    moneda: d.moneda || 'CLP',
    clienteId: row.cliente_id || d.clienteId || null,
    contactoId: row.contacto_id || d.contactoId || null,
    rutEmpresa: row.rut_empresa === LEGACY_TH_RUT && !brandRut() ? '' : (row.rut_empresa || d.rutEmpresa || brandRut()),
    cliente: row.cliente_nombre || d.cliente || '',
    contacto: row.cliente_contacto || d.contacto || '',
    rut: row.cliente_rut || d.rut || '',
    direccion: row.cliente_direccion || d.direccion || '',
    giro: row.cliente_giro || d.giro || '',
    comuna: row.cliente_comuna || d.comuna || '',
    telefono: row.cliente_telefono || d.telefono || '',
    ciudad: row.cliente_ciudad || d.ciudad || '',
    email: row.cliente_email || d.email || '',
    vendedorNombre: row.vendedor_nombre || d.vendedorNombre || '',
    vendedorEmail: row.vendedor_email || d.vendedorEmail || '',
    asuntoTransferencia: row.asunto_transferencia || d.asuntoTransferencia || '',
    referencia: row.referencia || d.referencia || '',
    referencias: Array.isArray(d.referencias) ? d.referencias : ((row.referencia || d.referencia) ? String(row.referencia || d.referencia).split('\n') : ['']),
    observaciones: row.observaciones || d.observaciones || '',
    garantia: row.garantia || d.garantia || '',
    condiciones: row.condiciones || d.condiciones || '',
    items: Array.isArray(row.items) ? row.items : (Array.isArray(d.items) ? d.items : defaultDoc.items),
    savedAt: row.updated_at || row.created_at || d.savedAt || null,
    savedInSupabase: true,
    dirty: false
  };
  if (!doc.numeroReservado && !String(doc.observaciones || '').trim()) doc.observaciones = EJEMPLO_NOTAS;
  normalizeReferencias(doc);
  return doc;
}

async function loadSavedDocs(){
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('cotizacion_documentos')
      .select('*')
      .order('updated_at', { ascending:false })
      .limit(5000);
    if (error) throw error;
    saved = (data || []).map(row => ({id: row.id, doc: docFromDb(row), source:'supabase'}));
    localStorage.setItem('th_saved', JSON.stringify(saved));
  } catch (err) {
    console.error(err);
    saveStatus = { type:'bad', text:'No se pudieron cargar documentos desde PostgreSQL. Revisa la API y la base de datos.' };
  }
  render();
}

async function newDoc(kind=workflowMode){
  previewMode = 'actual';
  workflowMode = kind === 'presupuesto' ? 'presupuesto' : 'cotizacion';
  clearAutosave();
  state = {
    ...defaultDoc,
    id:null,
    documentKind:workflowMode,
    tipo:workflowMode === 'cotizacion' ? 'COTIZACIÓN' : 'PRESUPUESTO',
    estado:workflowMode === 'cotizacion' ? 'cotizacion_borrador' : 'pre_cotizacion',
    correspondePresupuesto:false,
    presupuestoOrigenId:null,
    presupuestoOrigenNumero:'',
    preNumero:'',
    numero:'',
    numeroReservado:false,
    serieCotizacion:'TH', origenDocumento:'sistema', importacionArchivo:'',
    fecha:today,
    vcto:'',
    moneda:'CLP',
    rutEmpresa: brandRut(),
    clienteId:null, contactoId:null,
    cliente:'', contacto:'', rut:'', direccion:'', giro:'', comuna:'', telefono:'', ciudad:'', email:'',
    vendedorNombre:brand.firmaNombre || '', vendedorEmail:brand.firmaEmail || brand.transferenciaEmailFallback || '', asuntoTransferencia:'',
    referencia:'', referencias:[{texto:'', items:[blankItem()]}], garantia:'30 días', condiciones:brand.condicionesDefault || '',
    preOrden:{servicio:'', caracteristicas:PRE_SPEC_LABELS.map(nombre=>({nombre, valor:''})), datosOperativos:[], cargos:[blankCargo()]},
    observaciones: brand.observacionesDefault || EJEMPLO_NOTAS,
    items:[],
    savedAt:null,
    savedInSupabase:false,
    dirty:true
  };
  saveStatus = workflowMode === 'cotizacion'
    ? { type:'warn', text:'Nueva cotización sin guardar. Indica si corresponde a un presupuesto y completa sus datos.' }
    : { type:'warn', text:'Nuevo presupuesto sin guardar. Guarda para imprimir o enviar al cliente.' };
  actionMessage = '';
  busyMessage = '';
  render();
}

function createQuoteFromBudget(id){
  const found = saved.find(item=>String(item.id) === String(id));
  const source = found?.doc || (!isQuoteDoc(state) ? state : null);
  if (!source || isQuoteDoc(source)) {
    saveStatus = {type:'bad', text:'Selecciona un presupuesto válido para crear la cotización.'};
    render();
    return;
  }

  const sourceDoc = JSON.parse(JSON.stringify(source));
  const snapshotDoc = JSON.parse(JSON.stringify({...sourceDoc, dirty:false}));
  delete snapshotDoc.preSnapshot;
  workflowMode = 'cotizacion';
  previewMode = 'actual';
  clearAutosave();
  state = {
    ...sourceDoc,
    id:null,
    documentKind:'cotizacion',
    tipo:'COTIZACIÓN',
    estado:'cotizacion_borrador',
    numero:'',
    numeroReservado:false,
    correspondePresupuesto:true,
    presupuestoOrigenId:source.id || id,
    presupuestoOrigenNumero:source.preNumero || '',
    preNumero:'',
    preSnapshot:{
      capturedAt:new Date().toISOString(),
      preNumero:source.preNumero || '',
      doc:snapshotDoc,
      totals:totalsPreOrden(snapshotDoc)
    },
    savedAt:null,
    savedInSupabase:false,
    dirty:true
  };
  normalizeReferencias(state);
  persist();
  saveStatus = {type:'ok', text:`Cotización creada desde el presupuesto ${source.preNumero || 'seleccionado'}. Se asignará un número al guardar.`};
  actionMessage = '';
  render();
}

async function selectBudgetForQuote(value){
  if (value === 'none') {
    await newDoc('cotizacion');
    state.correspondePresupuesto = false;
    state.presupuestoOrigenId = null;
    state.presupuestoOrigenNumero = '';
    saveStatus = {type:'warn', text:'Cotización marcada como independiente: no corresponde a un presupuesto.'};
    persist();
    render();
    return;
  }
  if (value) createQuoteFromBudget(value);
}

function showValidationError(text, selector){
  saveStatus = { type:'bad', text };
  actionMessage = '';
  render({preserveScroll:true});
  requestAnimationFrame(() => {
    const field = selector ? document.querySelector(selector) : null;
    if (!field) return;
    field.classList.add('validation-error');
    field.scrollIntoView({behavior:'smooth', block:'center'});
    field.focus({preventScroll:true});
    window.setTimeout(() => field.classList.remove('validation-error'), 2400);
  });
}

async function saveDoc(){
  if (savingDoc) return;
  const clientName = String(state.cliente || '').trim();
  const documentItems = (state.referencias || []).flatMap(ref => ref.items || []);
  const completedItems = documentItems.filter(item => String(item.descripcion || '').trim());
  const pricedItems = completedItems.filter(item => Number(item.cantidad) > 0 && Number(item.precio) > 0);

  if (!clientName) {
    showValidationError(`Ingresa el cliente antes de guardar ${isQuoteDoc() ? 'la cotización' : 'el presupuesto'}.`, '.client-name-input');
    return;
  }
  if (!completedItems.length) {
    showValidationError('Agrega al menos un ítem con descripción antes de guardar.', '.item-description-input');
    return;
  }
  if (!pricedItems.length) {
    showValidationError('Completa una cantidad y un precio mayor que cero en al menos un ítem.', '.item-price-input');
    return;
  }
  savingDoc = true;
  busyMessage = isQuoteDoc()
    ? 'Guardando cotización final...'
    : 'Guardando presupuesto...';
  actionMessage = '';
  saveStatus = { type:'warn', text:busyMessage };
  render();

  try {
    const quoteDoc = isQuoteDoc();
    if (quoteDoc && (!state.numeroReservado || !validFolio(state.numero))) {
      state.numero = '';
      state.numeroReservado = false;
      await reserveNextNumber({force:true});
      state.documentKind = 'cotizacion';
      state.tipo = 'COTIZACIÓN';
      state.estado = 'cotizacion_emitida';
    } else if (!quoteDoc) {
      await reservePreNumber();
    }
    if (supabaseClient) {
      const payload = buildDbPayload();
      let query;
      if (state.id) {
        query = supabaseClient.from('cotizacion_documentos').update(payload).eq('id', state.id);
      } else {
        query = supabaseClient.from('cotizacion_documentos').insert(payload);
      }
      const { data, error } = await query.select('*').single();
      if (error) throw error;
      state = docFromDb(data);
      actionMessage = state.numeroReservado
        ? 'Cotización guardada. Puede imprimir o guardar en PDF.'
        : 'Presupuesto guardado. Puede imprimirlo, enviarlo al cliente o crear una cotización vinculada.';
      saveStatus = { type:'ok', text:actionMessage };
      busyMessage = '';
      clearAutosave();
      await loadSavedDocs();
    } else {
      state.savedAt = new Date().toLocaleString('es-CL');
      state.savedInSupabase = false;
      state.dirty = false;
      const id = state.id || Date.now();
      state.id = id;
      const existing = saved.findIndex(x => String(x.doc.numero || x.doc.preNumero) === String(state.numero || state.preNumero));
      const record = {id, doc:JSON.parse(JSON.stringify(state)), source:'local'};
      if (existing >= 0) saved[existing] = record; else saved.unshift(record);
      localStorage.setItem('th_saved',JSON.stringify(saved.slice(0,50)));
      actionMessage = state.numeroReservado
        ? 'Cotización guardada. Puede imprimir o guardar en PDF.'
        : 'Presupuesto guardado. Puede imprimirlo, enviarlo al cliente o crear una cotización vinculada.';
      saveStatus = { type:'warn', text:`${actionMessage} Guardado local: para uso multiusuario necesitas PostgreSQL.` };
      busyMessage = '';
      clearAutosave();
    }
  } catch (err) {
    console.error(err);
    busyMessage = '';
    actionMessage = '';
    saveStatus = { type:'bad', text:`No se pudo guardar: ${errorText(err)}` };
  } finally {
    busyMessage = '';
    savingDoc = false;
    render();
  }
}

function loadDoc(id){
  previewMode = 'actual';
  const found = saved.find(x=>String(x.id)===String(id));
  if (!found) return;
  state = JSON.parse(JSON.stringify(found.doc));
  state.documentKind = documentKindOf(state);
  workflowMode = state.documentKind;
  state.numeroReservado = Boolean(state.numero);
  state.tipo = isQuoteDoc(state) ? 'COTIZACIÓN' : 'PRESUPUESTO';
  state.estado = isQuoteDoc(state) ? (state.numeroReservado ? 'cotizacion_emitida' : 'cotizacion_borrador') : 'pre_cotizacion';
  state.dirty = false;
  state.savedAt = state.savedAt || new Date().toISOString();
  saveStatus = state.numeroReservado
    ? { type:'ok', text:'Cotización cargada. PDF / Imprimir habilitado.' }
    : { type:'ok', text:'Presupuesto cargado. Puedes imprimirlo, editarlo o emitirlo si fue aprobado.' };
  clearAutosave();
  render();
}
async function deleteSaved(id){
  const found = saved.find(x=>String(x.id)===String(id));
  if (supabaseClient && found?.source === 'supabase') {
    const { error } = await supabaseClient.from('cotizacion_documentos').delete().eq('id', id);
    if (error) { saveStatus = {type:'bad', text:'No se pudo borrar en PostgreSQL.'}; render(); return; }
    await loadSavedDocs();
    return;
  }
  saved=saved.filter(x=>String(x.id)!==String(id));
  localStorage.setItem('th_saved',JSON.stringify(saved));
  render();
}

function render(renderOptions={}){
  const preserveScroll = Boolean(renderOptions.preserveScroll);
  const previousPanel = document.querySelector('.panel');
  const previousPanelScroll = preserveScroll && previousPanel ? previousPanel.scrollTop : 0;
  const t=totals();
  const statusClass = counterStatus.type === 'ok' ? 'ok' : counterStatus.type === 'bad' ? 'bad' : 'warn';
  const saveClass = saveStatus.type === 'ok' ? 'ok' : saveStatus.type === 'bad' ? 'bad' : 'warn';
  const exportDisabled = !canExport() || savingDoc;
  const isFinal = isQuoteDoc();
  const availableBudgets = budgetDocuments();
  const visibleSaved = (isFinal ? quoteDocuments() : availableBudgets).slice(0, 80);
  const clientsForSelect = filteredClients().slice(0, 120);
  const previousClientDocs = clientPreviousDocuments();
  const docLabel = isFinal ? 'COTIZACIÓN' : 'PRESUPUESTO';
  const displayNumber = loadingNumber
    ? '...'
    : isFinal
      ? (state.numero || 'SE ASIGNARÁ AL GUARDAR')
      : (state.preNumero || 'SIN GUARDAR');
  const printTitle = isFinal ? 'Exportar cotización / PDF' : 'Imprimir presupuesto / PDF';
  const exportTitle = exportDisabled ? 'Primero guarda el documento actual' : '';
  const hasPreSnapshot = Boolean(isFinal && state.preSnapshot?.doc);
  const previewDoc = hasPreSnapshot && previewMode === 'pre' ? state.preSnapshot.doc : state;
  const previewPreTotals = hasPreSnapshot && previewMode === 'pre'
    ? (state.preSnapshot.totals || totalsPreOrden(previewDoc))
    : totalsPreOrden(state);
  const previewPreNumber = hasPreSnapshot && previewMode === 'pre'
    ? (state.preSnapshot.preNumero || previewDoc.preNumero || 'PRESUPUESTO GUARDADO')
    : displayNumber;
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML=`
  <main class="app">
    ${busyMessage ? `<div class="busy-overlay" role="alert" aria-live="assertive"><div class="busy-box"><div class="spinner"></div><b>${esc(busyMessage)}</b><span>Espere unos segundos. No cierre la página ni presione otro botón.</span></div></div>` : ''}
    <aside class="panel">
      <h1>${isFinal ? 'Cotizaciones ERP' : 'Presupuestos ERP'}</h1>
      <p class="sub">${isFinal ? 'Crea una cotización desde un presupuesto existente o indícala como independiente.' : 'Prepara y guarda presupuestos técnicos sin convertirlos automáticamente en cotizaciones.'}</p>

      ${isFinal ? `
        <div class="origin-box">
          <div class="origin-title">Origen de la cotización</div>
          <div class="field">
            <label>¿Esta cotización corresponde a un presupuesto?</label>
            <select onchange="selectBudgetForQuote(this.value)">
              <option value="none" ${!state.correspondePresupuesto ? 'selected' : ''}>No corresponde a un presupuesto</option>
              ${availableBudgets.map(item=>`<option value="${esc(item.id)}" ${state.correspondePresupuesto && String(state.presupuestoOrigenId) === String(item.id) ? 'selected' : ''}>Sí · ${esc(item.doc.preNumero || 'Presupuesto sin N°')} · ${esc(item.doc.cliente || 'Sin cliente')}</option>`).join('')}
            </select>
          </div>
          <div class="origin-summary ${state.correspondePresupuesto ? 'linked' : 'independent'}">
            ${state.correspondePresupuesto
              ? `Vinculada al presupuesto <b>${esc(state.presupuestoOrigenNumero || 'seleccionado')}</b>. Sus datos fueron copiados y pueden ajustarse en esta cotización.`
              : 'Cotización independiente. Quedará registrada como “no corresponde a presupuesto”.'}
          </div>
          ${!availableBudgets.length ? '<p class="small">No hay presupuestos guardados. Puede continuar con una cotización independiente.</p>' : ''}
        </div>
      ` : ''}

      <div class="section-title">Documento</div>
      <div class="status"><span class="dot ${statusClass}"></span><span>${esc(counterStatus.text)}</span></div>
      <div class="status"><span class="dot ${saveClass}"></span><span>${esc(saveStatus.text)}</span></div>
      ${actionMessage ? `<div class="action-message"><b>${esc(actionMessage)}</b></div>` : ''}
      ${autosaveText() ? `<div class="status"><span class="dot warn"></span><span>${esc(autosaveText())}</span></div>` : ''}
      <div class="grid">
        <div class="field">
          <label>Tipo</label>
          <input readonly value="${esc(docLabel)}">
        </div>
        <div class="field">
          <label>${isFinal ? 'N° Cotización' : 'N° Presupuesto'}</label>
          <input class="locked-number" readonly value="${esc(displayNumber)}" title="Número bloqueado">
          <span class="small">${isFinal ? (state.numeroReservado ? 'Número final bloqueado.' : 'El número final se asignará al guardar.') : 'El folio del presupuesto se asignará al guardar.'}</span>
        </div>
        <div class="field"><label>Fecha emisión</label><input type="date" value="${esc(state.fecha)}" oninput="setSilent('fecha',this.value)" onchange="render({preserveScroll:true})"></div>
        <div class="field"><label>Moneda</label><select onchange="setSilent('moneda',this.value);render({preserveScroll:true})"><option value="CLP" ${currentCurrency(state)==='CLP'?'selected':''}>Pesos CLP ($)</option><option value="UF" ${currentCurrency(state)==='UF'?'selected':''}>UF</option><option value="USD" ${currentCurrency(state)==='USD'?'selected':''}>Dólares USD (US$)</option></select></div>
        ${isFinal ? `<div class="field"><label>Fecha vencimiento</label><input type="date" value="${esc(state.vcto)}" oninput="setSilent('vcto',this.value)" onchange="render({preserveScroll:true})"></div>` : ''}
      </div>

      <div class="section-title">${isFinal ? 'Cliente cotización final' : 'Cliente presupuesto'}</div>
      <div class="registered-client-box">
        <div class="field"><label>Buscar cliente anterior</label><input value="${esc(clientSearch)}" oninput="setClientSearch(this.value)" placeholder="Nombre, RUT, correo o teléfono"></div>
        <div class="field"><label>Usar cliente registrado</label><select onchange="selectRegisteredClient(this.value)"><option value="manual" ${!state.clienteId ? 'selected' : ''}>Ingreso manual / cliente nuevo</option>${clientsForSelect.map(client=>`<option value="${esc(client.id)}" ${String(state.clienteId)===String(client.id)?'selected':''}>${esc(clientDisplayName(client))}${client.rut ? ` · ${esc(client.rut)}` : ''}</option>`).join('')}</select></div>
        ${state.clienteId && clientContacts().length ? `<div class="field"><label>Contacto registrado</label><select onchange="selectRegisteredContact(this.value)">${clientContacts().map(contact=>`<option value="${esc(contact.id)}" ${String(state.contactoId)===String(contact.id)?'selected':''}>${esc(contact.nombre)}${contact.cargo ? ` · ${esc(contact.cargo)}` : ''}</option>`).join('')}</select></div>` : ''}
        <p class="small">Al elegir un cliente se completan automáticamente razón social, RUT, dirección, contacto, teléfono y correo. Puedes ajustarlos solo para este documento.</p>
        ${previousClientDocs.length ? `
          <div class="client-history">
            <b>Documentos anteriores de este cliente</b>
            ${previousClientDocs.map(item=>`
              <div class="client-history-row">
                <span>${esc(isQuoteDoc(item.doc) ? quoteIdentifier(item.doc, '') : 'PRESUPUESTO ' + (item.doc.preNumero || 'SIN N°'))}<small>${esc(item.doc.savedAt || '')}</small></span>
                <div class="btns">
                  <button class="ghost" onclick="loadDoc('${esc(item.id)}')">Abrir original</button>
                  <button class="primary" onclick="duplicateSavedDoc('${esc(item.id)}')">Copiar como nuevo</button>
                </div>
              </div>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="field"><label>Señor(es) *</label><input class="client-name-input" aria-required="true" value="${esc(state.cliente)}" oninput="setSilent('cliente',this.value)" onchange="render({preserveScroll:true})" placeholder="Cliente"></div>
      <div class="grid">
        <div class="field"><label>Contacto</label><input value="${esc(state.contacto)}" oninput="setSilent('contacto',this.value)" onchange="render({preserveScroll:true})" placeholder="Sandra Nuñez"></div>
        <div class="field"><label>RUT cliente</label><input inputmode="text" autocomplete="off" value="${esc(state.rut)}" oninput="this.value=formatRut(this.value);setRutSilent(this.value)" onchange="render({preserveScroll:true})" placeholder="12.345.678-9"></div>
        <div class="field"><label>Dirección</label><input value="${esc(state.direccion)}" oninput="setSilent('direccion',this.value)" onchange="render({preserveScroll:true})" placeholder="Av. Ejemplo 1234"></div>
        <div class="field"><label>Teléfono</label><input inputmode="numeric" autocomplete="off" value="${esc(state.telefono)}" oninput="this.value=formatPhone(this.value);setPhoneSilent(this.value)" onchange="render({preserveScroll:true})" placeholder="56961280283"></div>
        <div class="field"><label>E-mail</label><input value="${esc(state.email)}" oninput="setSilent('email',this.value)" onchange="render({preserveScroll:true})" placeholder="sandra.nunez1@walmart.com"></div>
        ${isFinal ? `
          <div class="field"><label>Giro</label><input value="${esc(state.giro)}" oninput="setSilent('giro',this.value)" onchange="render({preserveScroll:true})"></div>
          <div class="field"><label>Región</label><select onchange="setRegionSilent(this.value)">${options(REGIONES_COMUNAS.map(r=>r.region), state.ciudad, 'Selecciona región')}</select></div>
          <div class="field"><label>Comuna</label><select ${state.ciudad ? '' : 'disabled'} onchange="setSilent('comuna',this.value);render({preserveScroll:true})">${options(getComunas(state.ciudad), state.comuna, state.ciudad ? 'Selecciona comuna' : 'Primero selecciona región')}</select></div>
        ` : ''}
      </div>

      <div class="seller-info-box">
        <div class="seller-info-title">Información interna para vendedores</div>
        <div class="seller-rules">
          <span><b>${clpMoney(brand.comisionArriendoMensual)}</b> por mes de arriendo</span>
          <span><b>${esc(brand.comisionTrabajoHidraulicoPct)}%</b> de la ganancia por trabajo hidráulico</span>
          <span><b>${clpMoney(brand.comisionVentaApilador)}</b> por venta de apilador</span>
        </div>
        <div class="seller-transfer"><b>Transferencia:</b> ${esc(brandName())} · ${esc(brand.transferenciaBanco)} · ${esc(brand.transferenciaTipoCuenta)} N° ${esc(brand.transferenciaNumeroCuenta)} · RUT ${esc(brand.transferenciaRut || brandRut())}<br><b>Correo:</b> ${esc(sellerEmail(state))}<br><b>Asunto:</b> ${esc(transferSubject(state))}</div>
        <p class="small">Esta tarjeta es interna. Las comisiones no aparecen en el PDF del cliente.</p>
      </div>

      ${!isFinal ? `
      <div class="section-title">Presupuesto técnico</div>
      <div class="field"><label>Título / servicio destacado</label><textarea placeholder="${esc(EJEMPLO_SERVICIO)}" oninput="setPreOrdenSilent('servicio',this.value)" onchange="render({preserveScroll:true})">${esc(state.preOrden?.servicio || '')}</textarea></div>
      <div class="technical-box fixed-spec-box">
        <div class="section-title item-section-title">Características técnicas</div>
        <p class="small">Los nombres quedan fijos en el presupuesto. Completa solo el valor de cada línea.</p>
        ${fixedPreSpecs(state.preOrden).map((it,i)=>`
          <div class="fixed-spec-row">
            <div class="fixed-spec-name">${esc(it.nombre)}</div>
            <div class="field">
              <label>Valor</label>
              <input value="${esc(it.valor)}" oninput="setSpecSilent('caracteristicas',${i},'valor',this.value)" onchange="render({preserveScroll:true})" placeholder="${esc(specExample(i))}">
            </div>
          </div>`).join('')}
      </div>
      <div class="section-title item-section-title">Cargos adicionales de reparación</div>
      ${(state.preOrden?.cargos || []).map((it,i)=>`
        <div class="cargo-row">
          <div class="field"><label>Detalle</label><input value="${esc(it.detalle)}" oninput="setCargoSilent(${i},'detalle',this.value)" onchange="render({preserveScroll:true})" placeholder="Cambio Blue Spot dañado Orden de trabajo 47387"></div>
          <div class="field"><label>Cantidad</label><input type="number" value="${esc(it.cantidad)}" oninput="setCargoSilent(${i},'cantidad',this.value)" onchange="render({preserveScroll:true})"></div>
          <div class="field"><label>Valor unitario ${currentCurrency(state)}</label><input type="number" step="0.01" value="${esc(it.precio)}" oninput="setCargoSilent(${i},'precio',this.value)" onchange="render({preserveScroll:true})" placeholder="${pricePlaceholder(state,true)}"></div>
          <div class="field"><label>Total</label><input readonly value="${money(subtotalCargo(it))}"></div>
          <button class="danger" onclick="delCargo(${i})">Eliminar</button>
        </div>`).join('')}
      <button class="ghost" onclick="addCargo()">+ Agregar cargo adicional</button>
      ` : ''}

      <div class="section-title">${isFinal ? 'Referencias' : 'Ítems del presupuesto'}</div>
      ${(state.referencias || []).map((ref,r)=>`
        <div class="reference-block">
          ${isFinal ? `<div class="reference-row">
            <div class="field"><label>Referencia ${r+1}</label><textarea placeholder="Arriendo equipo apilador eléctrico" oninput="setReferenciaSilent(${r},this.value)" onchange="render({preserveScroll:true})">${esc(ref.texto)}</textarea></div>
            <button class="danger" onclick="delReferencia(${r})" ${(state.referencias || []).length <= 1 ? 'disabled' : ''}>Eliminar referencia</button>
          </div>` : ''}
          <div class="quick-import">
            <div>
              <b>Pegar tabla rápida</b>
              <p>Admite tablas tipo ChatGPT con Descripción, Cant. y Valor unitario neto. Subtotal, IVA y total se ignoran.</p>
            </div>
            <textarea id="quick-import-${r}" placeholder="| Descripción | Cant. | Valor unitario neto |
| --- | ---: | ---: |
| Cilindro hidráulico doble efecto Ø125/Ø110 × 900 mm | 1 | $5.890.000 |"></textarea>
            <button class="ghost" onclick="importChatGptItems(${r})">Importar tabla</button>
          </div>
          <div class="section-title item-section-title">${isFinal ? `Ítems referencia ${r+1}` : 'Detalle del cobro'}</div>
          ${(ref.items || []).map((it,i)=>`
            <div class="item-row">
              <div class="grid">
                ${isFinal ? `<div class="field"><label>Código</label><input value="${esc(it.codigo)}" oninput="setRefItemSilent(${r},${i},'codigo',this.value)" onchange="render({preserveScroll:true})" placeholder="ETV 214"></div>` : ''}
                <div class="field item-description-field"><label>Descripción *</label><textarea class="item-description-input" aria-required="true" placeholder="Arriendo mensual apilador eléctrico ETV 214" oninput="setRefItemSilent(${r},${i},'descripcion',this.value)" onchange="render({preserveScroll:true})">${esc(it.descripcion)}</textarea></div>
                <div class="field"><label>Cantidad *</label><input class="item-quantity-input" aria-required="true" type="number" value="${esc(it.cantidad)}" oninput="setRefItemSilent(${r},${i},'cantidad',this.value)" onchange="render({preserveScroll:true})"></div>
                ${isFinal ? `<div class="field"><label>U.M.</label><input value="${esc(it.um)}" oninput="setRefItemSilent(${r},${i},'um',this.value)" onchange="render({preserveScroll:true})"></div>` : ''}
                <div class="field"><label>Precio ${currentCurrency(state)} *</label><input class="item-price-input" aria-required="true" type="number" step="0.01" value="${esc(it.precio)}" oninput="setRefItemSilent(${r},${i},'precio',this.value)" onchange="render({preserveScroll:true})" placeholder="${pricePlaceholder(state)}"></div>
                ${isFinal ? `<div class="field"><label>Dscto %</label><input type="number" value="${esc(it.dscto)}" oninput="setRefItemSilent(${r},${i},'dscto',this.value)" onchange="render({preserveScroll:true})"></div>` : ''}
                <div class="field"><label>Subtotal</label><input readonly value="${money(subtotalItem(it))}"></div>
                <button class="danger" onclick="delRefItem(${r},${i})">Eliminar ítem</button>
              </div>
            </div>`).join('')}
          <button class="ghost" onclick="addRefItem(${r})">+ Agregar ítem${isFinal ? ` a referencia ${r+1}` : ''}</button>
        </div>`).join('')}
      ${isFinal ? '<button class="ghost" onclick="addReferencia()">+ Agregar referencia</button>' : ''}

      <div class="section-title">Observaciones</div>
      <div class="field"><label>${isFinal ? 'Observaciones cotización' : 'Notas del presupuesto'}</label><textarea class="notes-input" placeholder="${esc(EJEMPLO_NOTAS)}" oninput="setSilent('observaciones',this.value)" onchange="render({preserveScroll:true})">${esc(state.observaciones)}</textarea></div>
      <div class="field"><label>${isFinal ? 'Garantía' : 'Garantía / validez'}</label><input value="${esc(state.garantia)}" oninput="setSilent('garantia',this.value)" onchange="render({preserveScroll:true})" placeholder="15 días"></div>
      <div class="field"><label>${isFinal ? 'Condiciones comerciales' : 'Condiciones / forma de pago'}</label><textarea placeholder="30 días" oninput="setSilent('condiciones',this.value)" onchange="render({preserveScroll:true})">${esc(state.condiciones||'')}</textarea></div>

      ${saveStatus.type === 'bad' ? `<div class="validation-feedback" role="alert"><b>No se pudo guardar.</b><span>${esc(saveStatus.text)}</span></div>` : ''}
      <div class="btns sticky-actions">
        <button class="green" onclick="window.print()" ${exportDisabled ? `disabled title="${esc(exportTitle)}"` : ''}>${esc(printTitle)}</button>
        <button class="yellow" onclick="saveDoc()" ${savingDoc?'disabled':''}>${savingDoc ? 'Guardando...' : (state.savedAt && !state.dirty ? 'Guardar cambios' : (isFinal ? 'Guardar cotización' : 'Guardar presupuesto'))}</button>
        ${hasPreSnapshot ? `<button class="ghost" onclick="setPreviewMode('${previewMode === 'pre' ? 'actual' : 'pre'}')">${previewMode === 'pre' ? 'Ver cotización final' : 'Ver presupuesto guardado'}</button>` : ''}
        <button class="ghost" onclick="newDoc('${isFinal ? 'cotizacion' : 'presupuesto'}')" ${loadingNumber || savingDoc?'disabled':''}>+ ${isFinal ? 'Nueva cotización' : 'Nuevo presupuesto'}</button>
      </div>

      <div class="section-title">${isFinal ? 'Cotizaciones guardadas' : 'Presupuestos guardados'}</div>
      ${isFinal ? `
        <div class="export-box">
          <div>
            <b>Exportación para migración</b>
            <p>Descarga todas las cotizaciones cargadas desde PostgreSQL. CSV para planillas, JSON para traspasar datos completos e ítems.</p>
          </div>
          <div class="btns">
            <button class="primary" onclick="exportDocuments('cotizaciones','csv')">Exportar cotizaciones CSV</button>
            <button class="ghost" onclick="exportDocuments('cotizaciones','json')">Exportar cotizaciones JSON</button>
            <button class="ghost" onclick="exportDocuments('todo','json')">Exportar todo JSON</button>
          </div>
        </div>
      ` : ''}
      <div class="saved-list">${visibleSaved.map(s=>`<div class="saved"><b>${esc(isQuoteDoc(s.doc) ? quoteIdentifier(s.doc, s.id) : 'PRESUPUESTO ' + (s.doc.preNumero || 'SIN N°'))}</b><span>${esc(s.doc.cliente || 'Sin cliente')} · ${esc(s.doc.savedAt||'')}</span>${isQuoteDoc(s.doc) ? `<span class="saved-origin">${s.doc.origenDocumento === 'importado' ? `Importada${s.doc.importacionArchivo ? ` desde ${esc(s.doc.importacionArchivo)}` : ''}` : s.doc.correspondePresupuesto ? `Presupuesto: ${esc(s.doc.presupuestoOrigenNumero || 'vinculado')}` : 'Sin presupuesto asociado'}</span>` : ''}<div class="btns"><button class="ghost" onclick="loadDoc('${esc(s.id)}')">Abrir</button><button class="primary" onclick="duplicateSavedDoc('${esc(s.id)}')">Copiar como nueva</button><button class="danger" onclick="deleteSaved('${esc(s.id)}')">Borrar</button></div></div>`).join('')||`<p class="small">Aún no hay ${isFinal ? 'cotizaciones' : 'presupuestos'} guardados.</p>`}</div>
      ${((isFinal ? quoteDocuments() : availableBudgets).length > visibleSaved.length) ? `<p class="small">Mostrando los últimos ${visibleSaved.length}. La exportación usa todos los documentos cargados.</p>` : ''}
    </aside>

    <section class="preview-wrap">
      ${isFinal && previewMode !== 'pre' ? renderCotizacionSheet(t, docLabel, displayNumber) : renderPreOrdenSheet(previewPreTotals, previewPreNumber, previewDoc)}
    </section>
  </main>`;
  if (preserveScroll) {
    const panel = app.querySelector('.panel');
    if (panel) panel.scrollTop = previousPanelScroll;
  }
}

async function boot(){
  initSupabase();
  await loadBranding();
  render();
  await loadSavedDocs();
}

function showBootError(err){
  console.error(err);
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <main class="app">
      <aside class="panel">
        <h1>Cotizaciones ERP</h1>
        <div class="status"><span class="dot bad"></span><span>Error al iniciar la aplicación.</span></div>
        <p class="sub">Revisa la conexión con la API PostgreSQL, la consola del navegador o vuelve a copiar todos los archivos del proyecto.</p>
        <pre class="small">${esc(err?.message || err)}</pre>
      </aside>
    </main>`;
}

function startApp(){
  boot().catch(showBootError);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
