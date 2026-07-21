/* =========================================================
   Crystal OS — asistente.js
   Motor de análisis de conversaciones y sugerencia de precios
   basado en historial de cotizaciones (precios_historicos.json)
   ========================================================= */

window.Asistente = (() => {

  let _db = null;  // cache del JSON de precios históricos

  /* ── Mapa de palabras clave → categoría ─────────────────── */
  const KW_MAP = [
    { cat: 'ducha',            kw: ['ducha','shower','vidrio de baño','panel de ducha','vidrio ducha'] },
    { cat: 'ventana corrediza',kw: ['ventana corrediza','ventanas corredizas','vtna corrediza','ventana que corre'] },
    { cat: 'ventana abatible', kw: ['ventana abatible','ventana batiente','ventana que abre'] },
    { cat: 'ventana',          kw: ['ventana','vtna','ventanas'] },
    { cat: 'puerta corrediza', kw: ['puerta corrediza','ptas corredizas','pta corrediza','puerta que corre','puerta deslizante'] },
    { cat: 'puerta abatible',  kw: ['puerta abatible','puerta batiente','puerta que abre','pta abatible','abatible'] },
    { cat: 'puerta vidrio',    kw: ['puerta de vidrio','puerta vidrio','glass door'] },
    { cat: 'puerta',           kw: ['puerta','ptas','pta'] },
    { cat: 'baranda',          kw: ['baranda','barandilla','barand','pasamano','railing'] },
    { cat: 'espejo',           kw: ['espejo','mirror','espejos'] },
    { cat: 'paño fijo',        kw: ['paño fijo','panel fijo','paño de vidrio','vidrio fijo'] },
    { cat: 'pérgola',          kw: ['pérgola','pergola','techo de vidrio','cubierta vidrio'] },
    { cat: 'louver',           kw: ['louver','persiana','celosa'] },
    { cat: 'laminado',         kw: ['laminado','vidrio laminado','laminated'] },
    { cat: 'insulado',         kw: ['insulado','vidrio insulado','doble vidrio','vidrio doble'] },
    { cat: 'smart glass',      kw: ['smart glass','vidrio inteligente','vidrio electrocrómico'] },
    { cat: 'vidrio templado',  kw: ['vidrio templado','templado','tempered'] },
    { cat: 'closet',           kw: ['closet','armario','guardarropa'] },
    { cat: 'repisa',           kw: ['repisa','shelf','estante de vidrio'] },
    { cat: 'malla mosquitera', kw: ['malla','mosquitera','malla mosquitera'] },
    { cat: 'cerramiento',      kw: ['cerramiento','fachada','cierre'] },
    { cat: 'mantenimiento',    kw: ['mantenimiento','reparación','reparacion','ajuste','mto','servicio técnico'] },
    { cat: 'instalación',      kw: ['instalación','instalar','instalacion','colocar'] },
  ];

  /* ── Detectar categorías en texto ───────────────────────── */
  function detectarCategorias(texto) {
    const t = texto.toLowerCase().normalize('NFC');
    const encontradas = new Set();
    for (const { cat, kw } of KW_MAP) {
      for (const k of kw) {
        if (t.includes(k)) { encontradas.add(cat); break; }
      }
    }
    return [...encontradas];
  }

  /* ── Detectar dimensiones (ancho x alto) ────────────────── */
  function detectarDimensiones(texto) {
    const dims = [];
    // Patrones: "1.20 x 2.10", "2x3", "1,50 × 2,00", "1.20 por 2.10"
    const patrones = [
      /(\d+[.,]\d+)\s*[xX×]\s*(\d+[.,]\d+)/g,
      /(\d+)\s*[xX×]\s*(\d+[.,]\d+)/g,
      /(\d+[.,]\d+)\s*[xX×]\s*(\d+)/g,
      /(\d+)\s*[xX×]\s*(\d+)/g,
      /(\d+[.,]\d+)\s*(?:metros?|mts?|m)\s+(?:de\s+)?(?:ancho|largo)\s+(?:por|x|×)\s*(\d+[.,]\d+)/gi,
      /(\d+[.,]\d+)\s*(?:por|x)\s*(\d+[.,]\d+)\s*(?:metros?|mts?|m)/gi,
    ];
    for (const pat of patrones) {
      let m;
      while ((m = pat.exec(texto)) !== null) {
        const a = parseFloat(m[1].replace(',', '.'));
        const h = parseFloat(m[2].replace(',', '.'));
        if (a > 0.1 && h > 0.1 && a < 30 && h < 30) {
          dims.push({ ancho: a, alto: h, m2: Math.round(a * h * 100) / 100 });
        }
      }
    }
    return dims;
  }

  /* ── Detectar cantidad ───────────────────────────────────── */
  function detectarCantidad(texto) {
    const t = texto.toLowerCase();
    const pat = /(\d+)\s*(puertas?|ventanas?|duchas?|espejos?|barandas?|paños?|paneles?)/g;
    let m, cantidades = [];
    while ((m = pat.exec(t)) !== null) {
      cantidades.push({ cant: parseInt(m[1]), tipo: m[2] });
    }
    return cantidades;
  }

  /* ── Cargar base de datos de precios ─────────────────────── */
  async function cargarDB() {
    if (_db) return _db;
    try {
      const res = await fetch('assets/precios_historicos.json');
      if (!res.ok) throw new Error('no encontrado');
      _db = await res.json();
    } catch {
      _db = [];
    }
    // También agregar cotizaciones registradas en el sistema
    try {
      const cotizEnSistema = await DB.getCotizaciones();
      for (const c of cotizEnSistema) {
        for (const l of (c.lineas || [])) {
          if (!l.precio || l.precio <= 0) continue;
          const desc = l.descripcion || l.producto || '';
          if (!desc) continue;
          _db.push({
            n: String(c.numero || ''),
            cliente: c.clienteNombre || '',
            desc,
            kw: detectarCategorias(desc),
            a: parseFloat(l.ancho) || 0,
            h: parseFloat(l.alto) || 0,
            m2: parseFloat(l.m2) || 0,
            cant: parseFloat(l.cantidad) || 1,
            precio: parseFloat(l.total) || 0,
            p_unit: parseFloat(l.precio) || 0,
            p_m2: 0,
            archivo: 'sistema'
          });
        }
      }
    } catch {}
    return _db;
  }

  /* ── Buscar similares en historial ───────────────────────── */
  function buscarSimilares(categorias, dimensiones) {
    if (!_db || _db.length === 0) return [];

    const resultados = [];

    for (const item of _db) {
      // Score de coincidencia
      let score = 0;
      const kwItem = (item.kw || []).map(k => k.toLowerCase());
      const descLow = (item.desc || '').toLowerCase();

      // Coincidencia por categoría
      for (const cat of categorias) {
        if (kwItem.includes(cat) || descLow.includes(cat)) score += 3;
      }

      // Coincidencia por dimensiones (tolerancia ±20%)
      if (dimensiones.length > 0 && item.a > 0 && item.h > 0) {
        for (const dim of dimensiones) {
          const deltaA = Math.abs(item.a - dim.ancho) / dim.ancho;
          const deltaH = Math.abs(item.h - dim.alto) / dim.alto;
          if (deltaA < 0.2 && deltaH < 0.2) score += 5;
          else if (deltaA < 0.35 && deltaH < 0.35) score += 2;
        }
      }

      if (score > 0 && item.p_unit > 0) {
        resultados.push({ ...item, score });
      }
    }

    // Ordenar por relevancia, tomar top 10
    resultados.sort((a, b) => b.score - a.score);
    return resultados.slice(0, 10);
  }

  /* ── Calcular estadísticas de precios ───────────────────── */
  function calcEstadisticas(similares) {
    if (similares.length === 0) return null;
    const precios = similares.map(s => s.p_unit).filter(p => p > 0);
    if (precios.length === 0) return null;
    precios.sort((a, b) => a - b);
    const min = precios[0];
    const max = precios[precios.length - 1];
    const avg = Math.round(precios.reduce((s, p) => s + p, 0) / precios.length * 100) / 100;
    const med = precios[Math.floor(precios.length / 2)];
    return { min, max, avg, med, n: precios.length };
  }

  /* ── Formatear número como precio ───────────────────────── */
  function fmt(n) {
    return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ── Función principal: analizar conversación ───────────── */
  async function analizar(texto, onResult) {
    const db = await cargarDB();

    const categorias  = detectarCategorias(texto);
    const dimensiones = detectarDimensiones(texto);
    const cantidades  = detectarCantidad(texto);
    const similares   = buscarSimilares(categorias, dimensiones);
    const stats       = calcEstadisticas(similares);

    onResult({ categorias, dimensiones, cantidades, similares, stats, dbSize: db.length });
  }

  /* ── Renderizar resultado en el panel ───────────────────── */
  function renderResultado(container, resultado, onUsarPrecio) {
    const { categorias, dimensiones, similares, stats, dbSize } = resultado;

    if (categorias.length === 0 && similares.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-gray);font-size:13px;padding:10px 0;">
          No se detectó un tipo de trabajo claro. Agrega más detalles en la conversación
          (ej: "ducha", "ventana corrediza", medidas como "1.20 x 2.10")
        </div>`;
      return;
    }

    const tags = categorias.map(c =>
      `<span style="background:var(--green-light);color:var(--green-main);border:1px solid var(--border);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">${c}</span>`
    ).join(' ');

    const dimsHtml = dimensiones.length > 0
      ? dimensiones.map(d =>
          `<span style="background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">
            📐 ${d.ancho}m × ${d.alto}m = ${d.m2} m²
          </span>`
        ).join(' ')
      : '<span style="color:var(--text-gray);font-size:12px;">No se detectaron medidas</span>';

    const statsHtml = stats ? `
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0;">
        <div style="background:var(--green-light);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:var(--text-gray);font-weight:600;text-transform:uppercase;">Mínimo</div>
          <div style="font-size:18px;font-weight:700;color:var(--text-dark);">${fmt(stats.min)}</div>
        </div>
        <div style="background:#F0FFF4;border:2px solid var(--green-mid);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:var(--green-main);font-weight:600;text-transform:uppercase;">Promedio</div>
          <div style="font-size:18px;font-weight:700;color:var(--green-main);">${fmt(stats.avg)}</div>
        </div>
        <div style="background:var(--green-light);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:var(--text-gray);font-weight:600;text-transform:uppercase;">Máximo</div>
          <div style="font-size:18px;font-weight:700;color:var(--text-dark);">${fmt(stats.max)}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-gray);margin-bottom:10px;">
        Basado en ${stats.n} cotizaciones similares de ${dbSize} registros totales
      </div>
    ` : '';

    const simHtml = similares.length > 0 ? `
      <div style="margin-top:10px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-gray);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
          Cotizaciones similares encontradas
        </div>
        ${similares.slice(0,5).map(s => `
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;color:var(--text-dark);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s.desc}">
                ${s.n ? `<strong>#${s.n}</strong> — ` : ''}${s.desc.length > 70 ? s.desc.slice(0,70)+'…' : s.desc}
              </div>
              <div style="font-size:11px;color:var(--text-gray);margin-top:2px;">
                ${s.a > 0 && s.h > 0 ? `${s.a}m × ${s.h}m` : ''}
                ${s.cant > 1 ? ` · Cant: ${s.cant}` : ''}
                ${s.cliente ? ` · ${s.cliente}` : ''}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:15px;font-weight:700;color:var(--green-main);">${fmt(s.p_unit)}</div>
              ${s.p_m2 > 0 ? `<div style="font-size:10px;color:var(--text-gray);">${fmt(s.p_m2)}/m²</div>` : ''}
            </div>
            <button onclick="window._asistentePrecio(${s.p_unit},${s.a||0},${s.h||0},'${(s.desc||'').replace(/'/g,"&#39;").slice(0,120)}')"
              class="btn btn-sm btn-secondary" style="flex-shrink:0;">
              Usar
            </button>
          </div>
        `).join('')}
      </div>
    ` : '';

    const promBtn = stats ? `
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="window._asistentePrecio(${stats.avg},${dimensiones[0]?.ancho||0},${dimensiones[0]?.alto||0},'')"
          class="btn btn-primary">
          Usar precio promedio — ${fmt(stats.avg)}
        </button>
        <button onclick="window._asistentePrecio(${stats.min},${dimensiones[0]?.ancho||0},${dimensiones[0]?.alto||0},'')"
          class="btn btn-outline">
          Precio mínimo — ${fmt(stats.min)}
        </button>
      </div>
    ` : '';

    container.innerHTML = `
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px;">
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          ${tags}
          ${dimsHtml}
        </div>
        ${statsHtml}
        ${simHtml}
        ${promBtn}
      </div>`;
  }

  return { analizar, renderResultado, cargarDB };

})();
