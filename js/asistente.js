/* =========================================================
   Crystal OS — asistente.js
   Motor de análisis y sugerencia de precios de Crystal Services.

   Aprende de dos fuentes y se re-entrena en cada uso:
     1. assets/precios_historicos.json  → +880 líneas de cotizaciones viejas
     2. DB.getCotizaciones()            → todo lo que se emite en el sistema

   Qué aprende:
     · Precio por m² y precio por unidad de cada tipo de trabajo
     · Si un tipo se cobra por m² o por unidad (instalación/reparación no lleva m²)
     · Cómo se redactan las descripciones (sistema, color de aluminio, vidrio,
       tonalidad, espesor, herrajes) para proponer la redacción ya armada
     · Transporte según la zona del proyecto (ciudad / periferia / interior)
   ========================================================= */

window.Asistente = (() => {

  let _db     = null;   // líneas crudas (histórico + sistema)
  let _modelo = null;   // modelo entrenado a partir de _db

  /* ═══════════════════════════════════════════════════════════
     1. TAXONOMÍA DE TRABAJOS
     Orden = especificidad. El primero que coincide gana, por eso
     "puerta corrediza" va antes que "puerta" a secas.
     modo: 'm2'    → se multiplica por los metros cuadrados
           'unidad'→ se cobra por pieza/servicio (instalación, reparación)
     ═══════════════════════════════════════════════════════════ */
  /* attrs = qué atributos tienen sentido para ese trabajo. Evita disparates
     como "malla mosquitera con vidrio templado" o "reparación tipo europa". */
  const A_VIDRIO   = ['vidrio','tonalidad','espesor'];
  const A_MARCO    = ['aluminio','sistema'];
  const A_COMPLETO = [...A_MARCO, ...A_VIDRIO];

  const TIPOS = [
    // ── Servicios sin metraje ────────────────────────────────
    { id:'reparacion',    label:'Ajuste y reparación',      modo:'unidad', attrs:[],
      kw:['ajuste y reparacion','ajuste y reparación','reparacion','reparación','reparar','ajuste','arreglar','arreglo'] },
    { id:'mantenimiento', label:'Mantenimiento',            modo:'unidad', attrs:[],
      kw:['mantenimiento','servicio tecnico','servicio técnico','mto'] },
    { id:'desinstalacion',label:'Desinstalación',           modo:'unidad', attrs:[],
      kw:['desinstalacion','desinstalación','desintalacion','desmontaje','desmontar','retirar','remover'] },
    { id:'cerradura',     label:'Cerradura / herraje',      modo:'unidad', attrs:[],
      kw:['cerradura','chapa','pestillo','brazo hidraulico','brazo hidráulico','bisagra','rodamiento','rodillo'] },
    { id:'instalacion',   label:'Instalación',              modo:'unidad', attrs:[],
      kw:['solo instalacion','solo instalación','mano de obra','unicamente instalacion','únicamente instalación'] },

    // ── Aberturas ────────────────────────────────────────────
    { id:'puerta_corrediza', label:'Puerta corrediza',      modo:'m2', attrs:A_COMPLETO,
      kw:['puerta corrediza','puertas corredizas','pta corrediza','ptas corredizas','puerta deslizante','puerta que corre'] },
    { id:'puerta_abatible',  label:'Puerta abatible',       modo:'m2', attrs:A_COMPLETO,
      kw:['puerta abatible','puertas abatibles','pta abatible','puerta batiente','puerta que abre'] },
    { id:'puerta_vidrio',    label:'Puerta de vidrio templado', modo:'m2', attrs:A_VIDRIO,
      kw:['puerta de vidrio','puerta vidrio','pta de vidrio','puerta templada'] },
    { id:'puerta',           label:'Puerta',                modo:'m2', attrs:A_COMPLETO,
      kw:['puerta','puertas','pta','ptas'] },

    { id:'ventana_corrediza',label:'Ventana corrediza',     modo:'m2', attrs:A_COMPLETO,
      kw:['ventana corrediza','ventanas corredizas','vtna corrediza','vtnas corredizas','ventana que corre'] },
    { id:'ventana_abatible', label:'Ventana abatible',      modo:'m2', attrs:A_COMPLETO,
      kw:['ventana abatible','ventanas abatibles','ventana batiente','ventana proyectante'] },
    { id:'ventana',          label:'Ventana',               modo:'m2', attrs:A_COMPLETO,
      kw:['ventana','ventanas','vtna','vtnas'] },

    // ── Vidrio y cerramientos ────────────────────────────────
    { id:'pano_fijo',   label:'Paño fijo',                  modo:'m2', attrs:A_COMPLETO,
      kw:['paño fijo','paños fijos','pano fijo','panel fijo','paneles fijos','vidrio fijo','paño de vidrio'] },
    { id:'ducha',       label:'Ducha / cabina de baño',     modo:'m2', attrs:A_VIDRIO,
      kw:['ducha','duchas','cabina de baño','shower','panel de ducha','vidrio de baño'] },
    { id:'baranda',     label:'Baranda',                    modo:'m2', attrs:['sistema','vidrio','espesor'],
      kw:['baranda','barandas','barandilla','pasamano','pasamanos','railing'] },
    { id:'espejo',      label:'Espejo',                     modo:'m2', attrs:['espesor'],
      kw:['espejo','espejos','mirror'] },
    { id:'malla',       label:'Malla mosquitera',           modo:'m2', attrs:['aluminio'],
      kw:['malla mosquitera','mallas mosquiteras','malla','mallas','mosquitera','mosquitero'] },
    { id:'louver',      label:'Louver / celosía',           modo:'m2', attrs:A_COMPLETO,
      kw:['louver','louvers','celosia','celosía','celocida','persiana','paleta'] },
    { id:'cerramiento', label:'Cerramiento / fachada',      modo:'m2', attrs:A_COMPLETO,
      kw:['cerramiento','cerramientos','fachada','muro cortina','curtain wall'] },
    { id:'pergola',     label:'Pérgola / techo de vidrio',  modo:'m2', attrs:A_COMPLETO,
      kw:['pergola','pérgola','techo de vidrio','cubierta de vidrio','techo corredizo'] },
    { id:'closet',      label:'Clóset',                     modo:'m2', attrs:A_COMPLETO,
      kw:['closet','clóset','armario','guardarropa'] },
    { id:'repisa',      label:'Repisa',                     modo:'unidad', attrs:A_VIDRIO,
      kw:['repisa','repisas','estante de vidrio','entrepaño'] },
    { id:'canal',       label:'Canal / estructura',         modo:'unidad', attrs:['sistema','aluminio'],
      kw:['canal','canales','estructura','marco','perfil'] },
    { id:'vidrio',      label:'Vidrio',                     modo:'m2', attrs:A_VIDRIO,
      kw:['vidrio','vidrios','cristal'] },
  ];

  /* ═══════════════════════════════════════════════════════════
     2. ATRIBUTOS que cambian la redacción (y a veces el precio)
     ═══════════════════════════════════════════════════════════ */
  const ATRIBUTOS = {
    vidrio: [
      { id:'templado',  label:'templado',  kw:['templado','tempered','temperado'] },
      { id:'laminado',  label:'laminado',  kw:['laminado','laminated','lamiando'] },
      { id:'insulado',  label:'insulado',  kw:['insulado','doble vidrio','vidrio doble','termopanel'] },
      { id:'smart',     label:'Smart Glass', kw:['smart glass','vidrio inteligente','electrocromico','electrocrómico'] },
      { id:'flotado',   label:'flotado',   kw:['flotado','float','crudo'] },
    ],
    tonalidad: [
      { id:'claro',      label:'claro',      kw:['claro','transparente','incoloro'] },
      { id:'bronce',     label:'bronce',     kw:['bronce','bronze'] },
      { id:'gris',       label:'gris',       kw:['gris','grey','gray','humo'] },
      { id:'ahumado',    label:'ahumado',    kw:['ahumado','papel ahumado','polarizado'] },
      { id:'esmerilado', label:'esmerilado', kw:['esmerilado','satinado','acidado','opaco'] },
      { id:'reflectivo', label:'reflectivo', kw:['reflectivo','espejado','reflectante'] },
      { id:'azul',       label:'azul',       kw:['azul','blue'] },
    ],
    espesor: [
      { id:'5',    label:'5mm',   kw:['5mm','5 mm'] },
      { id:'6',    label:'6mm',   kw:['6mm','6 mm','1/4','.25'] },
      { id:'8',    label:'8mm',   kw:['8mm','8 mm','5/16'] },
      { id:'10',   label:'10mm',  kw:['10mm','10 mm','3/8'] },
      { id:'12',   label:'12mm',  kw:['12mm','12 mm','1/2'] },
    ],
    aluminio: [
      { id:'natural',  label:'natural',   kw:['color natural','aluminio natural','natural'] },
      { id:'blanco',   label:'blanco',    kw:['color blanco','aluminio blanco','blanco'] },
      { id:'negro',    label:'negro',     kw:['color negro','aluminio negro','negra','negro'] },
      { id:'bronce',   label:'bronce',    kw:['color bronce','aluminio bronce'] },
      { id:'anodizado',label:'anodizado', kw:['anodizado','duranodic'] },
    ],
    sistema: [
      { id:'europa',   label:'tipo europa', kw:['tipo europa','europa'] },
      { id:'americano',label:'americano',   kw:['tipo americano','americano'] },
      { id:'inoxidable',label:'acero inoxidable', kw:['acero inoxidable','inoxidable','inox'] },
    ],
    extras: [
      { id:'herrajes',  label:'con sus herrajes', kw:['herraje','herrajes'] },
      { id:'mosquitera',label:'con malla mosquitera', kw:['malla mosquitera','mosquitera','mosquitero'] },
      { id:'cerradura', label:'con cerradura', kw:['cerradura','chapa'] },
      { id:'zocalo',    label:'con zócalo', kw:['zocalo','zócalo'] },
    ],
  };

  /* ═══════════════════════════════════════════════════════════
     3. ZONAS Y TRANSPORTE
     Los montos son un punto de partida editable — se guardan en
     configuración y el sistema usa lo que la oficina defina.
     ═══════════════════════════════════════════════════════════ */
  const ZONAS = [
    { id:'ciudad', label:'Ciudad de Panamá', tipo:'ciudad', costo:0, kw:[
      'ciudad de panama','ciudad de panamá','san miguelito','bethania','betania','el dorado',
      'calidonia','costa del este','punta pacifica','punta pacífica','obarrio','san francisco',
      'juan diaz','juan díaz','tocumen','pedregal','las cumbres','chilibre','albrook','ancon',
      'ancón','clayton','amador','paitilla','marbella','via españa','vía españa','transistmica',
      'transístmica','villa lucre','brisas del golf','condado del rey','llano bonito','rio abajo',
      'río abajo','parque lefevre','panama viejo','panamá viejo','multiplaza','town center'
    ]},
    { id:'periferia', label:'Panamá Oeste / periferia', tipo:'periferia', costo:0, kw:[
      'arraijan','arraiján','la chorrera','chorrera','vacamonte','burunga','nuevo chorrillo',
      'veracruz','howard','panama oeste','panamá oeste','puerto caimito','playa leona','cerro silvestre'
    ]},
    { id:'interior', label:'Interior / provincias', tipo:'interior', costo:0, kw:[
      'capira','chame','san carlos','coronado','gorgona','nueva gorgona','penonome','penonomé',
      'aguadulce','santiago','chitre','chitré','las tablas','david','chiriqui','chiriquí',
      'boquete','colon','colón','bocas del toro','veraguas','herrera','los santos','darien','darién'
    ]},
  ];

  /* ═══════════════════════════════════════════════════════════
     4. DETECTORES
     ═══════════════════════════════════════════════════════════ */

  const RE_TILDES = new RegExp('[\\u0300-\\u036f]', 'g');

  function norm(s) {
    return (s || '').toString().toLowerCase()
      .normalize('NFD').replace(RE_TILDES, '')  // quita tildes
      .replace(/\s+/g, ' ').trim();
  }

  /* Frases de relleno que aparecen en casi toda cotización y que, si no se
     quitan, hacen que TODO se clasifique como "instalación" o "herraje". */
  const BOILERPLATE = [
    'suministro e instalacion de', 'suministro e instalacion',
    'suministro y instalacion de', 'suministro y instalacion',
    'suministro e instalacio de', 'suministro de',
    'con sus herrajes para su debido funcionamiento',
    'para su debido funcionamiento', 'con sus herrajes',
  ];

  function limpiar(texto) {
    let t = norm(texto);
    for (const b of BOILERPLATE) t = t.split(b).join(' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  /** Tipos detectados, ordenados: primero el que aparece antes y es más
      específico. Así "Ajuste y reparación para puerta…" es reparación, y
      "…de puerta corrediza tipo europa…" es puerta corrediza, no instalación. */
  function detectarTipos(texto) {
    const t = limpiar(texto);
    if (!t) return [];
    const hits = [];
    for (const tipo of TIPOS) {
      let mejor = null;
      for (const k of tipo.kw) {
        const kn = norm(k);
        const pos = t.indexOf(kn);
        if (pos === -1) continue;
        if (!mejor || pos < mejor.pos || (pos === mejor.pos && kn.length > mejor.len)) {
          mejor = { pos, len: kn.length };
        }
      }
      if (mejor) hits.push({ tipo, ...mejor });
    }
    // Antes en el texto gana; a igual posición, la palabra más específica gana
    hits.sort((a, b) => a.pos - b.pos || b.len - a.len);
    return hits.map(h => h.tipo);
  }

  function detectarTipo(texto) {
    return detectarTipos(texto)[0] || null;
  }

  /** Extrae color de aluminio, vidrio, tonalidad, espesor, sistema y extras. */
  function detectarAtributos(texto) {
    const t = norm(texto);
    const res = { vidrio:null, tonalidad:null, espesor:null, aluminio:null, sistema:null, extras:[] };
    for (const grupo of ['vidrio','tonalidad','espesor','aluminio','sistema']) {
      for (const op of ATRIBUTOS[grupo]) {
        if (op.kw.some(k => t.includes(norm(k)))) { res[grupo] = op; break; }
      }
    }
    for (const op of ATRIBUTOS.extras) {
      if (op.kw.some(k => t.includes(norm(k)))) res.extras.push(op);
    }
    return res;
  }

  /** Detecta la zona del proyecto para estimar transporte. */
  function detectarZona(texto) {
    const t = norm(texto);
    for (const z of ZONAS) {
      for (const k of z.kw) {
        if (t.includes(norm(k))) return z;
      }
    }
    return null;
  }

  /** Medidas ancho x alto en cualquier notación usada en WhatsApp. */
  function detectarDimensiones(texto) {
    const dims = [];
    const vistos  = new Set();
    const usados  = [];   // tramos de texto ya consumidos, para no re-emparejar pedazos

    // De más específico a más general: "1.80 x 2.10" debe ganarle a "1.80 x 2"
    const patrones = [
      /(\d+[.,]\d+)\s*(?:metros?|mts?|m)?\s*[xX×]\s*(\d+[.,]\d+)/g,
      /(\d+[.,]?\d*)\s*(?:metros?|mts?|m)\s+(?:de\s+)?(?:ancho|largo)\s+(?:por|x|×)\s*(\d+[.,]?\d*)/gi,
      /(\d+[.,]?\d*)\s*(?:por|x)\s*(\d+[.,]?\d*)\s*(?:metros?|mts?|m)\b/gi,
      /(\d+)\s*[xX×]\s*(\d+[.,]\d+)/g,
      /(\d+[.,]\d+)\s*[xX×]\s*(\d+)/g,
      /(\d+)\s*[xX×]\s*(\d+)/g,
    ];

    const solapa = (ini, fin) => usados.some(u => ini < u.fin && fin > u.ini);

    for (const pat of patrones) {
      let m;
      pat.lastIndex = 0;
      while ((m = pat.exec(texto)) !== null) {
        const ini = m.index, fin = m.index + m[0].length;
        if (solapa(ini, fin)) continue;
        const a = parseFloat(m[1].replace(',', '.'));
        const h = parseFloat(m[2].replace(',', '.'));
        if (a > 0.1 && h > 0.1 && a < 30 && h < 30) {
          usados.push({ ini, fin });
          const key = a.toFixed(2) + 'x' + h.toFixed(2);
          if (!vistos.has(key)) {
            vistos.add(key);
            dims.push({ ancho: a, alto: h, m2: Math.round(a * h * 100) / 100 });
          }
        }
      }
    }
    return dims;
  }

  /* Parte la conversación en ítems. Una misma conversación suele traer varios
     trabajos ("una puerta corrediza de 1.80x2.10 y también una malla de 1.2x1.5"),
     y cada uno lleva su propio tipo, medidas y precio. */
  function segmentar(texto) {
    const bruto = texto
      .split(/(?:\r?\n)+|(?<=[.;!?])\s+|\s+(?:y\s+)?(?:tambi[eé]n|adem[aá]s|aparte|luego|otra\s+cosa|por\s+otro\s+lado)\s+/i)
      .map(s => s.trim())
      .filter(s => s.length > 3);

    // Un segmento sólo cuenta si trae un trabajo reconocible
    const segs = [];
    for (const s of bruto) {
      const tipos = detectarTipos(s);
      if (tipos.length) segs.push({ texto: s, tipos });
    }

    // Si un solo segmento menciona dos trabajos distintos con medidas propias,
    // se parte otra vez usando las conjunciones simples
    const final = [];
    for (const seg of segs) {
      if (seg.tipos.length > 1 && /\s+y\s+/i.test(seg.texto)) {
        const partes = seg.texto.split(/\s+y\s+/i).map(p => p.trim()).filter(p => p.length > 3);
        const conTipo = partes.filter(p => detectarTipos(p).length);
        if (conTipo.length > 1) {
          conTipo.forEach(p => final.push({ texto: p, tipos: detectarTipos(p) }));
          continue;
        }
      }
      final.push(seg);
    }
    return final.length ? final : (detectarTipos(texto).length ? [{ texto, tipos: detectarTipos(texto) }] : []);
  }

  function detectarCantidad(texto) {
    const t = norm(texto);
    const pat = /(\d+)\s*(puertas?|ventanas?|duchas?|espejos?|barandas?|panos?|paneles?|mallas?|louvers?|repisas?)/g;
    const out = [];
    let m;
    while ((m = pat.exec(t)) !== null) out.push({ cant: parseInt(m[1]), tipo: m[2] });
    return out;
  }

  /* ═══════════════════════════════════════════════════════════
     5. CARGA DE DATOS (histórico + lo que se emite en el sistema)
     ═══════════════════════════════════════════════════════════ */
  async function cargarDB(forzar = false) {
    if (_db && !forzar) return _db;

    let base = [];
    try {
      const res = await fetch('assets/precios_historicos.json');
      if (res.ok) base = await res.json();
    } catch { base = []; }

    // Normalizar el histórico al formato interno
    _db = base.map(r => ({
      n:       String(r.n || ''),
      cliente: r.cliente || '',
      desc:    r.desc || '',
      a:       parseFloat(r.a) || 0,
      h:       parseFloat(r.h) || 0,
      m2:      parseFloat(r.m2) || 0,
      cant:    parseFloat(r.cant) || 1,
      total:   parseFloat(r.precio) || 0,
      p_unit:  parseFloat(r.p_unit) || 0,
      p_m2:    parseFloat(r.p_m2) || 0,
      origen:  'historico',
      peso:    1,
    }));

    // Sumar todo lo emitido desde el sistema — pesa más porque es lo más reciente
    try {
      const cotiz = await DB.getCotizaciones();
      for (const c of cotiz) {
        if (c.precioGlobal) continue;             // sin desglose no sirve para aprender precio unitario
        for (const l of (c.lineas || [])) {
          const desc = l.descripcion || l.producto || '';
          const total = parseFloat(l.total) || 0;
          if (!desc || total <= 0) continue;
          const a  = parseFloat(l.ancho) || 0;
          const h  = parseFloat(l.alto)  || 0;
          const m2 = parseFloat(l.m2) || (a * h) || 0;
          const cant = parseFloat(l.cantidad) || 1;
          _db.push({
            n:       String(c.numero || ''),
            cliente: c.clienteNombre || '',
            zona:    c.clienteDir || '',
            desc,
            a, h, m2, cant,
            total,
            p_unit:  parseFloat(l.precio) || (total / (cant || 1)),
            p_m2:    m2 > 0 ? total / (m2 * (cant || 1)) : 0,
            origen:  'sistema',
            peso:    3,
          });
        }
      }
    } catch {}

    _modelo = null;   // fuerza reentrenamiento
    return _db;
  }

  /* ═══════════════════════════════════════════════════════════
     6. ENTRENAMIENTO
     Agrupa por tipo de trabajo y calcula estadísticas robustas.
     ═══════════════════════════════════════════════════════════ */

  /** Recorta valores extremos (percentil 10–90) para que un dato malo
      no arrastre el promedio. Con pocas muestras no recorta nada. */
  function recortar(valores) {
    const v = valores.filter(x => x > 0).sort((a, b) => a - b);
    if (v.length < 8) return v;
    const lo = Math.floor(v.length * 0.10);
    const hi = Math.ceil(v.length * 0.90);
    return v.slice(lo, hi);
  }

  function stats(valores) {
    const v = recortar(valores);
    if (v.length === 0) return null;
    const med = v.length % 2
      ? v[(v.length - 1) / 2]
      : (v[v.length/2 - 1] + v[v.length/2]) / 2;
    const avg = v.reduce((s, x) => s + x, 0) / v.length;
    const p25 = v[Math.floor(v.length * 0.25)];
    const p75 = v[Math.floor(v.length * 0.75)];
    // Dispersión relativa: qué tan de acuerdo están los datos entre sí
    const disp = med > 0 ? (p75 - p25) / med : 1;
    return {
      n: v.length,
      min: v[0], max: v[v.length - 1],
      med: Math.round(med * 100) / 100,
      avg: Math.round(avg * 100) / 100,
      p25: Math.round(p25 * 100) / 100,
      p75: Math.round(p75 * 100) / 100,
      disp,
    };
  }

  /** Construye el modelo: por cada tipo de trabajo, cómo se cobra y a cuánto. */
  function entrenar() {
    if (_modelo) return _modelo;
    const porTipo = {};

    for (const item of (_db || [])) {
      const tipo = detectarTipo(item.desc);
      if (!tipo) continue;
      const b = porTipo[tipo.id] || (porTipo[tipo.id] = {
        id: tipo.id, label: tipo.label, modoBase: tipo.modo,
        m2vals: [], unitvals: [], conM2: 0, sinM2: 0, frases: [], n: 0,
      });
      b.n++;
      // El peso replica las muestras del sistema para que pesen más que el histórico
      const rep = item.origen === 'sistema' ? 3 : 1;
      if (item.m2 > 0 && item.p_m2 > 0) {
        b.conM2++;
        for (let i = 0; i < rep; i++) b.m2vals.push(item.p_m2);
      } else {
        b.sinM2++;
      }
      if (item.p_unit > 0) {
        for (let i = 0; i < rep; i++) b.unitvals.push(item.p_unit);
      }
      if (b.frases.length < 40 && item.desc.length > 25) b.frases.push(item.desc);
    }

    for (const id in porTipo) {
      const b = porTipo[id];
      b.m2    = stats(b.m2vals);
      b.unit  = stats(b.unitvals);
      // El modo se aprende de los datos: si la mayoría trae metraje, es por m²
      const total = b.conM2 + b.sinM2;
      b.modo = total > 0
        ? (b.conM2 / total >= 0.5 ? 'm2' : 'unidad')
        : b.modoBase;
      delete b.m2vals; delete b.unitvals;
    }

    // Tarifa general de la casa: mediana de p_m2 de todo el historial
    const todosM2 = (_db || []).filter(x => x.p_m2 > 0).map(x => x.p_m2);
    _modelo = {
      tipos: porTipo,
      general: stats(todosM2),
      totalLineas: (_db || []).length,
      delSistema: (_db || []).filter(x => x.origen === 'sistema').length,
    };
    return _modelo;
  }

  /* ═══════════════════════════════════════════════════════════
     7. REDACCIÓN — arma la descripción como la escribe la empresa
     ═══════════════════════════════════════════════════════════ */
  function redactar(tipo, attr, dim, objetoTipo) {
    if (!tipo) return '';

    // Sólo se redactan los atributos que aplican a ese trabajo:
    // una malla no lleva vidrio, un espejo no lleva aluminio.
    const permite = g => !tipo.attrs || tipo.attrs.includes(g);
    const A = {
      vidrio:    permite('vidrio')    ? attr.vidrio    : null,
      tonalidad: permite('tonalidad') ? attr.tonalidad : null,
      espesor:   permite('espesor')   ? attr.espesor   : null,
      aluminio:  permite('aluminio')  ? attr.aluminio  : null,
      sistema:   permite('sistema')   ? attr.sistema   : null,
      extras:    attr.extras || [],
    };

    // Servicios: "Ajuste y reparación para puerta de vidrio templado"
    if (['reparacion','mantenimiento','desinstalacion','instalacion','cerradura'].includes(tipo.id)) {
      const base = tipo.id === 'reparacion'     ? 'Ajuste y reparación para'
                 : tipo.id === 'mantenimiento'  ? 'Mantenimiento de'
                 : tipo.id === 'desinstalacion' ? 'Desinstalación de'
                 : tipo.id === 'cerradura'      ? 'Suministro e instalación de cerradura para'
                 : 'Instalación de';
      const objeto = objetoTipo ? objetoTipo.label.toLowerCase() : 'puerta';
      // No repetir el material si el nombre del objeto ya lo menciona
      const mat = (attr.vidrio && !objeto.includes('vidrio')) ? ` de vidrio ${attr.vidrio.label}` : '';
      return `${base} ${objeto}${mat}`.replace(/\s+/g, ' ').trim();
    }

    const partes = ['Suministro e instalación de', tipo.label.toLowerCase()];

    if (A.sistema && A.sistema.id !== 'inoxidable') partes.push(A.sistema.label);
    if (A.sistema && A.sistema.id === 'inoxidable') {
      partes.push('en acero inoxidable');
    } else if (A.aluminio) {
      partes.push(`aluminio color ${A.aluminio.label}`);
    }

    const vid = [];
    if (A.tonalidad) vid.push(A.tonalidad.label);
    if (A.vidrio)    vid.push(A.vidrio.label);
    if (A.espesor)   vid.push(`de ${A.espesor.label}`);
    if (vid.length) partes.push(`con vidrio ${vid.join(' ')}`);

    let txt = partes.join(' ').replace(/\s+/g, ' ').trim();

    if (dim && dim.ancho > 0 && dim.alto > 0) {
      txt += `, medidas ${dim.ancho}m x ${dim.alto}m`;
    }

    // Los herrajes ya van en la frase de cierre, y no se repite un extra que
    // sea el producto mismo (una malla no lleva "con malla mosquitera")
    const nombre = norm(tipo.label);
    const extras = attr.extras
      .filter(e => e.id !== 'herrajes' && !nombre.includes(norm(e.label).replace('con ', '')))
      .map(e => e.label);
    if (extras.length) txt += `, ${extras.join(', ')}`;

    txt += ', con sus herrajes para su debido funcionamiento.';
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  /* ═══════════════════════════════════════════════════════════
     8. BÚSQUEDA DE SIMILARES
     ═══════════════════════════════════════════════════════════ */
  function buscarSimilares(tipos, attr, dimensiones) {
    if (!_db || _db.length === 0) return [];
    const idsTipo = tipos.map(t => t.id);
    const res = [];

    for (const item of _db) {
      let score = 0;
      const tItem = detectarTipos(item.desc);
      const idsItem = tItem.map(t => t.id);

      // Mismo tipo de trabajo — lo que más pesa
      if (idsTipo.length && idsItem.length) {
        if (idsItem[0] === idsTipo[0]) score += 10;
        else if (idsItem.some(x => idsTipo.includes(x))) score += 4;
      }

      // Atributos coincidentes (color, vidrio, tonalidad, espesor)
      const aItem = detectarAtributos(item.desc);
      for (const g of ['vidrio','tonalidad','espesor','aluminio','sistema']) {
        if (attr[g] && aItem[g] && attr[g].id === aItem[g].id) score += 2;
      }

      // Medidas parecidas
      if (dimensiones.length && item.a > 0 && item.h > 0) {
        for (const d of dimensiones) {
          const dA = Math.abs(item.a - d.ancho) / d.ancho;
          const dH = Math.abs(item.h - d.alto)  / d.alto;
          if (dA < 0.15 && dH < 0.15)      score += 6;
          else if (dA < 0.35 && dH < 0.35) score += 2;
        }
      }

      // Lo emitido en el sistema es más representativo de los precios de hoy
      if (item.origen === 'sistema') score += 3;

      if (score > 0 && (item.p_unit > 0 || item.p_m2 > 0)) res.push({ ...item, score });
    }

    res.sort((a, b) => b.score - a.score || b.p_m2 - a.p_m2);
    return res.slice(0, 12);
  }

  /* ═══════════════════════════════════════════════════════════
     9. SUGERENCIA DE PRECIO
     ═══════════════════════════════════════════════════════════ */
  async function transporteDeZona(zona) {
    if (!zona) return null;
    try {
      const cfg = await DB.getConfig('transporte_zonas', null);
      if (cfg && cfg[zona.id] != null) return { ...zona, costo: parseFloat(cfg[zona.id]) || 0, definido: true };
    } catch {}
    return { ...zona, costo: 0, definido: false };
  }

  function sugerirPrecio(tipoId, attr, dim, similares) {
    const m = entrenar();
    const b = m.tipos[tipoId];
    const modo = b ? b.modo : 'm2';

    // Base: estadística del tipo; si no hay, la tarifa general de la casa
    let base = null, fuente = '';
    if (modo === 'm2') {
      if (b && b.m2 && b.m2.n >= 3)      { base = b.m2;    fuente = `${b.n} trabajos de "${b.label}"`; }
      else if (m.general)                { base = m.general; fuente = 'tarifa general de la empresa'; }
    } else {
      if (b && b.unit && b.unit.n >= 3)  { base = b.unit;  fuente = `${b.n} servicios de "${b.label}"`; }
    }
    if (!base) return null;

    // Confianza: más muestras y menos dispersión = más confianza
    let conf = 'baja';
    if (base.n >= 20 && base.disp < 0.35)      conf = 'alta';
    else if (base.n >= 8 && base.disp < 0.6)   conf = 'media';

    const tarifa = base.med;                       // $/m² o $/unidad
    const m2 = dim ? dim.m2 : 0;
    const precioSugerido = modo === 'm2' && m2 > 0
      ? Math.round(tarifa * m2 * 100) / 100
      : Math.round(tarifa * 100) / 100;

    return {
      modo, tarifa, fuente, confianza: conf,
      n: base.n,
      rango: { min: base.p25, max: base.p75 },
      precioSugerido,
      totalSugerido: modo === 'm2' && m2 > 0
        ? precioSugerido
        : precioSugerido,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     10. API PRINCIPAL
     ═══════════════════════════════════════════════════════════ */
  async function analizar(texto, onResult) {
    await cargarDB(true);          // recarga siempre: aprende lo recién emitido
    const modelo = entrenar();

    const tipos       = detectarTipos(texto);
    const tipo        = tipos[0] || null;
    const atributos   = detectarAtributos(texto);
    const dimensiones = detectarDimensiones(texto);
    const cantidades  = detectarCantidad(texto);
    const zona        = detectarZona(texto);
    const transporte  = await transporteDeZona(zona);
    const similares   = buscarSimilares(tipos, atributos, dimensiones);

    /* Una propuesta por ítem mencionado. Los atributos generales de la
       conversación (color, tonalidad, espesor) se heredan cuando el ítem
       no los repite — la gente los dice una sola vez al principio. */
    const propuestas = [];
    const segmentos = segmentar(texto);

    /* Un ítem = tipo de trabajo + medida. Si el mismo ítem sale dos veces
       (la conversación lo menciona repetido), se queda la redacción más completa. */
    const porClave = new Map();
    const agregar = (t, a, d, cant, objeto) => {
      const desc = redactar(t, a, d, objeto);
      const key  = `${t.id}|${d ? d.ancho + 'x' + d.alto : '-'}`;
      const prev = porClave.get(key);
      if (prev && prev.descripcion.length >= desc.length) return;
      porClave.set(key, {
        tipo: t, atributos: a, dim: d, cantidad: cant, descripcion: desc,
        precio: sugerirPrecio(t.id, a, d, similares),
      });
    };

    for (const seg of segmentos) {
      const tSeg = seg.tipos[0];
      const aSeg = detectarAtributos(seg.texto);
      // Hereda del contexto general sólo lo que aplica a ESTE trabajo
      for (const g of ['vidrio','tonalidad','espesor','aluminio','sistema']) {
        if (!aSeg[g] && atributos[g] && (!tSeg.attrs || tSeg.attrs.includes(g))) {
          aSeg[g] = atributos[g];
        }
      }
      const dSeg = detectarDimensiones(seg.texto);
      const cSeg = detectarCantidad(seg.texto);
      const cant = cSeg.length ? cSeg[0].cant : 1;
      // En un servicio, el objeto es el producto mencionado después ("reparación de puerta")
      const objeto = seg.tipos.find(t => t.id !== tSeg.id && t.modo === 'm2') || null;
      const dims = dSeg.length ? dSeg : [null];
      for (const d of dims) agregar(tSeg, aSeg, d, cant, objeto);
    }

    // Sin ítems reconocibles: al menos una propuesta con lo global detectado
    if (porClave.size === 0 && tipo) {
      agregar(tipo, atributos, dimensiones[0] || null, 1, null);
    }
    propuestas.push(...porClave.values());

    onResult({
      tipo, tipos, atributos, dimensiones, cantidades, zona, transporte,
      propuestas, similares, modelo,
      dbSize: modelo.totalLineas,
    });
  }

  /* ═══════════════════════════════════════════════════════════
     11. RENDER DEL PANEL
     ═══════════════════════════════════════════════════════════ */
  function fmt(n) {
    return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) { return (s || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }

  function chip(txt, color) {
    const c = color || 'var(--green-main)';
    return `<span style="background:var(--green-light);color:${c};border:1px solid var(--border);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">${txt}</span>`;
  }

  function renderResultado(container, r) {
    const { tipo, atributos, dimensiones, zona, transporte, propuestas, similares, modelo } = r;

    if (!tipo && similares.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-gray);font-size:13px;padding:10px 0;">
          No se detectó un tipo de trabajo claro. Agrega detalles como
          "puerta corrediza", "ventana abatible", "malla mosquitera",
          el color del aluminio o medidas ("1.20 x 2.10").
        </div>`;
      return;
    }

    /* Chips de lo que entendió */
    const chips = [];
    if (tipo) chips.push(chip(tipo.label));
    for (const g of ['sistema','aluminio','vidrio','tonalidad','espesor']) {
      if (atributos[g]) chips.push(chip(atributos[g].label, 'var(--text-gray)'));
    }
    atributos.extras.forEach(e => chips.push(chip(e.label, 'var(--text-gray)')));
    dimensiones.forEach(d => chips.push(
      `<span style="background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">${d.ancho}m × ${d.alto}m = ${d.m2} m²</span>`
    ));
    if (zona) chips.push(
      `<span style="background:#FEF3C7;color:#92400E;border:1px solid #FDE68A;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">Zona: ${zona.label}</span>`
    );

    /* Propuestas */
    const propHtml = propuestas.map((p, i) => {
      const pr = p.precio;
      const badge = pr
        ? (pr.confianza === 'alta'  ? '<span style="background:#DCFCE7;color:#15803D;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">CONFIANZA ALTA</span>'
        :  pr.confianza === 'media' ? '<span style="background:#FEF3C7;color:#92400E;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">CONFIANZA MEDIA</span>'
        :  '<span style="background:#FEE2E2;color:#991B1B;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">POCOS DATOS</span>')
        : '';

      const detalle = pr ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:10px 0;">
          <div style="background:#F0FFF4;border:2px solid var(--green-mid);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:var(--green-main);font-weight:700;text-transform:uppercase;">Sugerido</div>
            <div style="font-size:20px;font-weight:700;color:var(--green-main);">${fmt(pr.precioSugerido)}</div>
          </div>
          <div style="background:var(--green-light);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:var(--text-gray);font-weight:700;text-transform:uppercase;">${pr.modo === 'm2' ? 'Por m²' : 'Por unidad'}</div>
            <div style="font-size:18px;font-weight:700;">${fmt(pr.tarifa)}</div>
          </div>
          <div style="background:var(--green-light);border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:var(--text-gray);font-weight:700;text-transform:uppercase;">Rango usual</div>
            <div style="font-size:14px;font-weight:600;">${fmt(pr.rango.min)} – ${fmt(pr.rango.max)}</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-gray);margin-bottom:8px;">
          Basado en ${pr.fuente} · se cobra <strong>${pr.modo === 'm2' ? 'por metro cuadrado' : 'por unidad / servicio'}</strong>
        </div>`
        : `<div style="font-size:12px;color:var(--text-gray);margin:8px 0;">
             Sin datos suficientes para sugerir precio de este trabajo. Ponlo a mano y el asistente lo aprenderá.
           </div>`;

      return `
        <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;background:#fff;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            <strong style="font-size:13px;">Propuesta ${propuestas.length > 1 ? (i+1) : ''}</strong>
            ${badge}
          </div>
          <div style="background:var(--bg-body);border-radius:8px;padding:10px;font-size:12px;line-height:1.5;margin-bottom:8px;">
            ${p.descripcion || '<span style="color:var(--text-gray);">—</span>'}
          </div>
          ${detalle}
          <button class="btn btn-primary btn-sm"
            onclick="window._asistenteAplicar(${JSON.stringify({
              precio: pr ? (pr.modo === 'm2' ? pr.tarifa : pr.precioSugerido) : 0,
              modo:   pr ? pr.modo : 'm2',
              ancho:  p.dim ? p.dim.ancho : 0,
              alto:   p.dim ? p.dim.alto  : 0,
              desc:   p.descripcion || '',
            }).replace(/"/g, '&quot;')})">
            Agregar a la cotización
          </button>
        </div>`;
    }).join('');

    /* Transporte */
    const transpHtml = transporte ? `
      <div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#FFFBEB;">
        <div style="font-size:12px;font-weight:700;color:#92400E;margin-bottom:4px;">Transporte — ${transporte.label}</div>
        <div style="font-size:12px;color:#78350F;">
          ${transporte.definido
            ? `Tarifa configurada para esta zona: <strong>${fmt(transporte.costo)}</strong>`
            : `Todavía no hay tarifa de transporte guardada para <strong>${transporte.tipo === 'ciudad' ? 'dentro de la ciudad' : transporte.tipo === 'periferia' ? 'Panamá Oeste / periferia' : 'el interior'}</strong>. Defínela una vez y el asistente la aplicará sola.`}
        </div>
      </div>` : '';

    /* Similares */
    const simHtml = similares.length ? `
      <div style="margin-top:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-gray);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
          Trabajos parecidos en el historial
        </div>
        ${similares.slice(0, 6).map(s => `
          <div style="border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:500;" title="${esc(s.desc)}">
                ${s.n ? `<strong>#${s.n}</strong> — ` : ''}${s.desc.length > 78 ? s.desc.slice(0, 78) + '…' : s.desc}
                ${s.origen === 'sistema' ? '<span style="font-size:9px;color:var(--green-mid);font-weight:700;"> · DEL SISTEMA</span>' : ''}
              </div>
              <div style="font-size:11px;color:var(--text-gray);margin-top:2px;">
                ${s.a > 0 && s.h > 0 ? `${s.a}m × ${s.h}m` : 'sin medidas'}
                ${s.cant > 1 ? ` · Cant: ${s.cant}` : ''}
                ${s.p_m2 > 0 ? ` · ${fmt(s.p_m2)}/m²` : ''}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:14px;font-weight:700;color:var(--green-main);">${fmt(s.total || s.p_unit)}</div>
            </div>
          </div>`).join('')}
      </div>` : '';

    container.innerHTML = `
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px;">
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${chips.join(' ')}</div>
        ${propHtml}
        ${transpHtml}
        ${simHtml}
        <div style="font-size:10px;color:var(--text-gray);margin-top:10px;">
          Aprendiendo de ${modelo.totalLineas} líneas · ${modelo.delSistema} emitidas desde Crystal OS
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     12. RESUMEN DEL ENTRENAMIENTO (para pantalla de diagnóstico)
     ═══════════════════════════════════════════════════════════ */
  async function resumen() {
    await cargarDB(true);
    const m = entrenar();
    const filas = Object.values(m.tipos)
      .filter(t => t.n >= 2)
      .sort((a, b) => b.n - a.n)
      .map(t => ({
        trabajo: t.label,
        muestras: t.n,
        modo: t.modo === 'm2' ? 'por m²' : 'por unidad',
        tarifa: t.modo === 'm2' ? (t.m2 ? t.m2.med : null) : (t.unit ? t.unit.med : null),
        rango: t.modo === 'm2'
          ? (t.m2 ? [t.m2.p25, t.m2.p75] : null)
          : (t.unit ? [t.unit.p25, t.unit.p75] : null),
      }));
    return { filas, general: m.general, totalLineas: m.totalLineas, delSistema: m.delSistema };
  }

  return {
    analizar, renderResultado, cargarDB, resumen, entrenar, redactar,
    detectarTipo, detectarTipos, detectarAtributos, detectarZona,
    detectarDimensiones, detectarCantidad,
    ZONAS, TIPOS,
  };

})();
