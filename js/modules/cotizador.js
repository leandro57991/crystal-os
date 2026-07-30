/* =========================================================
   Crystal OS — modules/cotizador.js
   Lista de cotizaciones + Nueva cotización + Ver/Editar
   ========================================================= */

/* ── LISTA DE COTIZACIONES ─────────────────────────────── */

// El TOTAL de la cotización se muestra redondeado y sin centavos (más fácil de leer
// y de cobrar); subtotal, ITBMS, abono y saldo mantienen los decimales normales.
function fmtTotal(n) {
  return '$' + Math.round(n||0).toLocaleString('en-US');
}

Router.register('cotizaciones', async (view) => {
  let cotizaciones = await DB.getCotizaciones();
  let filtroEstado = 'Todos';
  let busqueda     = '';
  let fechaDesde   = '';
  let fechaHasta   = '';
  let pagina       = 1;
  let porPagina    = 15;

  function render() {
    let lista = [...cotizaciones].sort((a,b) => (b.numero||0)-(a.numero||0));
    if (filtroEstado !== 'Todos') lista = lista.filter(c => c.estado === filtroEstado);
    if (busqueda) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(c =>
        (c.clienteNombre||'').toLowerCase().includes(q) ||
        String(c.numero).includes(q)
      );
    }
    if (fechaDesde) lista = lista.filter(c => c.fecha && c.fecha >= fechaDesde);
    if (fechaHasta) lista = lista.filter(c => c.fecha && c.fecha <= fechaHasta);

    const pag = UI.paginar(lista, pagina, porPagina);
    pagina = pag.pagina;
    document.getElementById('cotiz-pagination').innerHTML =
      UI.paginacionHTML(pag, 'window._cotizPagina', 'window._cotizPorPagina');

    const table = document.getElementById('cotiz-table-body');
    const cards = document.getElementById('cotiz-mobile-cards');
    if (!table) return;

    if (pag.items.length === 0) {
      const vacio = `No hay cotizaciones${busqueda ? ` con "${busqueda}"` : ''}`;
      table.innerHTML = `<tr><td colspan="6" class="table-empty">${vacio}</td></tr>`;
      if (cards) cards.innerHTML = `<div class="empty-state">${vacio}</div>`;
      return;
    }

    table.innerHTML = pag.items.map(c => {
      const abonoInfo = abonoInfoLinea(c);
      return `
      <tr onclick="Router.go('ver-cotizacion',{id:'${c.id}'})" style="cursor:pointer;">
        <td><strong>${c.esFactura ? (c.numeroFactura||'#'+c.numero) : '#'+c.numero}</strong>${c.esFactura ? '<div style="font-size:10px;color:var(--green-mid);font-weight:600;">FACTURA</div>' : ''}</td>
        <td>${c.clienteNombre||'—'}<br><span style="color:var(--text-gray);font-size:11px;">${c.clienteTel||''}</span></td>
        <td>
          <strong>${fmtTotal(c.total||0)}</strong>
          ${c.abono60 > 0 ? `<div style="font-size:11px;color:var(--green-mid);">60%: ${fmt(c.abono60)}</div>` : ''}
        </td>
        <td>${estadoBadge(c.estado)}${abonoInfo}</td>
        <td style="color:var(--text-gray);">${c.fecha||'—'}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm btn-outline" onclick="Router.go('ver-cotizacion',{id:'${c.id}'})" title="Ver">${UI.icons.eye}</button>
            <button class="btn btn-sm btn-outline" onclick="Router.go('nueva-cotizacion',{id:'${c.id}'})" title="Editar">${UI.icons.edit}</button>
            <button class="btn btn-sm btn-secondary" onclick="generarPDFCotizacion('${c.id}')" title="PDF">${UI.icons.pdf}</button>
            <button class="btn btn-sm btn-whatsapp" onclick="enviarWhatsApp('${c.id}')" title="WhatsApp">${UI.icons.whatsapp}</button>
            <button class="btn btn-sm btn-outline" style="color:var(--danger);" onclick="window._eliminarLista('${c.id}','${c.numero}')" title="Eliminar">${UI.icons.trash}</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    if (cards) {
      cards.innerHTML = pag.items.map(c => {
        const abonoInfo = abonoInfoLinea(c);
        return `
        <div class="cotiz-card" onclick="Router.go('ver-cotizacion',{id:'${c.id}'})">
          <div class="cotiz-card-top">
            <div class="cotiz-card-num">${c.esFactura ? (c.numeroFactura||'#'+c.numero) : '#'+c.numero}${c.esFactura ? ' <span style="font-size:10px;color:var(--green-mid);font-weight:600;">FACTURA</span>' : ''}</div>
            ${estadoBadge(c.estado)}
          </div>
          <div class="cotiz-card-cliente">${c.clienteNombre||'—'}</div>
          ${c.clienteTel ? `<div class="cotiz-card-tel">${c.clienteTel}</div>` : ''}
          <div class="cotiz-card-row">
            <div class="cotiz-card-total">${fmtTotal(c.total||0)}</div>
            <div class="cotiz-card-fecha">${c.fecha||'—'}</div>
          </div>
          ${c.abono60 > 0 ? `<div class="cotiz-card-abono">60%: ${fmt(c.abono60)}</div>` : ''}
          ${abonoInfo}
          <div class="cotiz-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-sm btn-outline" onclick="Router.go('ver-cotizacion',{id:'${c.id}'})">${UI.icons.eye} Ver</button>
            <button class="btn btn-sm btn-outline" onclick="Router.go('nueva-cotizacion',{id:'${c.id}'})">${UI.icons.edit} Editar</button>
            <button class="btn btn-sm btn-secondary" onclick="generarPDFCotizacion('${c.id}')">${UI.icons.pdf} PDF</button>
            <button class="btn btn-sm btn-whatsapp" onclick="enviarWhatsApp('${c.id}')">${UI.icons.whatsapp} WhatsApp</button>
            <button class="btn btn-sm btn-outline cotiz-card-btn-full" style="color:var(--danger);" onclick="window._eliminarLista('${c.id}','${c.numero}')">${UI.icons.trash} Eliminar</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  function abonoInfoLinea(c) {
    return (c.estado === 'Abonado' && c.montoAbono)
      ? `<div class="cotiz-card-abono">Abono: ${fmt(c.montoAbono)}</div>`
      : (c.estado === 'Pagado' && c.montoAbono)
      ? `<div class="cotiz-card-abono">Cancelado: ${fmt(c.montoAbono)}</div>` : '';
  }

  const estados = ['Todos','Borrador','Enviada','Aprobada','Abonado','Pagado','Cancelada'];

  view.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Cotizaciones</div>
        <div class="page-subtitle">${cotizaciones.length} cotizaciones registradas</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" onclick="Router.go('nueva-cotizacion',{factura:'1'})">
          ${UI.icons.plus} Nueva factura
        </button>
        <button class="btn btn-primary" onclick="Router.go('nueva-cotizacion')">
          ${UI.icons.plus} Nueva cotización
        </button>
      </div>
    </div>

    <div class="card">
      <div class="filter-bar">
        ${estados.map(e => `
          <button class="filter-chip${filtroEstado===e?' active':''}" data-estado="${e}">${e}</button>`
        ).join('')}
        <div class="filter-search">
          ${UI.icons.search}
          <input id="cotiz-search" type="text" placeholder="Buscar cliente o #cotización…" value="${busqueda}">
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label style="font-size:12px;color:var(--text-gray);white-space:nowrap;">Desde</label>
          <input id="cotiz-fecha-desde" class="form-input" type="date" style="width:auto;padding:6px 8px;" value="${fechaDesde}">
          <label style="font-size:12px;color:var(--text-gray);white-space:nowrap;">Hasta</label>
          <input id="cotiz-fecha-hasta" class="form-input" type="date" style="width:auto;padding:6px 8px;" value="${fechaHasta}">
          <button class="btn btn-ghost btn-sm" id="cotiz-fecha-clear" type="button">Limpiar fechas</button>
        </div>
      </div>
      <div class="table-wrapper" id="cotiz-table-wrapper">
        <table class="table">
          <thead><tr>
            <th>#</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Acciones</th>
          </tr></thead>
          <tbody id="cotiz-table-body"></tbody>
        </table>
      </div>
      <div class="cotiz-mobile-cards" id="cotiz-mobile-cards"></div>
      <div id="cotiz-pagination"></div>
    </div>
  `;

  render();

  window._cotizPagina = (n) => { pagina = n; render(); };
  window._cotizPorPagina = (n) => { porPagina = parseInt(n); pagina = 1; render(); };

  view.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroEstado = btn.dataset.estado;
      pagina = 1;
      view.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b.dataset.estado === filtroEstado));
      render();
    });
  });

  document.getElementById('cotiz-search').addEventListener('input', e => {
    busqueda = e.target.value;
    pagina = 1;
    render();
  });

  document.getElementById('cotiz-fecha-desde').addEventListener('change', e => {
    fechaDesde = e.target.value;
    pagina = 1;
    render();
  });

  document.getElementById('cotiz-fecha-hasta').addEventListener('change', e => {
    fechaHasta = e.target.value;
    pagina = 1;
    render();
  });

  document.getElementById('cotiz-fecha-clear').addEventListener('click', () => {
    fechaDesde = '';
    fechaHasta = '';
    pagina = 1;
    document.getElementById('cotiz-fecha-desde').value = '';
    document.getElementById('cotiz-fecha-hasta').value = '';
    render();
  });

  window._eliminarLista = async (id, numero) => {
    if (!confirm(`¿Eliminar cotización #${numero}? Esta acción no se puede deshacer.`)) return;
    await DB.deleteCotizacion(id);
    cotizaciones = cotizaciones.filter(c => c.id !== id);
    UI.toast(`Cotización #${numero} eliminada`, 'success');
    render();
  };
});

/* ── NUEVA COTIZACIÓN ─────────────────────────────────── */

Router.register('nueva-cotizacion', async (view, params) => {
  const nextNum  = params.id ? null : await DB.nextNumeroCotizacion();
  const editando = params.id ? await DB.getCotizacion(params.id) : null;
  const numero   = editando ? editando.numero : nextNum;
  const itbms    = await DB.getConfig('itbms', 0.07);
  const items    = await DB.getInventario();
  const productos = items.filter(i => i.precio > 0).sort((a,b) => a.nombre.localeCompare(b.nombre));

  let tipoCotizacion = editando?.tipoCotizacion || 'Estandar';
  let configCols = editando?.configCols || { foto: true, ancho: true, alto: true, unidad: true, m2: true, cantidad: true };

  // Precio global: varios ítems cotizados en conjunto con un solo total, sin
  // desglosar precio por unidad (ej. 3 puertas por $450 en total, sin decir c/u).
  let precioGlobal = editando?.precioGlobal || false;
  let totalGlobalManual = editando?.totalGlobal || 0;

  // Factura directa: se factura sin pasar por el flujo de cotización/aprobación
  // (ej. trabajos pequeños que se cobran de una vez, sin cotizar antes).
  const esFactura = editando ? !!editando.esFactura : (params.factura === '1');
  let numeroFacturaManual = editando?.numeroFactura || ('F-' + numero);

  // Estado/abono actuales disponibles para generarPDFCotizacion() al usar "Generar PDF" desde el formulario
  window._estadoPDF     = editando?.estado || 'Enviada';
  window._montoAbonoPDF = editando?.montoAbono || 0;
  window._esFacturaPDF  = editando ? !!editando.esFactura : (params.factura === '1');

  // linea: { tipo: 'producto'|'manual', producto, descripcion, ancho, alto, m2, precio, total, unidad, cantidad, foto }
  let lineas = editando?.lineas || [{ tipo:'producto', producto:'', descripcion:'', ancho:'', alto:'', m2:'', precio:'', total:'', cantidad:1, foto:'' }];

  function calcLinea(l) {
    const ancho = parseFloat(l.ancho) || 0;
    const alto  = parseFloat(l.alto)  || 0;
    const precio= parseFloat(l.precio)|| 0;
    const cant  = parseFloat(l.cantidad) || 1;
    const esM2  = l.unidad !== 'unidad' && l.unidad !== 'global';
    l.m2    = esM2 ? (ancho * alto).toFixed(2) : '—';
    // Si el total ya fue colocado a mano, no se recalcula solo — precio y total
    // quedan independientes hasta que se presione "Recalcular" en esa línea.
    if (!l.totalManual) {
      l.total = esM2 ? (ancho * alto * precio * cant) : (precio * cant);
    }
    return l;
  }

  function totalSubtotal() {
    if (precioGlobal) return parseFloat(totalGlobalManual) || 0;
    return lineas.reduce((s, l) => s + (parseFloat(l.total)||0), 0);
  }

  function renderHeaderLineas() {
    const thead = document.getElementById('lineas-thead');
    if (!thead) return;
    thead.innerHTML = `<tr>
      ${configCols.foto ? '<th style="width:60px;">Foto</th>' : ''}
      <th style="min-width:220px;">Producto / Servicio</th>
      ${configCols.ancho ? '<th>Ancho</th>' : ''}
      ${configCols.alto ? '<th>Alto</th>' : ''}
      ${configCols.unidad ? '<th>Unidad</th>' : ''}
      ${configCols.m2 ? '<th>m²</th>' : ''}
      <th>Precio</th>
      ${configCols.cantidad ? '<th>Cant.</th>' : ''}
      <th>Total</th><th></th>
    </tr>`;
  }

  function renderLineas() {
    const tbody = document.getElementById('lineas-tbody');
    if (!tbody) return;
    tbody.innerHTML = lineas.map((l, i) => {
      const esManual = l.tipo === 'manual';
      const prod = !esManual ? productos.find(p => p.nombre === l.producto) : null;
      const esM2 = esManual ? (l.unidad !== 'unidad') : (prod?.unidad !== 'unidad' && prod?.unidad !== 'global');

      return `
        <tr>
          ${configCols.foto ? `
          <td style="width:60px;text-align:center;">
            <div onclick="window._openMediaLib(${i})" style="width:44px;height:44px;background:#eee;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border);" title="Seleccionar foto">
              ${l.foto ? `<img src="${l.foto}" style="width:100%;height:100%;object-fit:cover;">` : '📷'}
            </div>
          </td>` : ''}
          <td>
            <div style="display:flex;flex-direction:column;gap:4px;min-width:200px;">
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <button type="button" class="btn btn-xs ${esManual?'btn-outline':'btn-secondary'}" onclick="window._toggleTipo(${i})" title="${esManual?'Cambiar a catálogo':'Escribir manual'}" style="font-size:10px;padding:2px 8px;">
                  ${esManual ? '✏️ Manual' : '📋 Catálogo'}
                </button>
              </div>
              ${esManual
                ? `<textarea class="desc-textarea" rows="1" placeholder="Descripción del servicio…" style="min-width:180px;width:100%;resize:none;overflow-y:auto;max-height:120px;line-height:1.4;font-family:inherit;" onchange="window._lineaChange(${i},'descripcion',this.value)" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px';">${l.descripcion||''}</textarea>`
                : `<select onchange="window._lineaChange(${i},'producto',this.value)" style="min-width:180px;">
                    <option value="">— Seleccionar —</option>
                    ${productos.map(p => `<option value="${p.nombre}" ${p.nombre===l.producto?'selected':''}>${p.nombre}</option>`).join('')}
                   </select>`
              }
            </div>
          </td>
          ${configCols.ancho ? `<td><input type="number" min="0" step="0.01" value="${l.ancho||''}" placeholder="m" onchange="window._lineaChange(${i},'ancho',this.value)" style="max-width:80px;" ${!esM2?'disabled':''}></td>` : ''}
          ${configCols.alto ? `<td><input type="number" min="0" step="0.01" value="${l.alto||''}" placeholder="m" onchange="window._lineaChange(${i},'alto',this.value)" style="max-width:80px;" ${!esM2?'disabled':''}></td>` : ''}
          ${configCols.unidad ? `<td>
               <select onchange="window._lineaChange(${i},'unidad',this.value)" style="max-width:80px;">
                 <option value="unidad" ${l.unidad==='unidad'?'selected':''}>Unidad</option>
                 <option value="m²" ${!l.unidad||l.unidad==='m²'?'selected':''}>m²</option>
               </select>
             </td>` : ''}
          ${configCols.m2 ? `<td>${esM2 ? `<div class="auto-field">${l.m2||'—'}</div>` : '—'}</td>` : ''}
          ${precioGlobal
            ? `<td><div class="auto-field" style="opacity:.55;text-align:center;">—</div></td>`
            : `<td><input type="number" min="0" step="0.01" value="${l.precio||0}" onchange="window._lineaChange(${i},'precio',this.value)" style="max-width:90px;" title="Precio unitario — no afecta el total si ya lo colocaste a mano"></td>`}
          ${configCols.cantidad ? `<td><input type="number" min="1" value="${l.cantidad||1}" onchange="window._lineaChange(${i},'cantidad',this.value)" style="max-width:60px;"></td>` : ''}
          ${precioGlobal
            ? `<td><div class="auto-field" style="opacity:.55;text-align:center;">—</div></td>`
            : `<td>
            <div style="display:flex;align-items:center;gap:4px;">
              <input type="number" min="0" step="0.01" value="${l.total||0}" onchange="window._lineaChange(${i},'total',this.value)" style="max-width:90px;${l.totalManual?'border-color:var(--green-mid);background:#f0fdf4;':''}" title="Total de la línea — puedes colocarlo directo si el jefe ya te da el precio final">
              ${l.totalManual ? `<button type="button" class="btn btn-ghost btn-sm" onclick="window._recalcularTotal(${i})" title="Volver a calcular el total desde precio × m² × cantidad" style="padding:2px 6px;font-size:11px;">↺</button>` : ''}
            </div>
          </td>`}
          <td>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window._removeLinea(${i})">${UI.icons.trash}</button>
          </td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('.desc-textarea').forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    });
    renderHeaderLineas();
    refreshTotals();
  }

  function refreshTotals() {
    const sub      = totalSubtotal();
    const aplicaITBMS = document.getElementById('chk-itbms')?.checked !== false;
    const imp      = aplicaITBMS ? (sub * itbms) : 0;
    const total    = Math.round(sub + imp); // total redondeado, sin centavos

    let abono60 = 0, saldo40 = total;
    if (tipoCotizacion === 'Estandar') { abono60 = total * 0.6; saldo40 = total * 0.4; }
    else if (tipoCotizacion === 'Smart Glass') { abono60 = total * 0.8; saldo40 = total * 0.2; }
    else if (tipoCotizacion === 'Smart Fit') { abono60 = 0; saldo40 = total; }

    const el = id => document.getElementById(id);
    if (el('sub-val'))    el('sub-val').textContent    = fmt(sub);
    if (el('itbms-row'))  el('itbms-row').style.display = aplicaITBMS ? '' : 'none';
    if (el('itbms-val'))  el('itbms-val').textContent  = fmt(imp);
    if (el('total-val'))  el('total-val').textContent  = fmtTotal(total);
    if (el('abono60-val'))el('abono60-val').textContent= fmt(abono60);
    if (el('saldo40-val'))el('saldo40-val').textContent= fmt(saldo40);

    if (tipoCotizacion === 'Smart Fit') {
      if(el('forma-pago-container')) el('forma-pago-container').style.display = 'none';
      if(el('forma-pago-title')) el('forma-pago-title').style.display = 'none';
    } else {
      if(el('forma-pago-container')) el('forma-pago-container').style.display = 'block';
      if(el('forma-pago-title')) el('forma-pago-title').style.display = 'block';
      if(el('abono-label')) el('abono-label').textContent = tipoCotizacion==='Smart Glass' ? '80% — Abono inicial' : '60% — Abono inicial';
      if(el('saldo-label')) el('saldo-label').textContent = tipoCotizacion==='Smart Glass' ? '20% — Saldo restante' : '40% — Saldo restante';
    }

    // Guardar en campos ocultos para PDF
    window._totalesActuales = { sub, imp, total, abono60, saldo40, aplicaITBMS };
    window._tipoCotizPDF = tipoCotizacion;
    window._configColsPDF = configCols;
    window._lineasPDF = lineas;
  }

  window._togglePrecioGlobal = (checked) => {
    precioGlobal = checked;
    const grp = document.getElementById('total-global-group');
    if (grp) grp.style.display = checked ? 'block' : 'none';
    if (checked && !totalGlobalManual) {
      const sumaActual = lineas.reduce((s, l) => s + (parseFloat(l.total)||0), 0);
      totalGlobalManual = sumaActual || 0;
      const inp = document.getElementById('total-global-input');
      if (inp) inp.value = totalGlobalManual || '';
    }
    renderLineas();
  };

  window._setTotalGlobal = (val) => {
    totalGlobalManual = parseFloat(val) || 0;
    refreshTotals();
  };

  window._toggleRUC = (tipo) => {
    const grupo = document.getElementById('ruc-group');
    if (grupo) grupo.style.display = ['Comercial','Corporativo'].includes(tipo) ? 'block' : 'none';
  };

  window._toggleTipo = (i) => {
    lineas[i].tipo = lineas[i].tipo === 'manual' ? 'producto' : 'manual';
    lineas[i].descripcion = '';
    lineas[i].producto = '';
    lineas[i].precio = '';
    lineas[i].ancho = '';
    lineas[i].alto = '';
    lineas[i].m2 = '';
    lineas[i].total = '';
    lineas[i].totalManual = false;
    lineas[i].unidad = 'm²';
    lineas[i].foto = '';
    renderLineas();
  };

  window._lineaChange = (i, field, val) => {
    lineas[i][field] = val;
    if (field === 'producto') {
      const prod = productos.find(p => p.nombre === val);
      lineas[i].precio  = prod ? prod.precio : '';
      lineas[i].unidad  = prod?.unidad || 'm²';
    }
    if (field === 'unidad') {
      lineas[i].ancho = '';
      lineas[i].alto  = '';
      lineas[i].m2    = '';
    }
    if (field === 'total') {
      // Total colocado a mano (cuando el jefe ya da el precio final, no por m²).
      // Queda fijo tal cual lo escribieron: no se toca el precio ni se recalcula
      // solo con cambios de ancho/alto/cantidad hasta que presionen "Recalcular".
      lineas[i].total = parseFloat(val) || 0;
      lineas[i].totalManual = true;
    } else if (field === 'precio') {
      // El precio es independiente: si el total ya fue fijado a mano, escribir
      // aquí NO lo sobreescribe (queda solo como referencia hasta "Recalcular").
      lineas[i].precio = val;
      lineas[i] = calcLinea(lineas[i]);
    } else {
      lineas[i] = calcLinea(lineas[i]);
    }
    renderLineas();
  };

  window._recalcularTotal = (i) => {
    lineas[i].totalManual = false;
    lineas[i] = calcLinea(lineas[i]);
    renderLineas();
  };

  window._removeLinea = (i) => {
    if (lineas.length === 1) {
      lineas[0] = { tipo:'producto', producto:'',descripcion:'',ancho:'',alto:'',m2:'',precio:'',total:'' };
    } else {
      lineas.splice(i, 1);
    }
    renderLineas();
  };

  window._addLinea = () => {
    lineas.push({ tipo:'producto', producto:'',descripcion:'',ancho:'',alto:'',m2:'',precio:'',total:'',foto:'' });
    renderLineas();
  };

  window._addLineaManual = () => {
    lineas.push({ tipo:'manual', descripcion:'',ancho:'',alto:'',m2:'',precio:'',total:'',unidad:'m²',foto:'' });
    renderLineas();
  };

  window._openMediaLib = (idx) => {
    window._currentLineaFoto = idx;
    document.getElementById('modal-media-lib').style.display = 'flex';
    window._loadMediaLib();
  };

  window._selectFoto = (url) => {
    if (window._currentLineaFoto !== undefined) {
      lineas[window._currentLineaFoto].foto = url;
      renderLineas();
    }
    document.getElementById('modal-media-lib').style.display = 'none';
  };

  window._toggleCol = (col, checked) => {
    configCols[col] = checked;
    renderLineas();
  };

  window._deleteCotizacion = async (id) => {
    if (confirm('¿Estás seguro de que quieres eliminar esta cotización?')) {
      await DB.deleteCotizacion(id);
      UI.toast('Cotización eliminada');
      Router.go('cotizaciones');
    }
  };

  window._changeTipoCotiz = (tipo) => {
    tipoCotizacion = tipo;
    refreshTotals();
  };

  async function guardar(estado, emitirPDF) {
    const totales = window._totalesActuales || { sub: totalSubtotal(), imp: 0, total: totalSubtotal(), abono60: 0, saldo40: 0 };

    const lineasFiltradas = lineas.filter(l =>
      l.tipo === 'manual' ? l.descripcion : l.producto
    ).map(l => ({
      ...l,
      producto: l.tipo === 'manual' ? (l.descripcion || '—') : l.producto,
    }));

    // Al editar, parte del registro existente para no perder campos que no vienen del
    // formulario (montoAbono, fechaAbono, metodoAbono, fechaEnvio, numeroFactura…).
    const data = {
      ...(editando || {}),
      id:            editando?.id || undefined,
      numero,
      fecha:         document.getElementById('fecha').value,
      clienteNombre: document.getElementById('clienteNombre').value,
      clienteTel:    document.getElementById('clienteTel').value,
      clienteEmail:  document.getElementById('clienteEmail').value,
      clienteDir:    document.getElementById('clienteDir').value,
      tipoCliente:   document.getElementById('tipoCliente').value,
      clienteRUC:    document.getElementById('clienteRUC')?.value || '',
      notas:         document.getElementById('notas').value,
      lineas:        lineasFiltradas,
      subtotal:      totales.sub,
      itbms:         totales.imp,
      total:         totales.total,
      abono60:       totales.abono60,
      saldo40:       totales.saldo40,
      aplicaITBMS:   totales.aplicaITBMS,
      tipoCotizacion,
      configCols,
      precioGlobal,
      totalGlobal: precioGlobal ? totalGlobalManual : undefined,
      esFactura,
      numeroFactura: esFactura ? (document.getElementById('numeroFactura')?.value.trim() || numeroFacturaManual) : editando?.numeroFactura,
      fechaFactura:  esFactura ? (editando?.fechaFactura || new Date().toISOString().slice(0,10)) : editando?.fechaFactura,
      // No degradar un estado más avanzado (Abonado/Pagado/Completado/Factura) solo por
      // editar el contenido de la cotización; el cambio de estado se hace desde "Ver cotización".
      estado: (editando && ['Abonado','Pagado'].includes(editando.estado))
        ? editando.estado
        : estado,
    };
    if (!data.clienteNombre) { UI.toast('El nombre del cliente es requerido', 'error'); return; }
    if (esFactura && !data.numeroFactura) { UI.toast('Escribe el número de factura', 'error'); return; }
    const saved = await DB.saveCotizacion(data);
    if (esFactura) await _syncCobroFacturaDirecta(saved, data.numeroFactura);
    UI.toast(esFactura ? `Factura ${data.numeroFactura} guardada` : (estado === 'Borrador' ? 'Borrador guardado' : 'Cotización #' + numero + ' guardada'), 'success');
    if (emitirPDF) {
      await generarPDFCotizacion(saved.id);
    }
    Router.go('cotizaciones');
  }

  async function _syncCobroFacturaDirecta(cot, numeroFactura) {
    const cobros = await DB.getCobros();
    let cobro = cobros.find(cb => cb.cotizacionId === cot.id);
    const pagado = cot.montoAbono || 0;
    const saldo  = (cot.total || 0) - pagado;
    if (!cobro) {
      await DB.saveCobro({
        cotizacionId:  cot.id,
        numero:        cot.numero,
        factura:       numeroFactura,
        clienteNombre: cot.clienteNombre,
        telefono:      cot.clienteTel || '',
        notas:         `Factura ${numeroFactura}`,
        total:         cot.total || 0,
        pagado:        pagado,
        saldo:         saldo,
        estado:        pagado >= (cot.total||0) - 0.01 ? 'Pagado' : (pagado > 0 ? 'Parcial' : 'Pendiente'),
        fecha:         cot.fecha,
        vencimiento:   '',
      });
    } else {
      cobro.factura = numeroFactura;
      cobro.total    = cot.total || 0;
      cobro.saldo    = saldo;
      await DB.saveCobro(cobro);
    }
  }

  const today = new Date().toISOString().slice(0,10);

  view.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${editando ? 'Editar' : 'Nueva'} ${esFactura ? 'Factura' : 'Cotización'} #${numero}</div>
        <div class="page-subtitle">${today}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" onclick="window.guardar('Borrador')">Guardar borrador</button>
        <button class="btn btn-secondary" onclick="generarPDFCotizacion(null, true)" id="btn-pdf">${UI.icons.pdf} Generar PDF</button>
        <button class="btn btn-primary" onclick="window.guardar('Enviada', true)">${UI.icons.check} ${esFactura ? 'Guardar y facturar' : 'Guardar y emitir'}</button>
        ${editando ? `<button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="window._deleteCotizacion(${editando.id})">${UI.icons.trash} Eliminar</button>` : ''}
      </div>
    </div>

    <!-- ══ PANEL ASISTENTE IA ══════════════════════════════════ -->
    <div class="card" id="asistente-card" style="margin-bottom:20px;border:2px solid var(--green-mid);background:linear-gradient(135deg,#f0fdf4,#ffffff);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:0;flex-wrap:wrap;">
        <div style="background:var(--green-main);color:white;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700;letter-spacing:0.3px;flex-shrink:0;">
          ✦ Asistente IA
        </div>
        <span style="font-size:13px;color:var(--text-gray);flex:1;min-width:0;">
          Pega una conversación de WhatsApp para sugerir precios
        </span>
        <button class="btn btn-ghost btn-sm" id="btn-toggle-asistente" onclick="window._toggleAsistente()" style="flex-shrink:0;">
          Ocultar
        </button>
      </div>

      <div id="asistente-panel" style="margin-top:14px;">
        <textarea id="wa-texto" class="form-textarea"
          placeholder="Pega aquí la conversación de WhatsApp con el cliente…"
          style="min-height:100px;font-size:13px;resize:vertical;"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="window._analizarConversacion()">
            Analizar y sugerir precios
          </button>
          <button class="btn btn-ghost" onclick="document.getElementById('wa-texto').value='';document.getElementById('asistente-resultado').innerHTML=''">
            Limpiar
          </button>
          <span id="asistente-db-info" style="font-size:11px;color:var(--text-gray);align-self:center;"></span>
        </div>
        <div id="asistente-resultado" style="margin-top:12px;"></div>
      </div>
    </div>
    <!-- ══ FIN PANEL ASISTENTE ════════════════════════════════ -->

    <div style="display:grid;grid-template-columns:1fr 2fr;gap:20px;align-items:start;" id="cotiz-grid">
      <!-- Datos del cliente -->
      <div class="card">
        <div class="card-title" style="margin-bottom:16px;">Datos del Cliente</div>
        ${esFactura ? `
        <div class="form-group">
          <label class="form-label">Número de factura <span class="required">*</span></label>
          <input id="numeroFactura" class="form-input" placeholder="F-1806" value="${numeroFacturaManual}">
        </div>` : ''}
        <div class="form-group">
          <label class="form-label">Nombre completo <span class="required">*</span></label>
          <input id="clienteNombre" class="form-input" placeholder="Nombre del cliente" value="${editando?.clienteNombre||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input id="clienteTel" class="form-input" placeholder="6xxx-xxxx" value="${editando?.clienteTel||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Correo electrónico</label>
          <input id="clienteEmail" class="form-input" type="email" placeholder="correo@ejemplo.com" value="${editando?.clienteEmail||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Dirección del proyecto</label>
          <input id="clienteDir" class="form-input" placeholder="Dirección o lugar" value="${editando?.clienteDir||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de cliente</label>
          <select id="tipoCliente" class="form-select" onchange="window._toggleRUC(this.value)">
            <option ${editando?.tipoCliente==='Residencial'?'selected':''}>Residencial</option>
            <option ${editando?.tipoCliente==='Comercial'?'selected':''}>Comercial</option>
            <option ${editando?.tipoCliente==='Corporativo'?'selected':''}>Corporativo</option>
          </select>
        </div>
        <div class="form-group" id="ruc-group" style="display:${['Comercial','Corporativo'].includes(editando?.tipoCliente)?'block':'none'};">
          <label class="form-label">RUC</label>
          <input id="clienteRUC" class="form-input" placeholder="RUC (opcional)" value="${editando?.clienteRUC||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input id="fecha" class="form-input" type="date" value="${editando?.fecha||today}">
        </div>
      </div>

      <!-- Detalle del trabajo -->
      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">Configuración de Cotización</div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;background:var(--bg-body);padding:12px;border-radius:8px;border:1px solid var(--border);">
          <div style="flex:1;">
            <label class="form-label">Tipo de Cotización</label>
            <select class="form-select" onchange="window._changeTipoCotiz(this.value)">
              <option ${tipoCotizacion==='Estandar'?'selected':''}>Estandar</option>
              <option ${tipoCotizacion==='Smart Fit'?'selected':''}>Smart Fit</option>
              <option ${tipoCotizacion==='Smart Glass'?'selected':''}>Smart Glass</option>
            </select>
          </div>
          <div style="flex:2;">
            <label class="form-label">Columnas Visibles</label>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;">
              <label style="font-size:13px;cursor:pointer;"><input type="checkbox" ${configCols.foto?'checked':''} onchange="window._toggleCol('foto',this.checked)"> Foto/Ref</label>
              <label style="font-size:13px;cursor:pointer;"><input type="checkbox" ${configCols.ancho?'checked':''} onchange="window._toggleCol('ancho',this.checked)"> Ancho</label>
              <label style="font-size:13px;cursor:pointer;"><input type="checkbox" ${configCols.alto?'checked':''} onchange="window._toggleCol('alto',this.checked)"> Alto</label>
              <label style="font-size:13px;cursor:pointer;"><input type="checkbox" ${configCols.unidad?'checked':''} onchange="window._toggleCol('unidad',this.checked)"> Unidad</label>
              <label style="font-size:13px;cursor:pointer;"><input type="checkbox" ${configCols.m2?'checked':''} onchange="window._toggleCol('m2',this.checked)"> m²</label>
              <label style="font-size:13px;cursor:pointer;"><input type="checkbox" ${configCols.cantidad?'checked':''} onchange="window._toggleCol('cantidad',this.checked)"> Cantidad</label>
            </div>
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;margin-bottom:16px;background:var(--bg-body);padding:10px 12px;border-radius:8px;border:1px solid var(--border);">
          <input type="checkbox" id="chk-precio-global" ${precioGlobal?'checked':''} onchange="window._togglePrecioGlobal(this.checked)">
          Precio global — un solo total para todos los ítems, sin desglosar precio por unidad
        </label>

        <div id="total-global-group" class="form-group" style="display:${precioGlobal?'block':'none'};">
          <label class="form-label">Total combinado de todos los ítems</label>
          <input type="number" min="0" step="0.01" id="total-global-input" class="form-input" placeholder="Ej: 450.00" value="${totalGlobalManual||''}" onchange="window._setTotalGlobal(this.value)">
        </div>

        <div class="card-title" style="margin-bottom:4px;">Detalle del Trabajo</div>
        <p style="color:var(--text-gray);font-size:12px;margin-bottom:12px;">
          Cada línea puede ser del catálogo o descripción manual — usa el botón <strong>📋/✏️</strong> para cambiar.
        </p>
        <div class="table-wrapper" style="margin-bottom:10px;overflow-x:auto;">
          <table class="lineas-table" style="min-width:600px;">
            <thead id="lineas-thead"></thead>
            <tbody id="lineas-tbody"></tbody>
          </table>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="window._addLinea()">
            ${UI.icons.plus} De catálogo
          </button>
          <button class="btn btn-outline btn-sm" onclick="window._addLineaManual()">
            ✏️ Descripción manual
          </button>
        </div>

        <div class="total-box" style="margin-top:16px;">
          <div class="total-row"><span>Subtotal</span><span id="sub-val">$0.00</span></div>
          <div class="total-row" style="align-items:center;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
              <input type="checkbox" id="chk-itbms" ${editando?.aplicaITBMS === false ? '' : 'checked'} onchange="refreshTotals()"> ITBMS (7%)
            </label>
            <span id="itbms-val" style="color:var(--text-gray);">$0.00</span>
          </div>
          <div id="itbms-row"></div>
          <div class="total-row grand" style="margin-top:4px;"><span>TOTAL</span><span id="total-val">$0.00</span></div>
          <div style="border-top:2px dashed var(--border);margin:12px 0;"></div>
          <div id="forma-pago-title" style="font-size:11px;color:var(--text-gray);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Forma de pago</div>
          <div id="forma-pago-container">
            <div class="total-row" style="color:var(--green-main);">
              <span id="abono-label">60% — Abono inicial</span>
              <span id="abono60-val" style="font-weight:700;">$0.00</span>
            </div>
            <div class="total-row" style="color:var(--amber);">
              <span id="saldo-label">40% — Saldo restante</span>
              <span id="saldo40-val" style="font-weight:700;">$0.00</span>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-top:16px;">
          <label class="form-label">Notas adicionales (opcional)</label>
          <textarea id="notas" class="form-textarea" placeholder="Observaciones o puntos específicos para este cliente/proyecto (opcional)…">${editando?.notas||''}</textarea>
        </div>
      </div>
    </div>

    <!-- Modal Biblioteca de Imágenes -->
    <div class="modal-overlay" id="modal-media-lib" style="display:none;z-index:9999;">
      <div class="modal" style="max-width:700px;width:100%;">
        <div class="modal-header">
          <div class="modal-title">Seleccionar de Biblioteca</div>
          <button class="modal-close" onclick="document.getElementById('modal-media-lib').style.display='none'">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
            <input type="text" id="media-search" class="form-input" placeholder="Buscar por nombre o etiqueta..." onkeyup="window._filterMedia(this.value)" style="flex:1;min-width:160px;">
            <button class="btn btn-secondary" onclick="document.getElementById('media-upload-file').click()">${UI.icons.plus} Subir nueva foto</button>
            <button class="btn btn-outline" onclick="window._selectFoto('')">Quitar foto de ítem</button>
            <input type="file" id="media-upload-file" accept="image/*" style="display:none;" onchange="window._uploadMediaLib(this.files[0])">
          </div>
          <div id="media-upload-status" style="display:none;margin-bottom:12px;font-size:13px;color:var(--text-gray);"></div>
          <div id="media-lib-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;max-height:400px;overflow-y:auto;padding-right:8px;">
          </div>
        </div>
      </div>
    </div>
  `;

  window._allMedia = [];
  window._loadMediaLib = async () => {
    const grid = document.getElementById('media-lib-grid');
    grid.innerHTML = '<p>Cargando...</p>';
    try {
      window._allMedia = await DB.getBiblioteca();
      window._filterMedia('');
    } catch {
      grid.innerHTML = '<p style="color:var(--danger);">Error al cargar biblioteca.</p>';
    }
  };

  // Subir una foto nueva directo desde el cotizador — queda guardada en la
  // Biblioteca de Fotos (misma tabla que el módulo Biblioteca) y se asigna
  // de una vez a la línea que se estaba editando.
  window._uploadMediaLib = (file) => {
    if (!file) return;
    const status = document.getElementById('media-upload-status');
    status.style.display = 'block';
    status.textContent = 'Subiendo foto...';
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      const nombre = file.name.replace(/\.[^.]+$/, '') || `Foto ${new Date().toLocaleDateString('es-PA')}`;
      try {
        await DB.saveImagen({ nombre, descripcion: '', carpeta: 'Cotizador', etiquetas: '', base64, fecha: new Date().toISOString() });
        document.getElementById('media-upload-file').value = '';
        status.style.display = 'none';
        await window._loadMediaLib();
        window._selectFoto(base64);
        UI.toast('Foto subida y agregada a la biblioteca', 'success');
      } catch (err) {
        status.textContent = 'Error al subir la foto. Intenta de nuevo.';
      }
    };
    reader.readAsDataURL(file);
  };

  window._filterMedia = (q) => {
    const grid = document.getElementById('media-lib-grid');
    if (window._allMedia.length === 0) { grid.innerHTML = '<p style="color:var(--text-gray);">No hay imágenes en la biblioteca. Ve a la pestaña Biblioteca para agregar fotos.</p>'; return; }
    const filtered = window._allMedia.filter(f => !q || (f.nombre||'').toLowerCase().includes(q.toLowerCase()) || (f.etiquetas||'').toLowerCase().includes(q.toLowerCase()));
    grid.innerHTML = filtered.map(f => `
      <div class="media-item" style="position:relative;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#fff;">
        <img src="${f.base64}" style="width:100%;height:100px;object-fit:cover;cursor:pointer;" onclick="window._selectFoto('${f.base64}')">
        <div style="padding:4px;font-size:10px;color:var(--text-gray);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${f.nombre}">${f.nombre}</div>
      </div>
    `).join('');
  };

  if (!document.getElementById('cotiz-grid-style')) {
    const s = document.createElement('style');
    s.id = 'cotiz-grid-style';
    s.textContent = '@media(max-width:900px){#cotiz-grid{grid-template-columns:1fr!important}}';
    document.head.appendChild(s);
  }

  /* ── ASISTENTE IA ─────────────────────────────────────── */

  window._toggleAsistente = () => {
    const panel = document.getElementById('asistente-panel');
    const btn   = document.getElementById('btn-toggle-asistente');
    const hidden = panel.style.display === 'none';
    panel.style.display = hidden ? '' : 'none';
    btn.textContent = hidden ? 'Ocultar' : 'Mostrar';
  };

  window._analizarConversacion = async () => {
    const texto = (document.getElementById('wa-texto')?.value || '').trim();
    if (!texto) { UI.toast('Pega una conversación de WhatsApp primero', 'warning'); return; }

    const resultDiv = document.getElementById('asistente-resultado');
    resultDiv.innerHTML = `<div style="color:var(--text-gray);font-size:13px;padding:8px 0;">
      <span style="display:inline-block;animation:spin 1s linear infinite;">⏳</span> Buscando en historial de cotizaciones…
    </div>`;

    await Asistente.analizar(texto, (resultado) => {
      // Mostrar info de la base de datos
      const dbInfo = document.getElementById('asistente-db-info');
      if (dbInfo) dbInfo.textContent = `Base: ${resultado.dbSize} cotizaciones`;

      Asistente.renderResultado(resultDiv, resultado, null);
    });
  };

  /* Aplica una propuesta del asistente: redacción + medidas + precio, respetando
     si el trabajo se cobra por m² o por unidad (instalación/reparación). */
  window._asistenteAplicar = (p) => {
    const prop = typeof p === 'string' ? JSON.parse(p) : p;
    const ultima = lineas[lineas.length - 1];
    const vacia = ultima && !ultima.producto && !ultima.descripcion && !(parseFloat(ultima.total) > 0);
    if (!vacia) {
      lineas.push({ tipo:'manual', producto:'', descripcion:'', ancho:'', alto:'', m2:'', precio:'', total:'', cantidad:1, unidad:'m²', foto:'' });
    }
    const idx = lineas.length - 1;
    const l = lineas[idx];

    l.tipo   = 'manual';
    l.unidad = prop.modo === 'm2' ? 'm²' : 'unidad';
    if (prop.desc)  l.descripcion = prop.desc;
    if (prop.modo === 'm2') {
      if (prop.ancho > 0) l.ancho = prop.ancho;
      if (prop.alto  > 0) l.alto  = prop.alto;
    }
    if (prop.precio > 0) l.precio = prop.precio;
    l.cantidad = l.cantidad || 1;
    l.totalManual = false;
    lineas[idx] = calcLinea(l);

    renderLineas();
    UI.toast('Propuesta agregada a la cotización', 'success');
    document.getElementById('cotiz-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Compatibilidad con el botón viejo del asistente
  window._asistentePrecio = (precio, ancho, alto, desc) =>
    window._asistenteAplicar({ precio, ancho, alto, desc, modo: (ancho > 0 && alto > 0) ? 'm2' : 'unidad' });

  // En móvil arrancar el asistente colapsado para no tapar el formulario
  if (window.innerWidth <= 768) {
    const panel = document.getElementById('asistente-panel');
    const btn   = document.getElementById('btn-toggle-asistente');
    if (panel) panel.style.display = 'none';
    if (btn)   btn.textContent = 'Mostrar';
  }

  // Precargar la base de datos de precios en segundo plano
  Asistente.cargarDB().then(db => {
    const el = document.getElementById('asistente-db-info');
    if (el) el.textContent = db.length > 0 ? `Base: ${db.length} cotizaciones` : 'Procesando historial…';
  });

  window.guardar = guardar;
  window.refreshTotals = refreshTotals;
  lineas.forEach((l,i) => { lineas[i] = calcLinea(l); });
  renderLineas();
});

/* ── VER COTIZACIÓN ─────────────────────────────────────── */

Router.register('ver-cotizacion', async (view, params) => {
  const c = await DB.getCotizacion(params.id);
  if (!c) { view.innerHTML = '<div class="empty-state"><h3>Cotización no encontrada</h3></div>'; return; }

  const estados = ['Borrador','Enviada','Aprobada','Abonado','Pagado','Cancelada'];

  // Calcular cuánto se ha abonado acumulado
  const abonoAcum = c.montoAbono || 0;
  const saldoPend = (c.total||0) - abonoAcum;
  const pagadoTotal = abonoAcum > 0 && saldoPend <= 0.01;
  const puedeFacturar = !c.esFactura && ['Aprobada','Abonado','Pagado'].includes(c.estado);

  view.innerHTML = `
    <div class="page-header">
      <div>
        <button class="btn btn-ghost" onclick="Router.go('cotizaciones')">${UI.icons.arrowLeft} Volver</button>
        <div class="page-title" style="margin-top:8px;">${c.esFactura ? `Factura ${c.numeroFactura||''}` : `Cotización #${c.numero}`}</div>
        <div class="page-subtitle">${c.clienteNombre} — ${c.fecha||'—'}</div>
      </div>
      <div class="page-actions">
        <select id="select-estado" class="form-select" style="width:auto;" onchange="window.cambiarEstado(this.value)">
          ${estados.map(e => `<option ${e===c.estado?'selected':''}>${e}</option>`).join('')}
        </select>
        <button class="btn btn-outline" onclick="Router.go('nueva-cotizacion',{id:'${c.id}'})">${UI.icons.edit} Editar</button>
        ${puedeFacturar ? `<button class="btn btn-primary" onclick="window.abrirModalFactura()">${UI.icons.pdf || ''} Convertir a factura</button>` : ''}
        <button class="btn btn-secondary" onclick="generarPDFCotizacion('${c.id}')">${UI.icons.pdf} PDF</button>
        <button class="btn btn-whatsapp" onclick="enviarWhatsApp('${c.id}')">${UI.icons.whatsapp} WhatsApp</button>
        <button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="window._eliminarVista('${c.id}')">${UI.icons.trash} Eliminar</button>
      </div>
    </div>

    <!-- Alerta 24h si estado es Pendiente -->
    ${c.estado === 'Enviada' && _debeContactar(c) ? `
    <div style="background:#FFF3CD;border:1px solid #F59E0B;border-radius:10px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#F59E0B" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div style="flex:1;">
        <strong style="color:#92400E;">¡Han pasado más de 24 horas!</strong>
        <div style="font-size:13px;color:#78350F;">Esta cotización fue emitida el ${c.fechaEnvio ? new Date(c.fechaEnvio).toLocaleString('es-PA') : c.fecha} y no ha recibido respuesta.</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window.mostrarContacto()">Contactar cliente</button>
    </div>` : ''}

    <!-- Panel de pago si hay abono o pago total registrado -->
    ${abonoAcum > 0 ? `
    <div style="background:var(--green-light);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:${pagadoTotal ? 'var(--success)' : 'var(--amber)'};">
          ${pagadoTotal ? 'Pagado en su totalidad' : 'Abono registrado'}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="window.abrirModalAbono()">${UI.icons.edit} Modificar abono</button>
          <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="window.eliminarAbono()">${UI.icons.trash} Eliminar abono</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;">
        <div><div style="font-size:12px;color:var(--text-gray);">Total cotización</div><div style="font-size:18px;font-weight:700;">${fmtTotal(c.total||0)}</div></div>
        <div><div style="font-size:12px;color:var(--text-gray);">${pagadoTotal ? 'Pagado' : 'Abonado'}</div><div style="font-size:18px;font-weight:700;color:var(--success);">${fmt(abonoAcum)}</div></div>
        ${pagadoTotal
          ? `<div><div style="font-size:12px;color:var(--text-gray);">Saldo</div><div style="font-size:18px;font-weight:700;color:var(--success);">$0.00</div></div>`
          : `<div><div style="font-size:12px;color:var(--text-gray);">Saldo pendiente</div><div style="font-size:18px;font-weight:700;color:var(--amber);">${fmt(saldoPend)}</div></div>`}
      </div>
    </div>` : ''}

    <div class="card" style="margin-bottom:20px;">
      <div class="info-grid">
        <div class="info-item"><label>Cliente</label><div class="info-value">${c.clienteNombre||'—'}</div></div>
        <div class="info-item"><label>Teléfono</label><div class="info-value">${c.clienteTel||'—'}</div></div>
        <div class="info-item"><label>Correo</label><div class="info-value">${c.clienteEmail||'—'}</div></div>
        <div class="info-item"><label>Dirección</label><div class="info-value">${c.clienteDir||'—'}</div></div>
        <div class="info-item"><label>Tipo de cliente</label><div class="info-value">${c.tipoCliente||'—'}</div></div>
        ${c.clienteRUC ? `<div class="info-item"><label>RUC</label><div class="info-value">${c.clienteRUC}</div></div>` : ''}
        <div class="info-item"><label>Estado</label><div class="info-value">${estadoBadge(c.estado)}</div></div>
        ${c.numeroFactura ? `<div class="info-item"><label>Factura</label><div class="info-value">${c.numeroFactura}</div></div>` : ''}
        <div class="info-item"><label>Fecha</label><div class="info-value">${c.fecha||'—'}</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title" style="margin-bottom:16px;">Detalle del trabajo</div>
      <div class="table-wrapper">
        <table class="table">
          <thead><tr><th>Producto / Servicio</th><th>Precio unit.</th><th>m²/Cant.</th><th>Total</th></tr></thead>
          <tbody>
            ${(c.lineas||[]).map(l => `<tr>
              <td>${l.producto||l.descripcion||'—'}</td>
              <td>${c.precioGlobal ? '—' : fmt(l.precio||0)}</td>
              <td>${l.m2 !== '—' && l.m2 ? l.m2 : (l.cantidad||1)}</td>
              <td style="font-weight:600;">${c.precioGlobal ? '—' : fmt(l.total||0)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${c.precioGlobal ? `<p style="color:var(--text-gray);font-size:12px;margin-top:8px;">Precio global: estos ítems se cotizaron en conjunto, sin desglosar precio por unidad.</p>` : ''}
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <div class="total-box" style="min-width:300px;">
          <div class="total-row"><span>Subtotal</span><span>${fmt(c.subtotal||0)}</span></div>
          ${c.aplicaITBMS !== false && c.itbms > 0
            ? `<div class="total-row"><span>ITBMS (7%)</span><span>${fmt(c.itbms||0)}</span></div>`
            : `<div class="total-row" style="color:var(--text-gray);font-size:12px;"><span>ITBMS</span><span>No aplica</span></div>`}
          <div class="total-row grand"><span>TOTAL</span><span>${fmtTotal(c.total||0)}</span></div>
          ${c.abono60 > 0 ? `
          <div style="border-top:2px dashed var(--border);margin:10px 0;"></div>
          <div style="font-size:11px;color:var(--text-gray);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Forma de pago</div>
          <div class="total-row" style="color:var(--green-main);">
            <span>60% Abono inicial</span>
            <span style="font-weight:700;">${fmt(c.abono60)}</span>
          </div>
          <div class="total-row" style="color:var(--amber);">
            <span>40% Saldo contra entrega</span>
            <span style="font-weight:700;">${fmt(c.saldo40||0)}</span>
          </div>` : ''}
        </div>
      </div>
    </div>

    ${c.notas ? `
      <div class="card">
        <div class="card-title">Notas y condiciones</div>
        <p style="color:var(--text-dark);font-size:13px;margin-top:8px;line-height:1.6;">${c.notas}</p>
      </div>` : ''}

    <!-- Modal: Contactar cliente -->
    <div class="modal-overlay" id="modal-contactar" style="display:none;">
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <div class="modal-title">Contactar cliente</div>
          <button class="modal-close" onclick="document.getElementById('modal-contactar').style.display='none'">${UI.icons.x}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:12px;">
          <div style="background:var(--green-light);border-radius:8px;padding:16px;">
            <div style="font-size:13px;color:var(--text-gray);">Cliente</div>
            <div style="font-size:18px;font-weight:700;">${c.clienteNombre||'—'}</div>
          </div>
          ${c.clienteTel ? `
          <div style="background:var(--green-light);border-radius:8px;padding:16px;">
            <div style="font-size:13px;color:var(--text-gray);">Teléfono</div>
            <div style="font-size:22px;font-weight:700;color:var(--green-main);">${c.clienteTel}</div>
          </div>
          <a href="tel:${c.clienteTel}" class="btn btn-primary btn-full">📞 Llamar ahora</a>
          <a href="https://wa.me/507${(c.clienteTel||'').replace(/[^0-9]/g,'')}" target="_blank" class="btn btn-whatsapp btn-full">${UI.icons.whatsapp} Escribir por WhatsApp</a>
          ` : '<p style="color:var(--text-gray);">No hay teléfono registrado para este cliente.</p>'}
          ${c.clienteEmail ? `<div style="font-size:13px;color:var(--text-gray);">Correo: ${c.clienteEmail}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Modal: Registrar abono -->
    <div class="modal-overlay" id="modal-abono" style="display:none;">
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <div class="modal-title">${abonoAcum > 0 ? 'Modificar Abono' : 'Registrar Abono'}</div>
          <button class="modal-close" onclick="document.getElementById('modal-abono').style.display='none'">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-gray);margin-bottom:16px;">Total de la cotización: <strong>${fmtTotal(c.total||0)}</strong></p>
          <div class="form-group">
            <label class="form-label">Monto del abono ($) <span class="required">*</span></label>
            <input id="monto-abono" class="form-input" type="number" min="1" step="0.01" placeholder="0.00" value="${abonoAcum||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Fecha del abono</label>
            <input id="fecha-abono" class="form-input" type="date" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="form-group">
            <label class="form-label">Método de pago</label>
            <select id="metodo-abono" class="form-select">
              <option>Efectivo</option><option>Transferencia</option><option>Cheque</option><option>ACH</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="document.getElementById('modal-abono').style.display='none'">Cancelar</button>
          <button class="btn btn-primary" onclick="window.confirmarAbono()">${abonoAcum > 0 ? 'Guardar cambios' : 'Registrar abono'}</button>
        </div>
      </div>
    </div>

    <!-- Modal: Convertir a factura -->
    <div class="modal-overlay" id="modal-factura" style="display:none;">
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <div class="modal-title">Convertir a factura</div>
          <button class="modal-close" onclick="document.getElementById('modal-factura').style.display='none'">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-gray);margin-bottom:16px;">El trabajo de la cotización <strong>#${c.numero}</strong> ya se realizó. Al confirmar, se marcará como facturada y se sincronizará con Cuentas por cobrar.</p>
          <div class="form-group">
            <label class="form-label">Número de factura <span class="required">*</span></label>
            <input id="numero-factura" class="form-input" placeholder="F-${c.numero}" value="F-${c.numero}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="document.getElementById('modal-factura').style.display='none'">Cancelar</button>
          <button class="btn btn-primary" onclick="window.confirmarFactura()">Convertir a factura</button>
        </div>
      </div>
    </div>
  `;

  function _debeContactar(cot) {
    if (!cot.fechaEnvio) return false;
    const diff = Date.now() - new Date(cot.fechaEnvio).getTime();
    return diff > 24 * 60 * 60 * 1000;
  }

  window.mostrarContacto = () => {
    document.getElementById('modal-contactar').style.display = 'flex';
  };

  window.cambiarEstado = async (nuevoEstado) => {
    if (nuevoEstado === 'Abonado' || nuevoEstado === 'Pagado') {
      // Mostrar modal para registrar el pago (el monto determina si queda Abonado o Pagado)
      document.getElementById('monto-abono').value = nuevoEstado === 'Pagado' ? (saldoPend > 0 ? saldoPend.toFixed(2) : (c.total||0).toFixed(2)) : (abonoAcum || '');
      document.getElementById('modal-abono').style.display = 'flex';
      document.getElementById('select-estado').value = c.estado; // revertir mientras
      return;
    }

    if (nuevoEstado === 'Cancelada') {
      const conf = confirm('¿Confirmar que esta cotización ya no se va a realizar? Se marcará como Cancelada.');
      if (!conf) {
        document.getElementById('select-estado').value = c.estado;
        return;
      }
    }

    c.estado = nuevoEstado;
    if (nuevoEstado === 'Enviada' && !c.fechaEnvio) {
      c.fechaEnvio = new Date().toISOString();
    }
    await DB.saveCotizacion(c);
    UI.toast(`Estado actualizado: ${nuevoEstado}`, 'success');
    Router.go('ver-cotizacion', { id: c.id });
  };

  window.abrirModalAbono = () => {
    document.getElementById('monto-abono').value  = c.montoAbono || '';
    document.getElementById('fecha-abono').value  = c.fechaAbono || new Date().toISOString().slice(0,10);
    document.getElementById('metodo-abono').value = c.metodoAbono || 'Efectivo';
    document.getElementById('modal-abono').style.display = 'flex';
  };

  window.confirmarAbono = async () => {
    const monto  = parseFloat(document.getElementById('monto-abono').value)||0;
    const fecha  = document.getElementById('fecha-abono').value;
    const metodo = document.getElementById('metodo-abono').value;
    if (monto <= 0) { UI.toast('Monto inválido', 'error'); return; }

    const montoAnterior = c.montoAbono || 0;
    c.montoAbono  = monto;
    c.estado      = monto >= (c.total||0) - 0.01 ? 'Pagado' : 'Abonado';
    c.fechaAbono  = fecha;
    c.metodoAbono = metodo;
    await DB.saveCotizacion(c);

    // Auto-actualizar cobros / estado de cuenta (solo sincroniza la diferencia contra el abono anterior)
    await _syncCobro(c, monto, fecha, metodo, montoAnterior);

    document.getElementById('modal-abono').style.display = 'none';
    UI.toast(c.estado === 'Pagado' ? `Cotización #${c.numero} pagada en su totalidad` : `Abono actualizado a ${fmt(monto)}`, 'success');
    Router.go('ver-cotizacion', { id: c.id });
  };

  window.eliminarAbono = async () => {
    if (!confirm('¿Eliminar el abono registrado de esta cotización? El estado volverá a "Aprobada" y se actualizará Cuentas por cobrar.')) return;

    const montoAnterior = c.montoAbono || 0;
    c.montoAbono  = 0;
    c.fechaAbono  = '';
    c.metodoAbono = '';
    c.estado      = 'Aprobada';
    await DB.saveCotizacion(c);

    await _syncCobro(c, 0, new Date().toISOString().slice(0,10), '', montoAnterior);

    UI.toast('Abono eliminado', 'success');
    Router.go('ver-cotizacion', { id: c.id });
  };

  window.abrirModalFactura = () => {
    document.getElementById('modal-factura').style.display = 'flex';
  };

  window.confirmarFactura = async () => {
    const numeroFactura = document.getElementById('numero-factura').value.trim();
    if (!numeroFactura) { UI.toast('Escribe el número de factura', 'error'); return; }

    c.numeroFactura  = numeroFactura;
    c.fechaFactura   = new Date().toISOString().slice(0,10);
    await DB.saveCotizacion(c);

    await _syncCobroFactura(c, numeroFactura);

    document.getElementById('modal-factura').style.display = 'none';
    UI.toast(`Cotización #${c.numero} convertida a factura ${numeroFactura}`, 'success');
    Router.go('ver-cotizacion', { id: c.id });
  };

  async function _syncCobroFactura(cot, numeroFactura) {
    const cobros = await DB.getCobros();
    let cobro = cobros.find(cb => cb.cotizacionId === cot.id);
    const pagado = cot.montoAbono || 0;
    if (!cobro) {
      cobro = await DB.saveCobro({
        cotizacionId:  cot.id,
        numero:        cot.numero,
        factura:       numeroFactura,
        clienteNombre: cot.clienteNombre,
        telefono:      cot.clienteTel || '',
        notas:         `Cotización #${cot.numero}`,
        total:        cot.total || 0,
        pagado:       pagado,
        saldo:        (cot.total || 0) - pagado,
        estado:       pagado >= (cot.total||0) - 0.01 ? 'Pagado' : (pagado > 0 ? 'Parcial' : 'Pendiente'),
        fecha:        cot.fecha,
        vencimiento:  '',
      });
    } else {
      cobro.factura = numeroFactura;
      await DB.saveCobro(cobro);
    }
  }

  async function _syncCobro(cot, monto, fecha, metodo, montoAnterior = 0) {
    const cobros = await DB.getCobros();
    let cobro = cobros.find(cb => cb.cotizacionId === cot.id);
    if (!cobro) {
      cobro = await DB.saveCobro({
        cotizacionId:  cot.id,
        numero:        cot.numero,
        clienteNombre: cot.clienteNombre,
        telefono:      cot.clienteTel || '',
        notas:         `Cotización #${cot.numero}`,
        total:        cot.total || 0,
        pagado:       0,
        saldo:        cot.total || 0,
        estado:       'Pendiente',
        fecha:        cot.fecha,
        vencimiento:  '',
      });
    }
    // Solo se sincroniza la diferencia contra el abono anterior, para no duplicar
    // el pago al modificar o eliminar un abono ya registrado.
    const delta = monto - montoAnterior;
    if (Math.abs(delta) > 0.005) {
      const notas = delta > 0 ? `Abono cotización #${cot.numero}` : `Ajuste/eliminación de abono, cotización #${cot.numero}`;
      await DB.registrarPago(cobro.id, delta, fecha, metodo || 'Ajuste', notas);
    }
  }

  window._eliminarVista = async (id) => {
    if (!confirm('¿Seguro que quieres eliminar esta cotización? Esta acción no se puede deshacer.')) return;
    await DB.deleteCotizacion(id);
    UI.toast('Cotización eliminada', 'success');
    Router.go('cotizaciones');
  };
});

