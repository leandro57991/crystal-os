/* =========================================================
   Crystal OS — modules/recordatorios.js
   Recordatorios personales con alarma a la hora indicada
   ========================================================= */

Router.register('recordatorios', async (view) => {
  const today = new Date().toISOString().slice(0,10);

  async function render() {
    const todos   = await DB.getRecordatorios();
    const activos = todos.filter(r => r.activo !== false);
    const inact   = todos.filter(r => r.activo === false);

    view.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Recordatorios</div>
          <div class="page-subtitle">Tus notas personales con alarma de tiempo</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.abrirModalRec()">
            ${UI.icons.plus} Nuevo recordatorio
          </button>
        </div>
      </div>

      ${activos.length === 0 && inact.length === 0 ? `
        <div class="empty-state">
          <h3>Sin recordatorios</h3>
          <p>Agrega tareas, avisos o cosas que no quieres olvidar.<br>Te avisaremos a la hora que indiques.</p>
          <button class="btn btn-primary" onclick="window.abrirModalRec()">${UI.icons.plus} Crear recordatorio</button>
        </div>
      ` : ''}

      ${activos.length > 0 ? `
        <div class="card" style="margin-bottom:20px;">
          <div class="card-title" style="margin-bottom:16px;">Activos (${activos.length})</div>
          <div style="display:grid;gap:10px;">
            ${activos.sort((a,b)=>(a.hora||'').localeCompare(b.hora||'')).map(r => renderCard(r)).join('')}
          </div>
        </div>
      ` : ''}

      ${inact.length > 0 ? `
        <div class="card" style="opacity:0.7;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div class="card-title">Desactivados (${inact.length})</div>
          </div>
          <div style="display:grid;gap:8px;">
            ${inact.map(r => renderCard(r, true)).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Modal nuevo/editar -->
      <div class="modal-overlay" id="modal-recordatorio" style="display:none;">
        <div class="modal" style="max-width:440px;">
          <div class="modal-header">
            <div class="modal-title" id="modal-rec-titulo">Nuevo recordatorio</div>
            <button class="modal-close" onclick="document.getElementById('modal-recordatorio').style.display='none'">${UI.icons.x}</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="rec-edit-id">
            <div class="form-group">
              <label class="form-label">Tarea o nota <span class="required">*</span></label>
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

    return `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:8px;
                  background:${inactivo ? '#f9fafb' : pasada ? '#FFF8F0' : 'var(--green-light)'};
                  border:1px solid ${pasada && !inactivo ? 'var(--amber)' : 'var(--border)'};">
        <div style="width:48px;text-align:center;flex-shrink:0;">
          <div style="font-size:16px;font-weight:700;color:${inactivo?'var(--text-gray)':'var(--green-main)'};">${hora}</div>
          ${r.fecha ? `<div style="font-size:10px;color:var(--text-gray);">${r.fecha.slice(5)}</div>` : ''}
          ${r.repetir ? `<div style="font-size:9px;color:var(--green-mid);margin-top:2px;">${r.repetir}</div>` : ''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:${pasada?'600':'500'};color:${inactivo?'var(--text-gray)':'var(--text-dark)'};">${r.texto || '—'}</div>
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

  window.abrirModalRec = (r = null) => {
    document.getElementById('modal-rec-titulo').textContent = r ? 'Editar recordatorio' : 'Nuevo recordatorio';
    document.getElementById('rec-edit-id').value    = r?.id || '';
    document.getElementById('rec-texto').value      = r?.texto || '';
    document.getElementById('rec-fecha').value      = r?.fecha || today;
    document.getElementById('rec-hora').value       = r?.hora  || new Date().toTimeString().slice(0,5);
    document.getElementById('rec-repetir').value    = r?.repetir || '';
    document.getElementById('modal-recordatorio').style.display = 'flex';
    setTimeout(() => document.getElementById('rec-texto')?.focus(), 100);
  };

  window.editarRecordatorio = async (id) => {
    const r = (await DB.getRecordatorios()).find(x => x.id === id);
    if (r) window.abrirModalRec(r);
  };

  window.guardarRecordatorio = async () => {
    const texto   = document.getElementById('rec-texto').value.trim();
    const fecha   = document.getElementById('rec-fecha').value;
    const hora    = document.getElementById('rec-hora').value;
    const repetir = document.getElementById('rec-repetir').value;
    const editId  = document.getElementById('rec-edit-id').value;

    if (!texto) { UI.toast('Escribe la tarea o nota', 'error'); return; }
    if (!hora)  { UI.toast('Indica la hora', 'error'); return; }

    await DB.saveRecordatorio({
      id:      editId || undefined,
      texto, fecha, hora, repetir,
      activo:  true,
    });

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

    // Mostrar toast prominente
    UI.toast(`⏰ Recordatorio: ${r.texto}`, 'info', 12000);

    // Notificación nativa del navegador (si el usuario la permite)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Crystal OS — Recordatorio', {
        body:    r.texto,
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
