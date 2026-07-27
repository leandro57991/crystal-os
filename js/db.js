/* =========================================================
   Crystal OS — db.js
   CrystalDB: IndexedDB wrapper
   Stores: cotizaciones, clientes, visitas, reportes,
           asistencia, cobros, pagos, inventario, notificaciones
   ========================================================= */

const DB_NAME    = 'CrystalOS';
const DB_VERSION = 3;

let _db = null;

const STORES = [
  { name: 'cotizaciones',    keyPath: 'id',  indexes: [['numero','numero',{unique:true}],['clienteId','clienteId'],['estado','estado'],['fecha','fecha']] },
  { name: 'clientes',        keyPath: 'id',  indexes: [['nombre','nombre'],['telefono','telefono']] },
  { name: 'visitas',         keyPath: 'id',  indexes: [['fecha','fecha'],['estado','estado']] },
  { name: 'proyectos',       keyPath: 'id',  indexes: [['nombre','nombre'],['estado','estado']] },
  { name: 'reportes',        keyPath: 'id',  indexes: [['fecha','fecha'],['trabajadorId','trabajadorId'],['proyectoId','proyectoId']] },
  { name: 'trabajadores',    keyPath: 'id',  indexes: [['nombre','nombre']] },
  { name: 'asistencia',      keyPath: 'id',  indexes: [['fecha','fecha'],['trabajadorId','trabajadorId']] },
  { name: 'cobros',          keyPath: 'id',  indexes: [['clienteId','clienteId'],['estado','estado'],['vencimiento','vencimiento']] },
  { name: 'pagos',           keyPath: 'id',  indexes: [['cobroId','cobroId'],['fecha','fecha']] },
  { name: 'inventario',      keyPath: 'id',  indexes: [['nombre','nombre'],['categoria','categoria']] },
  { name: 'movimientos_inv', keyPath: 'id',  indexes: [['itemId','itemId'],['fecha','fecha']] },
  { name: 'notificaciones',  keyPath: 'id',  indexes: [['leida','leida'],['fecha','fecha']] },
  { name: 'recordatorios',   keyPath: 'id',  indexes: [['fecha','fecha'],['hora','hora'],['activo','activo']] },
  { name: 'biblioteca',      keyPath: 'id',  indexes: [['carpeta','carpeta'],['etiquetas','etiquetas']] },
  { name: 'config',          keyPath: 'key', indexes: [] },
  { name: 'usuarios',        keyPath: 'id',  indexes: [['usuario','usuario',{unique:true}]] },
];

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach(({ name, keyPath, indexes }) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath, autoIncrement: keyPath === 'id' });
          indexes.forEach(([idxName, field, opts={}]) => store.createIndex(idxName, field, opts));
        }
      });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

/* Generic CRUD ------------------------------------------------- */

async function getAll(store, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const s   = tx.objectStore(store);
    const req = indexName
      ? s.index(indexName).getAll(value)
      : s.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function getOne(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function save(store, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const s   = tx.objectStore(store);
    if (!record.id && s.keyPath === 'id') {
      record = { ...record, id: uid(), creadoEn: new Date().toISOString() };
    }
    record.actualizadoEn = new Date().toISOString();
    const req = s.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror   = () => reject(req.error);
  });
}

async function remove(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror   = () => reject(req.error);
  });
}

async function getConfig(key, fallback = null) {
  const rec = await getOne('config', key);
  return rec ? rec.value : fallback;
}

async function setConfig(key, value) {
  return save('config', { key, value });
}

/* ── COTIZACIONES ─────────────────────────────────────── */

async function nextNumeroCotizacion() {
  const last = await getConfig('ultimo_numero_cotizacion', 1805);
  const next = last + 1;
  await setConfig('ultimo_numero_cotizacion', next);
  return next;
}

async function saveCotizacion(data) {
  if (!data.numero) data.numero = await nextNumeroCotizacion();
  data.fecha = data.fecha || new Date().toISOString().slice(0,10);
  return save('cotizaciones', data);
}

async function getCotizaciones(filtro) {
  const todas = await getAll('cotizaciones');
  if (!filtro) return todas.sort((a,b) => b.numero - a.numero);
  return todas.filter(filtro).sort((a,b) => b.numero - a.numero);
}

async function getCotizacion(id) { return getOne('cotizaciones', id); }