/* helpers locales */
function _debeContactar(cot) {
  if (!cot.fechaEnvio) return false;
  const diff = Date.now() - new Date(cot.fechaEnvio).getTime();
  return diff > 24 * 60 * 60 * 1000;
}

/* ── GENERAR PDF ─────────────────────────────────────────── */

// Carga una imagen local como base64 vía <img>+canvas en vez de fetch():
// fetch()/XHR a rutas relativas fallan bajo file:// (CORS), pero <img> sí carga.
function _loadImagenBase64(ruta) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = ruta;
  });
}

async function _loadLogoBase64() {
  // Preferir el base64 embebido (funciona bajo file:// y en servidor); si no
  // está disponible, se intenta cargar el archivo como respaldo.
  if (window.PDF_ASSETS?.logo) return window.PDF_ASSETS.logo;
  return _loadImagenBase64('assets/logo.png');
}

async function generarPDFCotizacion(id, fromForm = false) {
  let c;
  if (fromForm) {
    const t = window._totalesActuales || {};
    c = {
      numero:        document.querySelector('.page-title')?.textContent.match(/#(\d+)/)?.[1] || '—',
      clienteNombre: document.getElementById('clienteNombre')?.value,
      clienteTel:    document.getElementById('clienteTel')?.value,
      clienteEmail:  document.getElementById('clienteEmail')?.value,
      clienteDir:    document.getElementById('clienteDir')?.value,
      fecha:         document.getElementById('fecha')?.value,
      notas:         document.getElementById('notas')?.value || '',
      subtotal:  t.sub   || 0,
      itbms:     t.imp   || 0,
      total:     t.total || 0,
      abono60:   t.abono60 || 0,
      saldo40:   t.saldo40 || 0,
      aplicaITBMS: t.aplicaITBMS !== false,
      tipoCotizacion: window._tipoCotizPDF || 'Estandar',
      configCols: window._configColsPDF || {foto:true, ancho:true, alto:true, unidad:true, m2:true, cantidad:true},
      lineas: window._lineasPDF || [],
      estado: window._estadoPDF || 'Enviada',
      montoAbono: window._montoAbonoPDF || 0,
      esFactura: window._esFacturaPDF || false,
      numeroFactura: document.getElementById('numeroFactura')?.value || '',
    };
  } else {
    c = await DB.getCotizacion(id);
    if (!c) { UI.toast('Cotización no encontrada', 'error'); return; }
  }

  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    UI.toast('Librería PDF no cargada. Verifica tu conexión a internet.', 'error'); return;
  }

  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W    = 215.9;   // ancho letter
  const H    = 279.4;   // alto letter
  const ML   = 15;      // margen izquierdo
  const MR   = W - 20;  // margen derecho incrementado para evitar cortes

  /* ── PRECARGA DE IMÁGENES Y LOGO ── */
  const logoBase64 = await _loadLogoBase64();

  // Proporción real del logo (evita deformarlo al dibujarlo en el header y la marca de agua)
  let logoRatio = 2; // fallback ancho:alto
  if (logoBase64) {
    try {
      const props = doc.getImageProperties(logoBase64);
      if (props?.width && props?.height) logoRatio = props.width / props.height;
    } catch (e) {}
  }

  const estadoPDF = c.estado || 'Enviada';
  const esFacturaPDF = !!(c.esFactura || c.numeroFactura);
  const montoAbonoPDF = c.montoAbono || 0;
  const saldoPendientePDF = Math.max((c.total || 0) - montoAbonoPDF, 0);

  const pagosBase64 = window.PDF_ASSETS?.metodosPago || await _loadImagenBase64('assets/metodos_pago.png');

  for (const l of c.lineas || []) {
    if (l.foto && !l.fotoBase64) {
      if (l.foto.startsWith('data:image')) {
         l.fotoBase64 = l.foto;
      } else {
         l.fotoBase64 = await _loadImagenBase64(l.foto);
      }
    }
  }

  // Formato de moneda igual al de las cotizaciones históricas (Balboa)
  function fmtPDF(n) {
    return 'B/.' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // El TOTAL va redondeado y sin centavos (igual que en pantalla); el resto de filas
  // (subtotal, ITBMS, abonado, saldo) mantiene los decimales normales.
  function fmtTotalPDF(n) {
    return 'B/.' + Math.round(n||0).toLocaleString('en-US');
  }

  // Colores principales — mismo verde de marca en todo el documento
  const greenHeader = [31, 122, 60]; // #1F7A3C verde principal Crystal Services
  const tealTitle   = [31, 122, 60];
  
  // Banner superior
  doc.setFillColor(...greenHeader);
  doc.rect(0, 0, W, 4, 'F');
  
  // Logo superior derecha (proporción real, sin deformar)
  if (logoBase64) {
    const logoH = 15;
    const logoW = logoH * logoRatio;
    doc.addImage(logoBase64, 'PNG', MR - logoW, 10, logoW, logoH);
  }

  // Tabla de número/fecha superior derecha (caja completa, igual a las cotizaciones históricas)
  const fechaY = 36;
  const fParsed = c.fecha ? new Date(c.fecha+'T12:00:00') : new Date();
  const fDisp = `${String(fParsed.getDate()).padStart(2,'0')}/${String(fParsed.getMonth()+1).padStart(2,'0')}/${fParsed.getFullYear()}`;

  doc.autoTable({
    startY: fechaY - 6,
    body: [[esFacturaPDF ? 'Factura No.' : 'Cotización No.', (esFacturaPDF ? c.numeroFactura : c.numero) || '0000'], ['Fecha', fDisp]],
    theme: 'grid',
    tableWidth: 40,
    margin: { left: MR - 40 },
    styles: { fontSize: 10, cellPadding: 2, halign: 'center', valign: 'middle', lineColor: [0,0,0], lineWidth: 0.2, textColor: 0 },
    columnStyles: { 0: { cellWidth: 18, halign: 'left' }, 1: { cellWidth: 22 } },
    didParseCell: function(data) {
      if (data.row.index === 0 && data.column.index === 0) {
        data.cell.styles.fontSize = 6.5;
      }
      if (data.row.index === 0 && data.column.index === 1) {
        data.cell.styles.textColor = [255, 0, 0];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // Título Izquierda — refleja el estado real de la cotización/factura
  const tituloBase = esFacturaPDF ? 'FACTURA' : 'COTIZACION';
  const tituloPDF = estadoPDF === 'Pagado' ? 'PAGADO' : estadoPDF === 'Cancelada' ? 'CANCELADA' : (estadoPDF === 'Abonado' ? 'ABONADO' : tituloBase);
  const colorTitulo = estadoPDF === 'Pagado' ? [34, 197, 94] : estadoPDF === 'Cancelada' ? [239, 68, 68] : (estadoPDF === 'Abonado' ? [245, 158, 11] : tealTitle);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...colorTitulo);
  doc.text(tituloPDF, ML, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('RUC: 8-NT-2-750634 DV 8', ML, 27);
  doc.text('San Miguelito las 500 #4142 planta baja', ML, 31.5);
  doc.text('Ciudad de Panamá, Panamá', ML, 36);
  doc.text('Teléfonos: +507 6362-1210 / +507 6456-2658', ML, 40.5);

  // Datos Cliente
  let cy = 55;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(50, 80, 140); // Azul oscuro
  doc.text('PREPARADO PARA:', ML, cy);
  cy += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Cliente: ', ML, cy);
  doc.setFont('helvetica', 'bold');
  doc.text(c.clienteNombre || '—', ML + 18, cy);
  cy += 4.5;
  
  doc.setFont('helvetica', 'normal');
  doc.text('Dirección: ', ML, cy);
  doc.setFont('helvetica', 'bold');
  if (c.clienteDir) {
    const dirLines = doc.splitTextToSize(c.clienteDir, 120);
    doc.text(dirLines, ML + 18, cy);
    cy += (dirLines.length * 4.5);
  } else {
    doc.text('—', ML + 18, cy);
    cy += 4.5;
  }
  
  doc.setFont('helvetica', 'normal');
  doc.text('Teléfono: ', ML, cy);
  doc.setFont('helvetica', 'bold');
  doc.text(c.clienteTel || '—', ML + 18, cy);

  cy += 10;

  // TABLA PRINCIPAL — a cada columna angosta (ancho/alto/unidad/cant/total) se le
  // fija un ancho chico para que DESCRIPCIÓN se quede con la mayor parte del
  // espacio: así el texto envuelve en menos líneas y la tabla ocupa menos alto,
  // dejando lugar para que condiciones/métodos de pago quepan en la misma hoja.
  const config = c.configCols || {};
  // La columna de foto sólo se dibuja si de verdad hay al menos una foto adjunta
  // en alguna línea — si no, ni siquiera se agrega la columna, y ese espacio se
  // lo queda DESCRIPCIÓN (la mayoría de las cotizaciones no llevan fotos).
  const hayFotos = (c.lineas||[]).some(l => l.fotoBase64);
  const mostrarFoto = !!(config.foto && hayFotos);
  const colNames = ['ITEM'];
  const colWidths = { 0: 10 };
  let colIdx = 1;
  if (mostrarFoto) { colNames.push('FOTO/REF'); colWidths[colIdx++] = 20; }
  const descIdx = colIdx;
  colNames.push('DESCRIPCIÓN'); colIdx++; // sin cellWidth: absorbe el espacio restante
  if (config.ancho)   { colNames.push('ANCHO (m)');  colWidths[colIdx++] = 11; }
  if (config.alto)    { colNames.push('ALTO (m)');   colWidths[colIdx++] = 11; }
  if (config.unidad)  { colNames.push('UNIDAD'); colWidths[colIdx++] = 10; }
  // Se omiten intencionalmente m2 y precio unitario en el PDF: son cálculo
  // interno de la empresa para cotizar, no algo que deba ver el cliente.
  if (config.cantidad){ colNames.push('CANT.');  colWidths[colIdx++] = 9; }
  colNames.push('TOTAL'); colWidths[colIdx++] = 18;

  const rows = (c.lineas||[]).map((l, idx) => {
    const row = [];
    row.push(idx + 1);
    if (mostrarFoto) row.push({ content: '', styles: l.fotoBase64 ? { minCellHeight: 22 } : {} });
    row.push(l.producto || l.descripcion || '—');
    // Sin el sufijo " m": en columnas angostas el texto envolvía y la "m" quedaba
    // en su propia línea, encimada con el número. El encabezado ya indica "(m)".
    if (config.ancho) row.push(l.ancho ? String(l.ancho) : '—');
    if (config.alto) row.push(l.alto ? String(l.alto) : '—');
    if (config.unidad) row.push(l.unidad || '—');
    // No incluir la celda de m2 ni precio unitario en las filas
    if (config.cantidad) row.push(l.cantidad || 1);
    row.push(c.precioGlobal ? '—' : fmtPDF(l.total || 0));
    return row;
  });

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: cy,
      head:   [colNames],
      body:   rows,
      theme:  'grid',
      headStyles: {
        fillColor:  greenHeader,
        textColor:  255,
        fontStyle:  'bold',
        fontSize:   7,
        cellPadding: 2,
        halign: 'center'
      },
      bodyStyles: {
        fontSize:    7.5,
        textColor:   0,
        cellPadding: 1.2,
        valign: 'middle',
        halign: 'center',
        lineHeightFactor: 1.08,
      },
      columnStyles: {
        ...Object.fromEntries(Object.entries(colWidths).map(([i, w]) => [i, { cellWidth: w }])),
        0: { cellWidth: colWidths[0], fontSize: 6, cellPadding: 1 }, // ITEM
        [descIdx]: { halign: 'left' }, // DESCRIPCION izq, sin cellWidth (absorbe lo que sobra)
      },
      margin: { left: ML, right: 20 },
      styles: {
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
      },
      didDrawCell: function(data) {
        if (data.section === 'body' && mostrarFoto && data.column.index === 1) {
          const linea = (c.lineas||[])[data.row.index];
          if (linea && linea.fotoBase64) {
            doc.addImage(linea.fotoBase64, 'JPEG', data.cell.x + 2, data.cell.y + 2, 18, 18);
          }
        }
      }
    });
  }

  let finalY = doc.lastAutoTable?.finalY || 160;

  // Notas adicionales — opcionales, específicas de este cliente/cotización.
  // Van debajo de la tabla de items, a la izquierda (no reemplazan las Condiciones fijas).
  if (c.notas && c.notas.trim()) {
    const notasWrapWidth = 95;
    const lineasNotas = doc.splitTextToSize(`NOTA: ${c.notas.trim()}`, notasWrapWidth);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38);
    let ny = finalY + 6;
    for (const l of lineasNotas) {
      doc.text(l, ML, ny);
      ny += 3.8;
    }
    finalY = ny + 2;
  }

  // Totales — tabla con bordes parejos, igual a las cotizaciones históricas
  const tipoCotiz = c.tipoCotizacion || 'Estandar';
  const abonoPct  = tipoCotiz === 'Smart Glass' ? '80' : '60';
  const saldoPct  = tipoCotiz === 'Smart Glass' ? '20' : '40';

  const totalRows = [['SUBTOTAL', fmtPDF(c.subtotal||0)]];
  if (c.aplicaITBMS !== false && c.itbms > 0) {
    totalRows.push(['ITBMS (7%)', fmtPDF(c.itbms||0)]);
  }
  totalRows.push(['TRANSPORTE', '—']);
  totalRows.push(['TOTAL', fmtTotalPDF(c.total||0)]);

  if (estadoPDF === 'Pagado') {
    // Pagado en su totalidad — no queda saldo
    totalRows.push(['ABONADO', fmtPDF(montoAbonoPDF || c.total || 0)]);
    totalRows.push(['SALDO PENDIENTE', fmtPDF(0)]);
  } else if (estadoPDF === 'Abonado' && montoAbonoPDF > 0) {
    // Muestra el abono real registrado y lo que falta por cobrar
    totalRows.push(['ABONADO', fmtPDF(montoAbonoPDF)]);
    totalRows.push(['SALDO PENDIENTE', fmtPDF(saldoPendientePDF)]);
  } else if (c.abono60 > 0 || c.saldo40 > 0) {
    totalRows.push([`ABONO (${abonoPct}%)`, fmtPDF(c.abono60||0)]);
    totalRows.push([`RESTANTE (${saldoPct}%)`, fmtPDF(c.saldo40||0)]);
  }

  doc.autoTable({
    startY: finalY + 4,
    body: totalRows,
    theme: 'grid',
    tableWidth: 80,
    margin: { left: MR - 80, right: 20 },
    styles: { fontSize: 8.5, cellPadding: 1.7, lineColor: [0,0,0], lineWidth: 0.2, textColor: 0 },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'right', cellWidth: 40 },
      1: { halign: 'right', cellWidth: 35 },
    },
    didParseCell: function(data) {
      const label = data.row.raw[0];
      if (label === 'TOTAL') {
        data.cell.styles.textColor = greenHeader;
        data.cell.styles.fontStyle = 'bold';
      } else if (label === 'ABONADO' || (typeof label === 'string' && label.startsWith('ABONO'))) {
        data.cell.styles.textColor = greenHeader;
        data.cell.styles.fontStyle = 'bold';
      } else if (label === 'SALDO PENDIENTE') {
        // Resalta la casilla: ámbar si aún debe, verde si ya quedó en $0.00
        const pendiente = saldoPendientePDF > 0.01 && estadoPDF !== 'Pagado';
        data.cell.styles.fillColor = pendiente ? [245, 158, 11] : [34, 197, 94];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      } else if (typeof label === 'string' && label.startsWith('RESTANTE')) {
        // Antes de que el cliente abone, 60% y 40% van en el mismo verde —
        // recién cuando abona se resalta en ámbar cuánto le falta (fila ABONADO/SALDO PENDIENTE de arriba).
        data.cell.styles.textColor = greenHeader;
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  let ty = doc.lastAutoTable.finalY;

  // Caja de Condiciones (Bottom Left) — texto fijo según tipo de cotización,
  // NO se reemplaza por las notas adicionales (esas van aparte, arriba).
  // Ancho de envoltura de texto: deja espacio a la derecha para la sección de métodos de pago
  const condWrapWidth = 108;
  const condicionesPorTipo = {
    'Estandar': [
      '* Realizar abono del 60% para iniciar y el restante 40% al finalizar.',
      '* Una vez se apruebe la cotización se fija fecha de entrega en días hábiles (lunes a viernes).',
      '* Somos mano de obra garantizada.',
      '* No nos hacemos responsables por algún daño de tuberías no reportadas o permisos que se necesiten para llevar a cabo dicho proyecto.',
      '* Cotización válida 15 días hábiles desde la fecha.'
    ],
    'Smart Fit': [
      '* El pago debe realizarse al 100% para iniciar la producción.',
      '* Incluye toma de medidas e instalación.',
      '* Tiempo de entrega: 3 a 5 días hábiles.',
      '* Somos mano de obra garantizada.'
    ],
    'Smart Glass': [
      '* Realizar abono del 80% para iniciar y el restante 20% contra entrega.',
      '* Incluye instalación del sistema inteligente.',
      '* Tiempo de entrega: 15 a 20 días hábiles.',
      '* Somos mano de obra garantizada.'
    ],
  };
  const defaultCond = condicionesPorTipo[tipoCotiz] || condicionesPorTipo['Estandar'];

  const lineasCondiciones = defaultCond.flatMap(l => doc.splitTextToSize(l, condWrapWidth));

  // Alto "normal" de la caja (espaciado cómodo) según el contenido real.
  const contactLineas = 4; // Crystal Service / teléfono / email / sitio web
  const tituloGap = 5, condGap = 9, condLineH = 3.5, contactGap = 4, contactLineH = 4, boxPad = 4;
  const fullBoxHeight = Math.max(40, condGap + (lineasCondiciones.length * condLineH) + contactGap + (contactLineas * contactLineH) + boxPad);
  const marginInferior = 15;

  // El piso de 210 es solo estético (evita que el cuadro quede flotando muy
  // arriba en cotizaciones cortas). Si con espaciado normal no cabe en lo que
  // queda de hoja, se comprime el espaciado (letra un poco más chica, líneas
  // más juntas) para que TODO entre en una sola página — recién si ni
  // comprimido cabe (la tabla de ítems ya ocupa casi toda la hoja) se pasa a
  // una página nueva.
  let by = Math.max(ty + 10, 210);
  let boxHeight = fullBoxHeight;
  let scale = 1;
  if (by + boxHeight > H - marginInferior) {
    const disponible = (H - marginInferior) - Math.max(ty + 10, 25);
    scale = Math.max(0.6, Math.min(1, disponible / fullBoxHeight));
    boxHeight = fullBoxHeight * scale;
    by = Math.max(ty + 10, (H - marginInferior) - boxHeight);
  }
  if (by + boxHeight > H - marginInferior + 0.5) {
    doc.addPage();
    by = 20;
    boxHeight = fullBoxHeight;
    scale = 1;
  }

  // Dibuja el marco general de info inferior
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(ML, by, W - ML - 15, boxHeight);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(6.5, 8 * scale));
  doc.text('Condiciones:', ML + 2, by + tituloGap * scale);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(Math.max(5.5, 7 * scale));
  let cy_cond = by + condGap * scale;
  for (const l of lineasCondiciones) {
    doc.text(l, ML + 2, cy_cond);
    cy_cond += condLineH * scale;
  }

  // Info Contacto
  cy_cond += contactGap * scale;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(7, 9 * scale));
  doc.text('Crystal Service', ML + 2, cy_cond);
  cy_cond += contactLineH * scale;
  doc.text('6456-2658', ML + 2, cy_cond);
  cy_cond += contactLineH * scale;
  doc.setFont('helvetica', 'normal');
  doc.text('email: crystalservicejj@gmail.com', ML + 2, cy_cond);
  cy_cond += contactLineH * scale;
  doc.setTextColor(...greenHeader);
  doc.setFont('helvetica', 'bold');
  doc.text('https://www.crystalservicejj.com', ML + 2, cy_cond);

  // Métodos de Pago ACH a la derecha (si hay imagen provista)
  if (pagosBase64) {
    // Si el usuario carga el metodos_pago.png
    doc.addImage(pagosBase64, 'PNG', W - 80, by + 2 * scale, 60, 36 * scale);
  } else {
    // Texto fallback si no hay imagen
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(5.5, 7 * scale));
    doc.text('Para confección de cheque o ACH:', W - 70, by + 5 * scale);
    doc.text('CRYSTAL SERVICE', W - 70, by + 9 * scale);
    doc.setFont('helvetica', 'normal');
    doc.text('Banistmo 4150101799', W - 70, by + 13 * scale);
    doc.text('Banco General 04-07-00-000738-5', W - 70, by + 17 * scale);
    doc.text('YAPPY: 63621132 / 63621210', W - 70, by + 21 * scale);
    doc.setTextColor(...greenHeader);
    doc.setFont('helvetica', 'bold');
    doc.text('GRACIAS POR SU CONFIANZA', W - 60, by + boxHeight - 2);
  }

  /* ── MARCA DE AGUA ──
     Se dibuja en TODAS las páginas del documento (cuando la cotización es
     larga y la caja de condiciones saltó a una página nueva, esa página
     también debe llevar su marca de agua, no solo la primera). */
  if (typeof doc.GState === 'function') {
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let pag = 1; pag <= totalPaginas; pag++) {
      doc.setPage(pag);
      if (estadoPDF === 'Pagado') {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.12 }));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(64);
        doc.setTextColor(34, 197, 94);
        doc.text('PAGADO', W/2, H/2, { align: 'center', angle: 35 });
        doc.restoreGraphicsState();
      } else if (estadoPDF === 'Cancelada') {
        // Cotización que ya no se realizará
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.12 }));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(64);
        doc.setTextColor(239, 68, 68);
        doc.text('CANCELADA', W/2, H/2, { align: 'center', angle: 35 });
        doc.restoreGraphicsState();
      } else if (logoBase64) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.05 }));
        const wmW = 150;
        const wmH = wmW / logoRatio;
        doc.addImage(logoBase64, 'PNG', W/2 - wmW/2, H/2 - wmH/2, wmW, wmH);
        doc.restoreGraphicsState();
      }
    }
    doc.setPage(totalPaginas);
  }

  doc.save(`Cotizacion_${c.numero}_${(c.clienteNombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
  UI.toast('PDF generado exitosamente', 'success');
}

window.generarPDFCotizacion = generarPDFCotizacion;

/* ── WHATSAPP ─────────────────────────────────────────── */

async function enviarWhatsApp(id) {
  const c = await DB.getCotizacion(id);
  if (!c) { UI.toast('Cotización no encontrada','error'); return; }
  const tel = (c.clienteTel||'').replace(/[^0-9]/g,'');
  const msg = encodeURIComponent(
    `Hola ${c.clienteNombre}, le saluda Crystal Services Panamá.\n\n` +
    `Le enviamos la cotización #${c.numero} por un monto de ${fmtTotal(c.total)}.\n\n` +
    `Quedamos atentos a sus comentarios.\n\n` +
    `Crystal Services — Tel: 6456-2658`
  );
  window.open(`https://wa.me/507${tel}?text=${msg}`, '_blank');
  if (!c.fechaEnvio) {
    c.fechaEnvio = new Date().toISOString();
    if (c.estado === 'Borrador' || !c.estado) c.estado = 'Enviada';
    await DB.saveCotizacion(c);
  }
}

window.enviarWhatsApp = enviarWhatsApp;
