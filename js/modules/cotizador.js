/* =========================================================
   Crystal OS — modules/cotizador.js
   Lista de cotizaciones + Nueva cotización + Ver/Editar
   ========================================================= */

/* ── LISTA DE COTIZACIONES ─────────────────────────────── */

Router.register('cotizaciones', async (view) => {
  let cotizaciones = await DB.getCotizaciones();
  let filtroEstado = 'Todos';
  let busqueda     = '';

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

    const table = document.getElementById('cotiz-table-body');
    if (!table) return;
    table.innerHTML = lista.length === 0
      ? `<tr><td colspan="7" class="table-empty">No hay cotizaciones${busqueda ? ` con "${busqueda}"` : ''}</td></tr>`
      : lista.map(c => {
          const abonoInfo = (c.estado === 'Abonado' && c.montoAbono)
            ? `<div style="font-size:11px;color:var(--text-gray);">Abono: ${fmt(c.montoAbono)}</div>`
            : (c.estado === 'Pagado' && c.montoAbono)
            ? `<div style="font-size:11px;color:var(--text-gray);">Cancelado: ${fmt(c.montoAbono)}</div>` : '';
          return `
          <tr onclick="Router.go('ver-cotizacion',{id:'${c.id}'})" style="cursor:pointer;">
            <td><strong>#${c.numero}</strong></td>
            <td>${c.clienteNombre||'—'}<br><span style="color:var(--text-gray);font-size:11px;">${c.clienteTel||''}</span></td>
            <td>
              <strong>${fmt(c.total||0)}</strong>
              ${c.abono60 > 0 ? `<div style="font-size:11px;color:var(--green-mid);">60%: ${fmt(c.abono60)}</div>` : ''}
            </td>
            <td>${estadoBadge(c.estado)}${abonoInfo}</td>
            <td>${c.vendedor||'—'}</td>
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
  }

  const estados = ['Todos','Borrador','Pendiente','En negociación','Aprobada','Abonado','Pagado','Completado','Factura','Cancelado','Perdida'];

  view.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Cotizaciones</div>
        <div class="page-subtitle">${cotizaciones.length} cotizaciones registradas</div>
      </div>
      <div class="page-actions">
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
      </div>
      <div class="table-wrapper">
        <table class="table">
          <thead><tr>
            <th>#</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Vendedor</th><th>Fecha</th><th>Acciones</th>
          </tr></thead>
          <tbody id="cotiz-table-body"></tbody>
        </table>
      </div>
    </div>
  `;

  render();

  view.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroEstado = btn.dataset.estado;
      view.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b.dataset.estado === filtroEstado));
      render();
    });
  });

  document.getElementById('cotiz-search').addEventListener('input', e => {
    busqueda = e.target.value;
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

  // linea: { tipo: 'producto'|'manual', producto, descripcion, ancho, alto, m2, precio, total, unidad, cantidad, foto }
  let lineas = editando?.lineas || [{ tipo:'producto', producto:'', descripcion:'', ancho:'', alto:'', m2:'', precio:'', total:'', cantidad:1, foto:'' }];

  function calcLinea(l) {
    const ancho = parseFloat(l.ancho) || 0;
    const alto  = parseFloat(l.alto)  || 0;
    const precio= parseFloat(l.precio)|| 0;
    const cant  = parseFloat(l.cantidad) || 1;
    const esM2  = l.unidad !== 'unidad' && l.unidad !== 'global';
    l.m2    = esM2 ? (ancho * alto).toFixed(2) : '—';
    l.total = esM2 ? (ancho * alto * precio * cant) : (precio * cant);
    return l;
  }

  function totalSubtotal() {
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
      ${configCols.cantidad ? '<th>Cant.</th>' : ''}
      <th>Precio</th><th>Total</th><th></th>
    </tr>`;
  }

  function renderLineas() {
    const tbody = document.getElementById('lineas-tbody');
    if (!tbody) return;
    tbody.innerHTML = lineas.map((l, i) => {
      const esManual = l.tipo === 'manual';
      const prod = !esManual ? productos.find(p => p.nombre === l.producto) : null;
      const esM2 = esManual ? (l.unidad !== 'unidad' && l.unidad !== 'global') : (prod?.unidad !== 'unidad' && prod?.unidad !== 'global');

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
                ? `<input type="text" value="${l.descripcion||''}" placeholder="Descripción del servicio…" style="min-width:180px;" onchange="window._lineaChange(${i},'descripcion',this.value)">`
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
                 <option value="global" ${l.unidad==='global'?'selected':''}>Global</option>
                 <option value="m²" ${!l.unidad||l.unidad==='m²'?'selected':''}>m²</option>
               </select>
             </td>` : ''}
          ${configCols.m2 ? `<td>${esM2 ? `<div class="auto-field">${l.m2||'—'}</div>` : '—'}</td>` : ''}
          ${configCols.cantidad ? `<td><input type="number" min="1" value="${l.cantidad||1}" onchange="window._lineaChange(${i},'cantidad',this.value)" style="max-width:60px;"></td>` : ''}
          <td><input type="number" min="0" step="0.01" value="${l.precio||0}" onchange="window._lineaChange(${i},'precio',this.value)" style="max-width:90px;"></td>
          <td><div class="auto-field">${l.total ? fmt(l.total) : '—'}</div></td>
          <td>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window._removeLinea(${i})">${UI.icons.trash}</button>
          </td>
        </tr>`;
    }).join('');
    renderHeaderLineas();
    refreshTotals();
  }

  function refreshTotals() {
    const sub      = totalSubtotal();
    const aplicaITBMS = document.getElementById('chk-itbms')?.checked !== false;
    const imp      = aplicaITBMS ? (sub * itbms) : 0;
    const total    = sub + imp;
    
    let abono60 = 0, saldo40 = total;
    if (tipoCotizacion === 'Estandar') { abono60 = total * 0.6; saldo40 = total * 0.4; }
    else if (tipoCotizacion === 'Smart Glass') { abono60 = total * 0.8; saldo40 = total * 0.2; }
    else if (tipoCotizacion === 'Smart Fit') { abono60 = 0; saldo40 = total; }

    const el = id => document.getElementById(id);
    if (el('sub-val'))    el('sub-val').textContent    = fmt(sub);
    if (el('itbms-row'))  el('itbms-row').style.display = aplicaITBMS ? '' : 'none';
    if (el('itbms-val'))  el('itbms-val').textContent  = fmt(imp);
    if (el('total-val'))  el('total-val').textContent  = fmt(total);
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

  window._toggleTipo = (i) => {
    lineas[i].tipo = lineas[i].tipo === 'manual' ? 'producto' : 'manual';
    lineas[i].descripcion = '';
    lineas[i].producto = '';
    lineas[i].precio = '';
    lineas[i].ancho = '';
    lineas[i].alto = '';
    lineas[i].m2 = '';
    lineas[i].total = '';
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

  async function guardar(estado) {
    const totales = window._totalesActuales || { sub: totalSubtotal(), imp: 0, total: totalSubtotal(), abono60: 0, saldo40: 0 };

    const lineasFiltradas = lineas.filter(l =>
      l.tipo === 'manual' ? l.descripcion : l.producto
    ).map(l => ({
      ...l,
      producto: l.tipo === 'manual' ? (l.descripcion || '—') : l.producto,
    }));

    const data = {
      id:            editando?.id || undefined,
      numero,
      fecha:         document.getElementById('fecha').value,
      clienteNombre: document.getElementById('clienteNombre').value,
      clienteTel:    document.getElementById('clienteTel').value,
      clienteEmail:  document.getElementById('clienteEmail').value,
      clienteDir:    document.getElementById('clienteDir').value,
      tipoCliente:   document.getElementById('tipoCliente').value,
      vendedor:      document.getElementById('vendedor').value,
      notas:         document.getElementById('notas').value,
      lineas:        lineasFiltradas,
      subtotal:      totales.sub,
      itbms:         totales.imp,
      total:         totales.total,
      saldo40:       totales.saldo40,
      aplicaITBMS:   totales.aplicaITBMS,
      tipoCotizacion,
      configCols,
      estado,
    };
    if (!data.clienteNombre) { UI.toast('El nombre del cliente es requerido', 'error'); return; }
    await DB.saveCotizacion(data);
    UI.toast(estado === 'Borrador' ? 'Borrador guardado' : 'Cotización #' + numero + ' guardada', 'success');
    Router.go('cotizaciones');
  }

  const today = new Date().toISOString().slice(0,10);

  view.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${editando ? 'Editar' : 'Nueva'} Cotización #${numero}</div>
        <div class="page-subtitle">${today}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" onclick="window.guardar('Borrador')">Guardar borrador</button>
        <button class="btn btn-secondary" onclick="generarPDFCotizacion(null, true)" id="btn-pdf">${UI.icons.pdf} Generar PDF</button>
        <button class="btn btn-primary" onclick="window.guardar('Pendiente')">${UI.icons.check} Guardar y emitir</button>
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
          <select id="tipoCliente" class="form-select">
            <option ${editando?.tipoCliente==='Residencial'?'selected':''}>Residencial</option>
            <option ${editando?.tipoCliente==='Comercial'?'selected':''}>Comercial</option>
            <option ${editando?.tipoCliente==='Corporativo'?'selected':''}>Corporativo</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Vendedor asignado</label>
          <input id="vendedor" class="form-input" placeholder="Nombre del vendedor" value="${editando?.vendedor||Auth.current()?.nombre||''}">
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
              <input type="checkbox" id="chk-itbms" checked onchange="refreshTotals()"> ITBMS (7%)
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
          <label class="form-label">Notas adicionales</label>
          <textarea id="notas" class="form-textarea" placeholder="Condiciones, tiempos de entrega, validez de la cotización…">${editando?.notas||''}</textarea>
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
          <div style="display:flex;gap:12px;margin-bottom:16px;">
            <input type="text" id="media-search" class="form-input" placeholder="Buscar por nombre o etiqueta..." onkeyup="window._filterMedia(this.value)" style="flex:1;">
            <button class="btn btn-outline" onclick="window._selectFoto('')">Quitar foto de ítem</button>
          </div>
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

  window._asistentePrecio = (precio, ancho, alto, desc) => {
    // Auto-llenar la primera línea vacía del formulario
    if (lineas.length === 0) {
      lineas.push({ tipo:'manual', descripcion:'', ancho:'', alto:'', m2:'', precio:'', total:'', unidad:'m²' });
    }
    const idx = lineas.length - 1;
    if (precio > 0) lineas[idx].precio = precio;
    if (ancho > 0)  lineas[idx].ancho = ancho;
    if (alto > 0)   lineas[idx].alto  = alto;
    if (desc)       { lineas[idx].descripcion = desc; lineas[idx].tipo = 'manual'; }
    if (ancho > 0 && alto > 0) {
      lineas[idx].unidad = 'm²';
      lineas[idx] = calcLinea(lineas[idx]);
    }
    renderLineas();
    UI.toast('Precio y medidas aplicados a la cotización', 'success');
    // Scroll hacia el formulario
    document.getElementById('cotiz-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

  const estados = ['Borrador','Pendiente','En negociación','Aprobada','Abonado','Pagado','Completado','Factura','Cancelado','Perdida'];

  // Calcular cuánto se ha abonado acumulado
  const abonoAcum = c.montoAbono || 0;
  const saldoPend = (c.total||0) - abonoAcum;
  const pagadoTotal = abonoAcum > 0 && saldoPend <= 0.01;
  const puedeFacturar = ['Aprobada','Abonado','Pagado','Completado'].includes(c.estado);

  view.innerHTML = `
    <div class="page-header">
      <div>
        <button class="btn btn-ghost" onclick="Router.go('cotizaciones')">${UI.icons.arrowLeft} Volver</button>
        <div class="page-title" style="margin-top:8px;">Cotización #${c.numero}</div>
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
    ${c.estado === 'Pendiente' && _debeContactar(c) ? `
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
      <div style="font-size:13px;font-weight:700;color:${pagadoTotal ? 'var(--success)' : 'var(--amber)'};margin-bottom:12px;">
        ${pagadoTotal ? 'Pagado en su totalidad' : 'Abono registrado'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
        <div><div style="font-size:12px;color:var(--text-gray);">Total cotización</div><div style="font-size:18px;font-weight:700;">${fmt(c.total||0)}</div></div>
        <div><div style="font-size:12px;color:var(--text-gray);">${pagadoTotal ? 'Cancelado' : 'Abonado'}</div><div style="font-size:18px;font-weight:700;color:var(--success);">${fmt(abonoAcum)}</div></div>
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
        <div class="info-item"><label>Vendedor</label><div class="info-value">${c.vendedor||'—'}</div></div>
        <div class="info-item"><label>Estado</label><div class="info-value">${estadoBadge(c.estado)}</div></div>
        <div class="info-item"><label>Fecha</label><div class="info-value">${c.fecha||'—'}</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title" style="margin-bottom:16px;">Detalle del trabajo</div>
      <div class="table-wrapper">
        <table class="table">
          <thead><tr><th>Producto / Servicio</th><th>m²/Cant.</th><th>Precio unit.</th><th>Total</th></tr></thead>
          <tbody>
            ${(c.lineas||[]).map(l => `<tr>
              <td>${l.producto||l.descripcion||'—'}</td>
              <td>${l.m2 !== '—' && l.m2 ? l.m2 : (l.cantidad||1)}</td>
              <td>${fmt(l.precio||0)}</td>
              <td style="font-weight:600;">${fmt(l.total||0)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <div class="total-box" style="min-width:300px;">
          <div class="total-row"><span>Subtotal</span><span>${fmt(c.subtotal||0)}</span></div>
          ${c.aplicaITBMS !== false && c.itbms > 0
            ? `<div class="total-row"><span>ITBMS (7%)</span><span>${fmt(c.itbms||0)}</span></div>`
            : `<div class="total-row" style="color:var(--text-gray);font-size:12px;"><span>ITBMS</span><span>No aplica</span></div>`}
          <div class="total-row grand"><span>TOTAL</span><span>${fmt(c.total||0)}</span></div>
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
          <div class="modal-title">Registrar Abono</div>
          <button class="modal-close" onclick="document.getElementById('modal-abono').style.display='none'">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-gray);margin-bottom:16px;">Total de la cotización: <strong>${fmt(c.total||0)}</strong></p>
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
          <button class="btn btn-primary" onclick="window.confirmarAbono()">Registrar abono</button>
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

    if (nuevoEstado === 'Factura') {
      window.abrirModalFactura();
      document.getElementById('select-estado').value = c.estado; // revertir mientras
      return;
    }

    if (nuevoEstado === 'Completado') {
      if (saldoPend > 0.01) {
        const conf = confirm(`Aún hay un saldo pendiente de ${fmt(saldoPend)}. ¿Confirmar como Completado de todas formas?`);
        if (!conf) {
          document.getElementById('select-estado').value = c.estado;
          return;
        }
      }
    }

    c.estado = nuevoEstado;
    if (nuevoEstado === 'Pendiente' && !c.fechaEnvio) {
      c.fechaEnvio = new Date().toISOString();
    }
    await DB.saveCotizacion(c);
    UI.toast(`Estado actualizado: ${nuevoEstado}`, 'success');
    Router.go('ver-cotizacion', { id: c.id });
  };

  window.confirmarAbono = async () => {
    const monto  = parseFloat(document.getElementById('monto-abono').value)||0;
    const fecha  = document.getElementById('fecha-abono').value;
    const metodo = document.getElementById('metodo-abono').value;
    if (monto <= 0) { UI.toast('Monto inválido', 'error'); return; }

    c.montoAbono  = monto;
    c.estado      = monto >= (c.total||0) - 0.01 ? 'Pagado' : 'Abonado';
    c.fechaAbono  = fecha;
    c.metodoAbono = metodo;
    await DB.saveCotizacion(c);

    // Auto-actualizar cobros / estado de cuenta
    await _syncCobro(c, monto, fecha, metodo);

    document.getElementById('modal-abono').style.display = 'none';
    UI.toast(c.estado === 'Pagado' ? `Cotización #${c.numero} cancelada en su totalidad` : `Abono de ${fmt(monto)} registrado`, 'success');
    Router.go('ver-cotizacion', { id: c.id });
  };

  window.abrirModalFactura = () => {
    document.getElementById('modal-factura').style.display = 'flex';
  };

  window.confirmarFactura = async () => {
    const numeroFactura = document.getElementById('numero-factura').value.trim();
    if (!numeroFactura) { UI.toast('Escribe el número de factura', 'error'); return; }

    c.estado         = 'Factura';
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
        cotizacionId: cot.id,
        numero:       cot.numero,
        factura:      numeroFactura,
        cliente:      cot.clienteNombre,
        descripcion:  `Cotización #${cot.numero}`,
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

  async function _syncCobro(cot, monto, fecha, metodo) {
    const cobros = await DB.getCobros();
    let cobro = cobros.find(cb => cb.cotizacionId === cot.id);
    if (!cobro) {
      cobro = await DB.saveCobro({
        cotizacionId: cot.id,
        numero:       cot.numero,
        cliente:      cot.clienteNombre,
        descripcion:  `Cotización #${cot.numero}`,
        total:        cot.total || 0,
        pagado:       0,
        saldo:        cot.total || 0,
        estado:       'Pendiente',
        fecha:        cot.fecha,
        vencimiento:  '',
      });
    }
    // registrarPago maneja internamente la suma de pagado y actualiza el cobro
    await DB.registrarPago(cobro.id, monto, fecha, metodo, `Abono cotización #${cot.numero}`);
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

async function _loadLogoBase64() {
  try {
    const resp = await fetch('assets/logo.png');
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror   = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

async function generarPDFCotizacion(id, fromForm = false) {
  let c;
  if (fromForm) {
    const t = window._totalesActuales || {};
    const getNotasDefault = () => {
      const tc = window._tipoCotizPDF || 'Estandar';
      if (tc === 'Smart Fit') return 'Incluye toma de medidas e instalación. Tiempo de entrega: 3 a 5 días hábiles. El pago debe realizarse al 100% para iniciar la producción.';
      if (tc === 'Smart Glass') return 'Incluye instalación del sistema inteligente. Tiempo de entrega: 15 a 20 días hábiles. 80% anticipo, 20% contra entrega.';
      return 'Esta cotización tiene una validez de 15 días. 60% anticipo, 40% contra entrega.';
    };
    c = {
      numero:        document.querySelector('.page-title')?.textContent.match(/#(\d+)/)?.[1] || '—',
      clienteNombre: document.getElementById('clienteNombre')?.value,
      clienteTel:    document.getElementById('clienteTel')?.value,
      clienteEmail:  document.getElementById('clienteEmail')?.value,
      clienteDir:    document.getElementById('clienteDir')?.value,
      fecha:         document.getElementById('fecha')?.value,
      notas:         document.getElementById('notas')?.value || getNotasDefault(),
      subtotal:  t.sub   || 0,
      itbms:     t.imp   || 0,
      total:     t.total || 0,
      abono60:   t.abono60 || 0,
      saldo40:   t.saldo40 || 0,
      aplicaITBMS: t.aplicaITBMS !== false,
      tipoCotizacion: window._tipoCotizPDF || 'Estandar',
      configCols: window._configColsPDF || {foto:true, ancho:true, alto:true, unidad:true, m2:true, cantidad:true},
      lineas: window._lineasPDF || [],
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
  const MR   = W - 15;  // margen derecho

  /* ── PRECARGA DE IMÁGENES Y LOGO ── */
  const logoBase64 = await _loadLogoBase64();
  
  let pagosBase64 = null;
  try {
    const resp = await fetch('assets/metodos_pago.png'); // Si existe
    if (resp.ok) {
      const blob = await resp.blob();
      pagosBase64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
  } catch(e) {}

  for (const l of c.lineas || []) {
    if (l.foto && !l.fotoBase64) {
      if (l.foto.startsWith('data:image')) {
         l.fotoBase64 = l.foto;
      } else {
         try {
           const resp = await fetch(l.foto);
           const blob = await resp.blob();
           l.fotoBase64 = await new Promise(resolve => {
             const reader = new FileReader();
             reader.onloadend = () => resolve(reader.result);
             reader.readAsDataURL(blob);
           });
         } catch { l.fotoBase64 = null; }
      }
    }
  }

  // Colores principales
  const greenHeader = [0, 112, 48]; // #007030 verde oscuro del banner
  const tealTitle = [0, 102, 102];  // #006666 teal de "COTIZACION"
  
  // Banner superior
  doc.setFillColor(...greenHeader);
  doc.rect(0, 0, W, 4, 'F');
  
  // Logo superior derecha
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', MR - 30, 8, 30, 25);
  }
  
  // Tabla de fecha superior derecha
  const fechaY = 36;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setDrawColor(200, 200, 200);
  doc.line(MR - 40, fechaY, MR, fechaY); // linea sup
  doc.line(MR - 40, fechaY+6, MR, fechaY+6); // linea inf
  doc.line(MR - 20, fechaY, MR - 20, fechaY+6); // div
  
  doc.text('Fecha', MR - 38, fechaY + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 0, 0); // Rojo
  doc.text(c.numero || '0000', MR - 10, fechaY - 1, { align: 'center' }); // numero rojo arriba de fecha
  doc.setTextColor(0, 0, 0);
  const fParsed = c.fecha ? new Date(c.fecha+'T12:00:00') : new Date();
  const fDisp = `${String(fParsed.getDate()).padStart(2,'0')}/${String(fParsed.getMonth()+1).padStart(2,'0')}/${fParsed.getFullYear()}`;
  doc.text(fDisp, MR - 10, fechaY + 4.5, { align: 'center' });

  // Título Izquierda
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...tealTitle);
  doc.text('COTIZACION', ML, 20);
  
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

  // TABLA PRINCIPAL
  const config = c.configCols || {};
  const colNames = ['ITEM'];
  if (config.foto) colNames.push('FOTO/REF');
  colNames.push('DESCRIPCIÓN');
  if (config.ancho) colNames.push('ANCHO');
  if (config.alto) colNames.push('ALTO');
  if (config.unidad) colNames.push('UNIDAD');
  if (config.m2) colNames.push('m²');
  if (config.cantidad) colNames.push('CANT.');
  colNames.push('PRECIO UNIT.', 'TOTAL');

  const rows = (c.lineas||[]).map((l, idx) => {
    const row = [];
    row.push(idx + 1);
    if (config.foto) row.push({ content: '', styles: { minCellHeight: 22 } });
    row.push(l.producto || l.descripcion || '—');
    if (config.ancho) row.push(l.ancho ? l.ancho + ' m' : '—');
    if (config.alto) row.push(l.alto ? l.alto + ' m' : '—');
    if (config.unidad) row.push(l.unidad || '—');
    if (config.m2) row.push(l.m2 && l.m2 !== '—' ? `${l.m2}` : '—');
    if (config.cantidad) row.push(l.cantidad || 1);
    row.push(fmt(l.precio || 0));
    row.push(fmt(l.total  || 0));
    return row;
  });

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: cy,
      head:   [colNames],
      body:   rows,
      theme:  'grid',
      headStyles: {
        fillColor:  [0, 128, 0], // Verde claro
        textColor:  255,
        fontStyle:  'bold',
        fontSize:   9,
        cellPadding: 3,
        halign: 'center'
      },
      bodyStyles: {
        fontSize:    9,
        textColor:   0,
        cellPadding: 3,
        valign: 'middle',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 12 }, // ITEM
        [config.foto ? 2 : 1]: { halign: 'left' }, // DESCRIPCION izq
      },
      margin: { left: ML, right: 15 },
      styles: {
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
      },
      didDrawCell: function(data) {
        if (data.section === 'body' && config.foto && data.column.index === 1) {
          const linea = (c.lineas||[])[data.row.index];
          if (linea && linea.fotoBase64) {
            doc.addImage(linea.fotoBase64, 'JPEG', data.cell.x + 2, data.cell.y + 2, 18, 18);
          }
        }
      }
    });
  }

  let finalY = doc.lastAutoTable?.finalY || 160;

  // Totales
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  const rightColX = MR - 30;
  const labelsX = rightColX - 25;
  
  let ty = finalY + 8;
  doc.text('SUBTOTAL', labelsX, ty, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(fmt(c.subtotal||0), MR, ty, { align: 'right' });
  
  doc.line(rightColX, ty - 5, rightColX, ty + 2); // vertical line
  doc.line(rightColX, ty + 2, MR, ty + 2); // horiz line
  
  if (c.aplicaITBMS !== false && c.itbms > 0) {
    ty += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('ITBMS (7%)', labelsX, ty, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(fmt(c.itbms||0), MR, ty, { align: 'right' });
    doc.line(rightColX, ty - 4, rightColX, ty + 2);
    doc.line(rightColX, ty + 2, MR, ty + 2);
  }

  // TRANSPORTE (Placeholder, currently no transp field in model, just putting it there to match template if needed)
  ty += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSPORTE', labelsX, ty, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text('—', MR, ty, { align: 'right' });
  doc.line(rightColX, ty - 4, rightColX, ty + 2);
  doc.line(rightColX, ty + 2, MR, ty + 2);

  // TOTAL
  ty += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', labelsX, ty, { align: 'right' });
  doc.setFillColor(0, 128, 0); // Verde claro total
  doc.rect(rightColX, ty - 4, MR - rightColX, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(fmt(c.total||0), MR, ty, { align: 'right' });
  
  // Abono y Restante
  const tipoCotiz = c.tipoCotizacion || 'Estandar';
  if (c.abono60 > 0 || c.saldo40 > 0) {
    ty += 6;
    doc.setTextColor(0, 128, 0);
    const abonoPct = tipoCotiz === 'Smart Glass' ? '80' : '60';
    doc.text(`ABONO (${abonoPct}%)`, labelsX, ty, { align: 'right' });
    doc.text(fmt(c.abono60||0), MR, ty, { align: 'right' });
    
    ty += 6;
    const saldoPct = tipoCotiz === 'Smart Glass' ? '20' : '40';
    doc.text(`RESTANTE (${saldoPct}%)`, labelsX, ty, { align: 'right' });
    doc.text(fmt(c.saldo40||0), MR, ty, { align: 'right' });
  }

  // Caja de Condiciones (Bottom Left)
  const by = Math.max(ty + 10, 210);
  
  // Dibuja el marco general de info inferior
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(ML, by, W - ML - 15, 40);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Condiciones:', ML + 2, by + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  let cy_cond = by + 9;
  const defaultCond = [
    '* Realizar abono del 60% para iniciar y el restante 40% al finalizar.',
    '* Una vez se apruebe la cotización se fija fecha de entrega en días hábiles.',
    '* Somos mano de obra garantizada.',
    '* No nos hacemos responsables por algún daño de tuberías no reportadas a perforar necesarias.',
    '* Cotización válida 30 días hábiles desde la fecha.',
    '* Valor de visita $30 Balboas los cuales son deducibles de la cotización final.'
  ];
  
  const lineasCondiciones = c.notas ? doc.splitTextToSize(c.notas, W/2) : defaultCond;
  for (const l of lineasCondiciones) {
    doc.text(l, ML + 2, cy_cond);
    cy_cond += 3.5;
  }

  // Info Contacto
  cy_cond += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Crystal Service', ML + 2, cy_cond);
  cy_cond += 4;
  doc.text('6456-2658', ML + 2, cy_cond);
  cy_cond += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('email: crystalservicejj@gmail.com', ML + 2, cy_cond);
  cy_cond += 4;
  doc.setTextColor(0, 128, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('https://www.crystalservicejj.com', ML + 2, cy_cond);

  // Métodos de Pago ACH a la derecha (si hay imagen provista)
  if (pagosBase64) {
    // Si el usuario carga el metodos_pago.png
    doc.addImage(pagosBase64, 'PNG', W - 80, by + 2, 60, 36);
  } else {
    // Texto fallback si no hay imagen
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('Para confección de cheque o ACH:', W - 70, by + 5);
    doc.text('CRYSTAL SERVICE', W - 70, by + 9);
    doc.setFont('helvetica', 'normal');
    doc.text('Banistmo 4150101799', W - 70, by + 13);
    doc.text('Banco General 04-07-00-000738-5', W - 70, by + 17);
    doc.text('YAPPY: 63621132 / 63621210', W - 70, by + 21);
    doc.setTextColor(0, 128, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('GRACIAS POR SU CONFIANZA', W - 60, by + 35);
  }

  // Banner inferior
  doc.setFillColor(...greenHeader);
  doc.rect(0, H - 10, W, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Crystal Service Panamá', ML, H - 4);
  doc.text('Ciudad de Panamá', W/2, H - 4, { align: 'center' });
  doc.text('Vidrio · Aluminio · Mantenimiento', MR, H - 4, { align: 'right' });

  /* ── MARCA DE AGUA ── */
  if (logoBase64 && typeof doc.GState === 'function') {
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.05 }));
    doc.addImage(logoBase64, 'PNG', W/2 - 60, H/2 - 60, 120, 120);
    doc.restoreGraphicsState();
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
    `Le enviamos la cotización #${c.numero} por un monto de ${fmt(c.total)}.\n\n` +
    `Quedamos atentos a sus comentarios.\n\n` +
    `Crystal Services — Tel: 6456-2658`
  );
  window.open(`https://wa.me/507${tel}?text=${msg}`, '_blank');
  if (!c.fechaEnvio) {
    c.fechaEnvio = new Date().toISOString();
    if (c.estado === 'Borrador' || !c.estado) c.estado = 'Pendiente';
    await DB.saveCotizacion(c);
  }
}

window.enviarWhatsApp = enviarWhatsApp;