async function updateEstadoCotizacion(id, estado) {
  const c = await getCotizacion(id);
  if (!c) return;
  c.estado = estado;
  return save('cotizaciones', c);
}

async function deleteCotizacion(id) {
  return remove('cotizaciones', id);
}

/* ── CLIENTES ─────────────────────────────────────────── */

async function saveCliente(data) {
  return save('clientes', data);
}

async function getClientes() {
  return getAll('clientes');
}

async function findOrCreateCliente(nombre, tel, email) {
  const todos = await getAll('clientes');
  let c = todos.find(x => x.telefono === tel);
  if (!c) c = await save('clientes', { nombre, telefono: tel, email });
  return c;
}

/* ── VISITAS ─────────────────────────────────────────── */

async function saveVisita(data) { return save('visitas', data); }
async function getVisitas() { return getAll('visitas'); }
async function getVisitasByMes(year, month) {
  const todas = await getAll('visitas');
  return todas.filter(v => {
    const d = new Date(v.fecha);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}
async function deleteVisita(id) { return remove('visitas', id); }

/* ── PROYECTOS ─────────────────────────────────────────── */

async function saveProyecto(data) { return save('proyectos', data); }
async function getProyectos() { return getAll('proyectos'); }
async function getProyectosActivos() {
  const todos = await getAll('proyectos');
  return todos.filter(p => p.estado !== 'Terminado' && p.estado !== 'Cancelado');
}

/* ── TRABAJADORES ─────────────────────────────────────── */

async function getTrabajadores() { return getAll('trabajadores'); }
async function saveTrabajador(data) { return save('trabajadores', data); }
async function deleteTrabajador(id) { return remove('trabajadores', id); }

/* ── REPORTES DIARIOS ─────────────────────────────────── */

async function saveReporte(data) {
  data.fecha = data.fecha || new Date().toISOString().slice(0,10);
  return save('reportes', data);
}
async function getReportesByFecha(fecha) {
  return getAll('reportes', 'fecha', fecha);
}
async function getReportesByTrabajador(tid) {
  return getAll('reportes', 'trabajadorId', tid);
}

/* ── ASISTENCIA ─────────────────────────────────────── */

async function saveAsistencia(data) {
  data.fecha = data.fecha || new Date().toISOString().slice(0,10);
  return save('asistencia', data);
}
async function getAsistenciaByRango(desde, hasta) {
  const todos = await getAll('asistencia');
  return todos.filter(a => a.fecha >= desde && a.fecha <= hasta);
}
async function getAsistenciaByFecha(fecha) {
  return getAll('asistencia', 'fecha', fecha);
}
async function deleteAsistencia(id) { return remove('asistencia', id); }

/* ── COBROS / CUENTAS POR COBRAR ─────────────────────── */

async function saveCobro(data) { return save('cobros', data); }
async function getCobros() { return getAll('cobros'); }
async function registrarPago(cobroId, monto, fecha, metodo, notas) {
  const cobro = await getOne('cobros', cobroId);
  if (!cobro) throw new Error('Cobro no encontrado');
  const pagado = Math.max((cobro.pagado || 0) + parseFloat(monto), 0);
  cobro.pagado = pagado;
  cobro.saldo  = cobro.total - pagado;
  cobro.estado = cobro.saldo <= 0.01 ? 'Pagado' : (pagado > 0 ? 'Parcial' : 'Pendiente');
  await save('cobros', cobro);
  return save('pagos', { cobroId, monto: parseFloat(monto), fecha, metodo, notas });
}
async function getPagosByCobro(cobroId) {
  return getAll('pagos', 'cobroId', cobroId);
}

/* ── INVENTARIO ─────────────────────────────────────── */

async function saveItemInventario(data) { return save('inventario', data); }
async function getInventario() { return getAll('inventario'); }
async function movimientoInventario(itemId, tipo, cantidad, notas, proyectoId) {
  const item = await getOne('inventario', itemId);
  if (!item) throw new Error('Item no encontrado');
  const delta = tipo === 'entrada' ? cantidad : -cantidad;
  item.stock  = (item.stock || 0) + delta;
  await save('inventario', item);
  return save('movimientos_inv', { itemId, tipo, cantidad, notas, proyectoId, fecha: new Date().toISOString().slice(0,10) });
}

/* ── NOTIFICACIONES ─────────────────────────────────── */

async function addNotificacion(titulo, descripcion, tipo='info', link='') {
  return save('notificaciones', {
    titulo, descripcion, tipo, link,
    leida: false,
    fecha: new Date().toISOString()
  });
}
async function getNotificacionesPendientes() {
  const todas = await getAll('notificaciones');
  return todas.filter(n => !n.leida).sort((a,b) => b.fecha.localeCompare(a.fecha));
}
async function marcarLeida(id) {
  const n = await getOne('notificaciones', id);
  if (n) { n.leida = true; await save('notificaciones', n); }
}

/* ── RECORDATORIOS ───────────────────────────────────── */

async function saveRecordatorio(data) { return save('recordatorios', data); }
async function getRecordatorios() {
  const todos = await getAll('recordatorios');
  return todos.sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
}
async function getRecordatoriosActivos(fecha) {
  const todos = await getAll('recordatorios');
  return todos.filter(r => r.activo !== false && (!r.fecha || r.fecha === fecha || r.repetir));
}
async function removeRecordatorio(id) { return remove('recordatorios', id); }

/* ── USUARIOS ─────────────────────────────────────────── */

async function getUsuario(usuario) {
  const todos = await getAll('usuarios');
  return todos.find(u => u.usuario === usuario) || null;
}
async function saveUsuario(data) { return save('usuarios', data); }

/* ── SEED DATA (carga inicial si DB vacía) ───────────── */

async function seedIfEmpty() {
  // Usuarios — siempre verificar, independiente de si hay otros datos
  const existeAdmin = await getUsuario('admin123');
  if (!existeAdmin) {
    await save('usuarios', {
      usuario:  'admin123',
      password: 'venezuela2026',
      nombre:   'Administrador',
      rol:      'gerente',
      email:    'crystalservicejj@gmail.com',
    });
    console.log('[CrystalDB] Usuario admin123 creado');
  }
  const existeIveth = await getUsuario('Iveth123');
  if (!existeIveth) {
    await save('usuarios', {
      usuario:  'Iveth123',
      password: 'Panama2026',
      nombre:   'Iveth',
      rol:      'oficina',
      email:    '',
    });
    console.log('[CrystalDB] Usuario Iveth123 creado');
  }
  const existeCotizador = await getUsuario('cotizador');
  if (!existeCotizador) {
    await save('usuarios', {
      usuario:  'cotizador',
      password: 'Crystal2026',
      nombre:   'Cotizador',
      rol:      'cotizador',
      email:    '',
    });
    console.log('[CrystalDB] Usuario cotizador creado');
  }

  // Lo demás solo si es primera vez (sin trabajadores)
  const workers = await getAll('trabajadores');
  if (workers.length > 0) return;

  // Trabajadores
  const tw = [
    { nombre: 'Francisco', rol: 'Técnico',   tarifaDia: 45, tarifaSemana: 270, tarifaNoche: null },
    { nombre: 'Jesús',     rol: 'Técnico',   tarifaDia: 50, tarifaSemana: null, tarifaNoche: 60  },
    { nombre: 'Ricardo',   rol: 'Ayudante',  tarifaDia: 35, tarifaSemana: 210, tarifaNoche: 45  },
    { nombre: 'José Goyo', rol: 'Ayudante',  tarifaDia: 35, tarifaSemana: 210, tarifaNoche: 45  },
    { nombre: 'Antony',    rol: 'Eventual',  tarifaDia: 40, tarifaSemana: null, tarifaNoche: null },
  ];
  for (const t of tw) await save('trabajadores', t);

  // Config inicial
  await setConfig('ultimo_numero_cotizacion', 1819);
  await setConfig('itbms', 0.07);
  await setConfig('empresa_nombre', 'Crystal Services Panamá');
  await setConfig('empresa_tel', '6456-2658');
  await setConfig('empresa_email', 'crystalservicejj@gmail.com');

  // Precios base de materiales (por m²)
  const precios = [
    { nombre: 'Vidrio templado 6mm claro',       precio: 45,  unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Vidrio templado 8mm claro',        precio: 65,  unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Vidrio templado 10mm claro',       precio: 85,  unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Vidrio templado 12mm claro',       precio: 110, unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Vidrio templado gris',             precio: 55,  unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Vidrio insulado',                  precio: 120, unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Vidrio insulado bronce',           precio: 135, unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Vidrio laminado',                  precio: 90,  unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Smart Glass',                      precio: 350, unidad: 'm²', categoria: 'Smart' },
    { nombre: 'Sistema corredizo aluminio',       precio: 180, unidad: 'm²', categoria: 'Aluminio' },
    { nombre: 'Sistema plegable aluminio',        precio: 220, unidad: 'm²', categoria: 'Aluminio' },
    { nombre: 'Sistema pivotante',                precio: 250, unidad: 'm²', categoria: 'Aluminio' },
    { nombre: 'Puerta ducha Eolo',                precio: 320, unidad: 'unidad', categoria: 'Ducha' },
    { nombre: 'Puerta ducha Aqua',                precio: 280, unidad: 'unidad', categoria: 'Ducha' },
    { nombre: 'Baranda vidrio templado',          precio: 95,  unidad: 'm²', categoria: 'Baranda' },
    { nombre: 'Ventana proyectante aluminio',     precio: 160, unidad: 'm²', categoria: 'Aluminio' },
    { nombre: 'Ventana guillotina aluminio',      precio: 155, unidad: 'm²', categoria: 'Aluminio' },
    { nombre: 'Louver vidrio',                    precio: 75,  unidad: 'm²', categoria: 'Vidrio' },
    { nombre: 'Fachada vidrio',                   precio: 200, unidad: 'm²', categoria: 'Fachada' },
    { nombre: 'Mano de obra instalación',         precio: 0,   unidad: 'global', categoria: 'Servicio' },
    { nombre: 'Herraje complementario',           precio: 0,   unidad: 'global', categoria: 'Herraje' },
    { nombre: 'Cierra puerta automático',         precio: 180, unidad: 'unidad', categoria: 'Herraje' },
    { nombre: 'Control de acceso',                precio: 350, unidad: 'unidad', categoria: 'Herraje' },
  ];
  for (const p of precios) await save('inventario', { ...p, stock: 0, stockMinimo: 0 });

  // Muestra de proyectos activos
  const proyectos = [
    { nombre: 'Smart Fit San Francisco',  cliente: 'Smart Fit',   estado: 'En proceso', tipo: 'Comercial' },
    { nombre: 'Nairobia Escruceria',       cliente: 'Nairobia',    estado: 'En proceso', tipo: 'Residencial' },
    { nombre: 'KMC Arquitectos',           cliente: 'KMC',         estado: 'Pendiente',  tipo: 'Corporativo' },
    { nombre: 'Office Concept Obarrio',    cliente: 'Office Concept', estado: 'En proceso', tipo: 'Comercial' },
  ];
  for (const p of proyectos) await save('proyectos', p);

  console.log('[CrystalDB] Seed completado ✓');
}

/* ── EXPORT ─────────────────────────────────────────── */

const DB = {
  // Cotizaciones
  saveCotizacion, getCotizaciones, getCotizacion, updateEstadoCotizacion,
  deleteCotizacion, nextNumeroCotizacion,
  // Clientes
  saveCliente, getClientes, findOrCreateCliente,
  // Visitas / Agenda
  saveVisita, getVisitas, getVisitasByMes, deleteVisita,
  // Proyectos
  saveProyecto, getProyectos, getProyectosActivos,
  // Trabajadores
  getTrabajadores, saveTrabajador, deleteTrabajador,
  // Reportes
  saveReporte, getReportesByFecha, getReportesByTrabajador,
  // Asistencia
  saveAsistencia, getAsistenciaByRango, getAsistenciaByFecha, deleteAsistencia,
  // Cobros / Pagos
  saveCobro, getCobros, registrarPago, getPagosByCobro,
  // Inventario
  saveItemInventario, getInventario, movimientoInventario,
  // Notificaciones
  addNotificacion, getNotificacionesPendientes, marcarLeida,
  // Usuarios
  getUsuario, saveUsuario,
  // Config
  getConfig, setConfig,
  // Recordatorios
  saveRecordatorio, getRecordatorios, getRecordatoriosActivos, removeRecordatorio,
  
  // BIBLIOTECA
  getBiblioteca: () => getAll('biblioteca'),
  saveImagen: (img) => save('biblioteca', img),
  removeImagen: (id) => remove('biblioteca', id),

  // Util
  getAll, getOne, save, remove, seedIfEmpty, uid,
};


window.DB = DB;
