/* =========================================================
   Crystal OS — modules/recordatorios.js
   Recordatorios personales con alarma a la hora indicada
   Tipos: Oficina (notas) / Pago (cobros) / Cotizar (leads con imágenes)
         / Smart Fit (reparaciones referidas por Joel)
   ========================================================= */

const TIPO_LABEL = { oficina: 'Oficina', pago: 'Pago', cotizar: 'Cotizar', smartfit: 'Smart Fit' };
const TIPO_COLOR = { oficina: 'var(--text-gray)', pago: 'var(--amber)', cotizar: 'var(--green-mid)', smartfit: 'var(--green-main)' };

Router.register('recordatorios', async (view) => {
  const today = new Date().toISOString().slice(0,10);
  let _imgBuffer = []; // imágenes de referencia del recordatorio en edición (tipo cotizar)
  let paginaActivos = 1, porPaginaActivos = 15;
  let paginaInact   = 1, porPaginaInact   = 15;

  async function render() {
    const [todos, cotizaciones] = await Promise.all([
      DB.getRecordatorios(),
      DB.getCotizaciones(),
    ]);
    const activos = todos.filter(r => r.activo !== false).sort((a,b)=>(a.hora||'').localeCompare(b.hora||''));
    const inact   = todos.filter(r => r.activo === false);
    const pagAct  = UI.paginar(activos, paginaActivos, porPaginaActivos);
    const pagIn   = UI.paginar(inact, paginaInact, porPaginaInact);
    paginaActivos = pagAct.pagina;
    paginaInact   = pagIn.pagina;

    // Cotizaciones aprobadas/abonadas con saldo pendiente que aún no tienen recordatorio de pago
    const pagoVinculados = new Set(
      activos.filter(r => r.tipo === 'pago' && r.pagoCotizacionId).map(r => r.pagoCotizacionId)
    );
    const sugeridos = cotizaciones.filter(c => {
      if (!['Aprobada','Abonado'].includes(c.estado)) return false;
      const saldo = (c.total||0) - (c.montoAbono||0);
      return saldo > 0.01 && !pagoVinculados.has(c.id);
    });

    view.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Recordatorios</div>
          <div class="page-subtitle">Oficina, pagos por cobrar y clientes por cotizar</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.abrirModalRec()">
            ${UI.icons.plus} Nuevo recordatorio
          </button>
        </div>
      </div>

      ${sugeridos.length > 0 ? `
        <div class="card" style="margin-bottom:20px;border:1px solid var(--amber);background:#FFF8F0;">
          <div class="card-title" style="margin-bottom:12px;color:#92400E;">Cobros sugeridos (${sugeridos.length})</div>
          <div style="display:grid;gap:8px;">
            ${sugeridos.map(c => {
              const saldo = (c.total||0) - (c.montoAbono||0);
              return `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fff;border:1px solid var(--border);border-radius:8px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:13px;">${c.clienteNombre||'—'} <span style="color:var(--text-gray);font-weight:400;">— Cotización #${c.numero}</span></div>
                  <div style="font-size:12px;color:var(--text-gray);">Saldo pendiente: <strong style="color:var(--amber);">${fmt(saldo)}</strong></div>
                </div>
                <button class="btn btn-sm btn-primary" onclick="window.crearRecordatorioDesdeCotizacion('${c.id}')">Crear recordatorio</button>
              </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${activos.length === 0 && inact.length === 0 ? `
        <div class="empty-state">
          <h3>Sin recordatorios</h3>
          <p>Agrega notas de oficina, cobros pendientes o clientes por cotizar.<br>Te avisaremos a la hora que indiques.</p>
          <button class="btn btn-primary" onclick="window.abrirModalRec()">${UI.icons.plus} Crear recordatorio</button>
        </div>
      ` : ''}

      ${activos.length > 0 ? `
        <div class="card" style="margin-bottom:20px;">
          <div class="card-title" style="margin-bottom:16px;">Activos (${activos.length})</div>
          <div style="display:grid;gap:10px;">
            ${pagAct.items.map(r => renderCard(r)).join('')}
          </div>
          ${UI.paginacionHTML(pagAct, 'window._recActivosPagina', 'window._recActivosPorPagina')}
        </div>
      ` : ''}

      ${inact.length > 0 ? `
        <div class="card" style="opacity:0.7;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div class="card-title">Desactivados (${inact.length})</div>
          </div>
          <div style="display:grid;gap:8px;">
            ${pagIn.items.map(r => renderCard(r, true)).join('')}
          </div>
          ${UI.paginacionHTML(pagIn, 'window._recInactPagina', 'window._recInactPorPagina')}
        </div>
      ` : ''}

      <!-- Modal nuevo/editar -->
      <div class="modal-overlay" id="modal-recordatorio" style="display:none;">
        <div class="modal" style="max-width:480px;">
          <div class="modal-header">
            <div class="modal-title" id="modal-rec-titulo">Nuevo recordatorio</div>
            <button class="modal-close" onclick="document.getElementById('modal-recordatorio').style.display='none'">${UI.icons.x}</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="rec-edit-id">

            <div class="form-group">
              <label class="form-label">Tipo de recordatorio</label>
              <select id="rec-tipo" class="form-select" onchange="window._toggleTipoRec()">
                <option value="oficina">Oficina — nota interna</option>
                <option value="pago">Pago — cobro a cliente</option>
                <option value="cotizar">Cotizar — cliente dejó especificaciones</option>
                <option value="smartfit">Smart Fit — reparación referida por Joel</option>
              </select>
            </div>

            <!-- Campos tipo Smart Fit -->
            <div id="rec-smartfit-fields" style="display:none;">
              <div class="form-group">
                <label class="form-label">Ubicación / sede <span class="required">*</span></label>
                <input id="rec-sf-ubicacion" class="form-input" placeholder="Ej: Smart Fit San Francisco">
              </div>
              <div class="form-group">
                <label class="form-label">¿Cuál es el problema? <span class="required">*</span></label>
                <textarea id="rec-sf-problema" class="form-textarea" rows="2" placeholder="Ej: Vidrio templado rajado en puerta de entrada"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Reparación o trabajo a realizar <span class="required">*</span></label>
                <textarea id="rec-sf-trabajo" class="form-textarea" rows="2" placeholder="Ej: Cambio de vidrio templado 10mm, 1.20m x 2.10m"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Total cobrado por el trabajo ($) <span class="required">*</span></label>
                <input id="rec-sf-monto" class="form-input" type="number" min="0" step="0.01" placeholder="0.00" oninput="window._calcSplitSmartFit()">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Corresponde al jefe ($)</label>
                  <input id="rec-sf-monto-jefe" class="form-input" type="number" min="0" step="0.01" placeholder="0.00" oninput="window._calcSplitSmartFit()">
                </div>
                <div class="form-group">
                  <label class="form-label">Corresponde a Joel ($)</label>
                  <input id="rec-sf-monto-joel" class="form-input" type="number" min="0" step="0.01" placeholder="0.00" oninput="window._calcSplitSmartFit()">
                </div>
              </div>
              <div id="rec-sf-diferencia" style="font-size:12px;color:var(--text-gray);margin-top:-8px;margin-bottom:16px;"></div>
            </div>

            <!-- Campos tipo Pago -->
            <div id="rec-pago-fields" style="display:none;">
              <div class="form-group">
                <label class="form-label">Vincular a cotización aprobada/abonada (opcional)</label>
                <select id="rec-pago-cotizacion" class="form-select" onchange="window._autollenarPago()">
                  <option value="">— Sin vincular —</option>
                  ${cotizaciones.filter(c => ['Aprobada','Abonado'].includes(c.estado)).map(c =>
                    `<option value="${c.id}">#${c.numero} — ${c.clienteNombre||'—'} — ${fmt((c.total||0)-(c.montoAbono||0))} pendiente</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Nombre del cliente <span class="required">*</span></label>
                  <input id="rec-pago-cliente" class="form-input" placeholder="Nombre del cliente">
                </div>
                <div class="form-group">
                  <label class="form-label">Teléfono</label>
                  <input id="rec-pago-telefono" class="form-input" placeholder="6000-0000">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Monto a cancelar ($) <span class="required">*</span></label>
                  <input id="rec-pago-monto" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
                </div>
                <div class="form-group">
                  <label class="form-label">N° de cotización</label>
                  <input id="rec-pago-numero" class="form-input" placeholder="1806">
                </div>
              </div>
            </div>

            <!-- Campos tipo Cotizar -->
            <div id="rec-cotizar-fields" style="display:none;">
              <div class="form-group">
                <label class="form-label">Imágenes de referencia</label>
                <input type="file" id="rec-cotizar-imagenes" class="form-input" accept="image/*" multiple onchange="window._agregarImagenesRec(event)">
                <div id="rec-imagenes-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" id="rec-texto-label">Tarea o nota <span class="required">*</span></label>
              <textarea id="rec-texto" class="form-textarea" placeholder="¿Qué tienes que hacer? Ej: Subir historias a Instagram, llamar al proveedor…" rows="3"></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Fecha</label>
                <input id="rec-fecha" class="form-input" type="date" value="${today}">
              </div>
              <div class="form-group">
                <label class="form-label">Hora <span class="required">*</span></label>
                <input id="rec-hora" class="form-input" type="time" value="${new Date().toTimeString().slice(0,5)}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Repetir</label>
              <select id="rec-repetir" class="form-select">
                <option value="">Solo esta vez</option>
                <option value="diario">Todos los días</option>
                <option value="lunes-viernes">Lunes a viernes</option>
                <option value="semanal">Cada semana</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="document.getElementById('modal-recordatorio').style.display='none'">Cancelar</button>
            <button class="btn btn-primary" onclick="window.guardarRecordatorio()">Guardar</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCard(r, inactivo = false) {
    const ahora   = new Date();
    const hoyStr  = ahora.toISOString().slice(0,10);
    const esHoy   = !r.fecha || r.fecha === hoyStr;
    const hora    = r.hora || '—';
    const pasada  = esHoy && r.hora && r.hora < ahora.toTimeString().slice(0,5);
    const tipo    = r.tipo || 'oficina';

    let cuerpo = `<div style="font-size:14px;font-weight:${pasada?'600':'500'};color:${inactivo?'var(--text-gray)':'var(--text-dark)'};">${r.texto || '—'}</div>`;

    if (tipo === 'pago') {
      cuerpo = `
        <div style="font-size:14px;font-weight:600;color:${inactivo?'var(--text-gray)':'var(--text-dark)'};">
          ${r.pagoCliente || '—'} ${r.pagoNumero ? `<span style="color:var(--text-gray);font-weight:400;">— Cotización #${r.pagoNumero}</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--text-gray);margin-top:2px;">
          ${r.pagoTelefono ? `Tel: ${r.pagoTelefono} · ` : ''}Monto: <strong style="color:var(--green-main);">${fmt(r.pagoMonto||0)}</strong>
        </div>
        ${r.texto ? `<div style="font-size:12px;color:var(--text-gray);margin-top:4px;">${r.texto}</div>` : ''}
      `;
    } else if (tipo === 'cotizar') {
      const imgs = r.cotizarImagenes || [];
      cuerpo = `
        <div style="font-size:14px;font-weight:${pasada?'600':'500'};color:${inactivo?'var(--text-gray)':'var(--text-dark)'};">${r.texto || 'Especificaciones del cliente'}</div>
        ${imgs.length > 0 ? `
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
          ${imgs.slice(0,4).map(img => `<img src="${img.base64}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">`).join('')}
          ${imgs.length > 4 ? `<div style="width:44px;height:44px;border-radius:6px;background:var(--green-light);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-gray);">+${imgs.length-4}</div>` : ''}
        </div>` : ''}
      `;
    } else if (tipo === 'smartfit') {
      const dif = (r.sfMonto||0) - (r.sfMontoJefe||0) - (r.sfMontoJoel||0);
      cuerpo = `
        <div style="font-size:14px;font-weight:600;color:${inactivo?'var(--text-gray)':'var(--text-dark)'};">${r.sfUbicacion || '—'}</div>
        <div style="font-size:12px;color:var(--text-gray);margin-top:2px;"><strong>Problema:</strong> ${r.sfProblema || '—'}</div>
        <div style="font-size:12px;color:var(--text-gray);margin-top:2px;"><strong>Trabajo:</strong> ${r.sfTrabajo || '—'}</div>
        <div style="font-size:12px;margin-top:6px;display:flex;gap:14px;flex-wrap:wrap;">
          <span>Total: <strong style="color:var(--text-dark);">${fmt(r.sfMonto||0)}</strong></span>
          <span>Jefe: <strong style="color:var(--green-main);">${fmt(r.sfMontoJefe||0)}</strong></span>
          <span>Joel: <strong style="color:var(--green-mid);">${fmt(r.sfMontoJoel||0)}</strong></span>
          ${Math.abs(dif) >= 0.01 ? `<span style="color:var(--amber);">Sin repartir: ${fmt(dif)}</span>` : ''}
        </div>
      `;
    }

    return `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:8px;
                  background:${inactivo ? '#f9fafb' : pasada ? '#FFF8F0' : 'var(--green-light)'};
                  border:1px solid ${pasada && !inactivo ? 'var(--amber)' : 'var(--border)'};">
        <div style="width:52px;text-align:center;flex-shrink:0;">
          <div style="font-size:16px;font-weight:700;color:${inactivo?'var(--text-gray)':'var(--green-main)'};">${hora}</div>
          ${r.fecha ? `<div style="font-size:10px;color:var(--text-gray);">${r.fecha.slice(5)}</div>` : ''}
          ${r.repetir ? `<div style="font-size:9px;color:var(--green-mid);margin-top:2px;">${r.repetir}</div>` : ''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${TIPO_COLOR[tipo]};margin-bottom:4px;">${TIPO_LABEL[tipo]}</div>
          ${cuerpo}
          ${pasada && !inactivo ? `<div style="font-size:11px;color:var(--amber);margin-top:4px;">⏰ Hora pasada</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button class="btn btn-xs btn-outline" onclick="window.editarRecordatorio('${r.id}')" title="Editar">${UI.icons.edit}</button>
          <button class="btn btn-xs btn-outline" onclick="window.toggleRecordatorio('${r.id}',${!inactivo})"
                  title="${inactivo ? 'Activar' : 'Desactivar'}" style="${inactivo?'':'color:var(--amber);'}">
            ${inactivo ? '▶' : '⏸'}
          </button>
          <button class="btn btn-xs btn-outline" onclick="window.eliminarRecordatorio('${r.id}')"
                  style="color:var(--danger);" title="Eliminar">${UI.icons.trash}</button>
        </div>
      </div>
    `;
  }

  window._toggleTipoRec = () => {
    const tipo = document.getElementById('rec-tipo').value;
    document.getElementById('rec-pago-fields').style.display     = tipo === 'pago' ? 'block' : 'none';
    document.getElementById('rec-cotizar-fields').style.display  = tipo === 'cotizar' ? 'block' : 'none';
    document.getElementById('rec-smartfit-fields').style.display = tipo === 'smartfit' ? 'block' : 'none';
    const textoGroup = document.getElementById('rec-texto').closest('.form-group');
    const label = document.getElementById('rec-texto-label');
    if (tipo === 'pago') {
      textoGroup.style.display = '';
      label.innerHTML = 'Nota adicional (opcional)';
    } else if (tipo === 'cotizar') {
      textoGroup.style.display = '';
      label.innerHTML = 'Especificaciones — qué pide el cliente <span class="required">*</span>';
    } else if (tipo === 'smartfit') {
      textoGroup.style.display = 'none';
    } else {
      textoGroup.style.display = '';
      label.innerHTML = 'Tarea o nota <span class="required">*</span>';
    }
  };

  window._calcSplitSmartFit = () => {
    const total = parseFloat(document.getElementById('rec-sf-monto').value) || 0;
    const jefe  = parseFloat(document.getElementById('rec-sf-monto-jefe').value) || 0;
    const joel  = parseFloat(document.getElementById('rec-sf-monto-joel').value) || 0;
    const dif   = total - jefe - joel;
    const el = document.getElementById('rec-sf-diferencia');
    if (!total) { el.textContent = ''; return; }
    el.textContent = Math.abs(dif) < 0.01
      ? '✓ El jefe y Joel cubren el total cobrado.'
      : `Diferencia sin repartir: ${fmt(dif)}`;
    el.style.color = Math.abs(dif) < 0.01 ? 'var(--success)' : 'var(--amber)';
  };

  window._autollenarPago = async () => {
    const cotId = document.getElementById('rec-pago-cotizacion').value;
    if (!cotId) return;
    const c = await DB.getCotizacion(cotId);
    if (!c) return;
    document.getElementById('rec-pago-cliente').value   = c.clienteNombre || '';
    document.getElementById('rec-pago-telefono').value  = c.clienteTel || '';
    document.getElementById('rec-pago-monto').value     = ((c.total||0) - (c.montoAbono||0)).toFixed(2);
    document.getElementById('rec-pago-numero').value    = c.numero || '';
  };

  window._agregarImagenesRec = (event) => {
    const files = Array.from(event.target.files || []);
    let pendientes = files.length;
    if (!pendientes) return;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        _imgBuffer.push({ nombre: file.name, base64: e.target.result });
        pendientes--;
        if (pendientes === 0) { event.target.value = ''; _renderPreviewImagenes(); }
      };
      reader.readAsDataURL(file);
    });
  };

  window._quitarImagenRec = (idx) => {
    _imgBuffer.splice(idx, 1);
    _renderPreviewImagenes();
  };

  function _renderPreviewImagenes() {
    const cont = document.getElementById('rec-imagenes-preview');
    if (!cont) return;
    cont.innerHTML = _imgBuffer.map((img, idx) => `
      <div style="position:relative;">
        <img src="${img.base64}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">
        <button type="button" onclick="window._quitarImagenRec(${idx})" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--danger);color:#fff;border:none;font-size:11px;line-height:1;cursor:pointer;">×</button>
      </div>
    `).join('');
  }

  window.abrirModalRec = (r = null) => {
    _imgBuffer = (r?.cotizarImagenes || []).slice();
    document.getElementById('modal-rec-titulo').textContent = r ? 'Editar recordatorio' : 'Nuevo recordatorio';
    document.getElementById('rec-edit-id').value    = r?.id || '';
    document.getElementById('rec-tipo').value       = r?.tipo || 'oficina';
    document.getElementById('rec-texto').value      = r?.texto || '';
    document.getElementById('rec-fecha').value      = r?.fecha || today;
    document.getElementById('rec-hora').value       = r?.hora  || new Date().toTimeString().slice(0,5);
    document.getElementById('rec-repetir').value    = r?.repetir || '';
    document.getElementById('rec-pago-cotizacion').value = r?.pagoCotizacionId || '';
    document.getElementById('rec-pago-cliente').value    = r?.pagoCliente || '';
    document.getElementById('rec-pago-telefono').value   = r?.pagoTelefono || '';
    document.getElementById('rec-pago-monto').value      = r?.pagoMonto || '';
    document.getElementById('rec-pago-numero').value     = r?.pagoNumero || '';
    document.getElementById('rec-sf-ubicacion').value    = r?.sfUbicacion || '';
    document.getElementById('rec-sf-problema').value     = r?.sfProblema || '';
    document.getElementById('rec-sf-trabajo').value      = r?.sfTrabajo || '';
    document.getElementById('rec-sf-monto').value        = r?.sfMonto || '';
    document.getElementById('rec-sf-monto-jefe').value   = r?.sfMontoJefe || '';
    document.getElementById('rec-sf-monto-joel').value   = r?.sfMontoJoel || '';
    window._toggleTipoRec();
    window._calcSplitSmartFit();
    _renderPreviewImagenes();
    document.getElementById('modal-recordatorio').style.display = 'flex';
    setTimeout(() => document.getElementById('rec-texto')?.focus(), 100);
  };

  window.editarRecordatorio = async (id) => {
    const r = (await DB.getRecordatorios()).find(x => x.id === id);
    if (r) window.abrirModalRec(r);
  };

  window.crearRecordatorioDesdeCotizacion = async (cotId) => {
    const c = await DB.getCotizacion(cotId);
    if (!c) return;
    window.abrirModalRec();
    document.getElementById('rec-tipo').value = 'pago';
    window._toggleTipoRec();
    document.getElementById('rec-pago-cotizacion').value = c.id;
    document.getElementById('rec-pago-cliente').value    = c.clienteNombre || '';
    document.getElementById('rec-pago-telefono').value   = c.clienteTel || '';
    document.getElementById('rec-pago-monto').value      = ((c.total||0) - (c.montoAbono||0)).toFixed(2);
    document.getElementById('rec-pago-numero').value     = c.numero || '';
  };

  window.guardarRecordatorio = async () => {
    const tipo    = document.getElementById('rec-tipo').value;
    const texto   = document.getElementById('rec-texto').value.trim();
    const fecha   = document.getElementById('rec-fecha').value;
    const hora    = document.getElementById('rec-hora').value;
    const repetir = document.getElementById('rec-repetir').value;
    const editId  = document.getElementById('rec-edit-id').value;

    if (!hora)  { UI.toast('Indica la hora', 'error'); return; }

    const data = { id: editId || undefined, tipo, texto, fecha, hora, repetir, activo: true };

    if (tipo === 'oficina') {
      if (!texto) { UI.toast('Escribe la tarea o nota', 'error'); return; }
    }

    if (tipo === 'pago') {
      const pagoCliente = document.getElementById('rec-pago-cliente').value.trim();
      const pagoMonto   = parseFloat(document.getElementById('rec-pago-monto').value) || 0;
      if (!pagoCliente) { UI.toast('Escribe el nombre del cliente', 'error'); return; }
      if (pagoMonto <= 0) { UI.toast('Indica el monto a cancelar', 'error'); return; }
      data.pagoCliente      = pagoCliente;
      data.pagoTelefono     = document.getElementById('rec-pago-telefono').value.trim();
      data.pagoMonto        = pagoMonto;
      data.pagoNumero       = document.getElementById('rec-pago-numero').value.trim();
      data.pagoCotizacionId = document.getElementById('rec-pago-cotizacion').value || null;
    }

    if (tipo === 'cotizar') {
      if (!texto) { UI.toast('Escribe las especificaciones del cliente', 'error'); return; }
      data.cotizarImagenes = _imgBuffer.slice();
    }

    if (tipo === 'smartfit') {
      const sfUbicacion = document.getElementById('rec-sf-ubicacion').value.trim();
      const sfProblema  = document.getElementById('rec-sf-problema').value.trim();
      const sfTrabajo   = document.getElementById('rec-sf-trabajo').value.trim();
      const sfMonto     = parseFloat(document.getElementById('rec-sf-monto').value) || 0;
      if (!sfUbicacion) { UI.toast('Indica la ubicación / sede', 'error'); return; }
      if (!sfProblema)  { UI.toast('Describe cuál es el problema', 'error'); return; }
      if (!sfTrabajo)   { UI.toast('Describe la reparación o trabajo a realizar', 'error'); return; }
      if (sfMonto <= 0) { UI.toast('Indica el total cobrado por el trabajo', 'error'); return; }
      data.sfUbicacion  = sfUbicacion;
      data.sfProblema   = sfProblema;
      data.sfTrabajo    = sfTrabajo;
      data.sfMonto      = sfMonto;
      data.sfMontoJefe  = parseFloat(document.getElementById('rec-sf-monto-jefe').value) || 0;
      data.sfMontoJoel  = parseFloat(document.getElementById('rec-sf-monto-joel').value) || 0;
    }

    await DB.saveRecordatorio(data);

    document.getElementById('modal-recordatorio').style.display = 'none';
    UI.toast(editId ? 'Recordatorio actualizado' : 'Recordatorio guardado', 'success');
    await render();
  };

  window.toggleRecordatorio = async (id, nuevoActivo) => {
    const todos = await DB.getRecordatorios();
    const r = todos.find(x => x.id === id);
    if (r) {
      r.activo = nuevoActivo;
      await DB.saveRecordatorio(r);
      await render();
    }
  };

  window.eliminarRecordatorio = async (id) => {
    if (!confirm('¿Eliminar este recordatorio?')) return;
    await DB.removeRecordatorio(id);
    UI.toast('Recordatorio eliminado', 'info');
    await render();
  };

  window._recActivosPagina = (n) => { paginaActivos = n; render(); };
  window._recActivosPorPagina = (n) => { porPaginaActivos = parseInt(n); paginaActivos = 1; render(); };
  window._recInactPagina = (n) => { paginaInact = n; render(); };
  window._recInactPorPagina = (n) => { porPaginaInact = parseInt(n); paginaInact = 1; render(); };

  await render();
});

/* ── MOTOR DE ALARMAS (corre cada minuto) ─────────────── */

async function _tickRecordatorios() {
  if (!Auth.current()) return;
  const ahora     = new Date();
  const fechaHoy  = ahora.toISOString().slice(0,10);
  const horaActual= ahora.toTimeString().slice(0,5);
  const activos   = await DB.getRecordatoriosActivos(fechaHoy);

  activos.forEach(r => {
    if (r.hora !== horaActual) return;

    // Verificar si ya fue disparado este minuto
    const flagKey = `rec_fired_${r.id}_${fechaHoy}_${horaActual}`;
    if (sessionStorage.getItem(flagKey)) return;
    sessionStorage.setItem(flagKey, '1');

    const mensaje = r.tipo === 'pago'
      ? `⏰ Cobrar a ${r.pagoCliente || 'cliente'}: $${(r.pagoMonto||0).toFixed(2)}${r.pagoNumero ? ' — Cotización #'+r.pagoNumero : ''}`
      : r.tipo === 'cotizar'
      ? `⏰ Cotizar: ${r.texto || 'cliente pendiente'}`
      : r.tipo === 'smartfit'
      ? `⏰ Smart Fit ${r.sfUbicacion || ''}: ${r.sfProblema || 'reparación pendiente'}`
      : `⏰ Recordatorio: ${r.texto}`;

    // Mostrar toast prominente
    UI.toast(mensaje, 'info', 12000);

    // Notificación nativa del navegador (si el usuario la permite)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Crystal OS — Recordatorio', {
        body:    mensaje,
        icon:    'assets/logo.png',
        badge:   'assets/logo.png',
      });
    }
  });
}

// Pedir permiso de notificación al cargar
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// Iniciar el tick cada 30 segundos para no perder el minuto exacto
setInterval(_tickRecordatorios, 30_000);
// También disparar al cargar
setTimeout(_tickRecordatorios, 2000);
