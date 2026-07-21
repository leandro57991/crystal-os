/* =========================================================
   Crystal OS — modules/agenda.js
   Calendario de visitas + seguimiento comercial
   ========================================================= */

Router.register('agenda', async (view) => {
  const hoy      = new Date();
  let viewYear   = hoy.getFullYear();
  let viewMonth  = hoy.getMonth();

  async function renderCalendar() {
    const visitas  = await DB.getVisitasByMes(viewYear, viewMonth);
    const cotizaciones = await DB.getCotizaciones();
    const mesNombre = new Date(viewYear, viewMonth, 1).toLocaleString('es-PA', { month:'long', year:'numeric' });

    // Agrupar visitas por día
    const byDay = {};
    visitas.forEach(v => {
      const d = new Date(v.fecha + 'T00:00:00').getDate();
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(v);
    });

    // Días del mes
    const primerDia = new Date(viewYear, viewMonth, 1).getDay();
    const diasMes   = new Date(viewYear, viewMonth+1, 0).getDate();
    const diasAntes = primerDia; // domingo=0

    let celdas = '';
    for (let i = 0; i < diasAntes; i++) {
      celdas += `<div class="cal-day other-month"></div>`;
    }
    for (let d = 1; d <= diasMes; d++) {
      const esHoy = d === hoy.getDate() && viewMonth === hoy.getMonth() && viewYear === hoy.getFullYear();
      const eventos = byDay[d] || [];
      celdas += `
        <div class="cal-day${esHoy?' today':''}" onclick="abrirFormVisita(${d})">
          <div class="cal-day-num">${d}</div>
          ${eventos.slice(0,3).map(e => `
            <div class="cal-event${e.estado==='Culminada'?' done-ev':''}${e.estado==='En proceso'?' amber-ev':''}"
                 title="${e.clienteNombre}: ${e.motivo||''}"
                 onclick="event.stopPropagation();editarVisita('${e.id}')">
              ${e.hora ? e.hora.slice(0,5)+' ' : ''}${e.clienteNombre||'Visita'}
            </div>`).join('')}
          ${eventos.length > 3 ? `<div style="font-size:10px;color:var(--text-gray);">+${eventos.length-3} más</div>` : ''}
        </div>`;
    }

    // Cotizaciones sin respuesta — para panel lateral
    const sinRespuesta = cotizaciones.filter(c => c.estado === 'Enviada').map(c => {
      const dias = c.fechaEnvio ? Math.floor((Date.now() - new Date(c.fechaEnvio)) / 86400000) : null;
      return { ...c, diasEspera: dias };
    }).sort((a,b) => (b.diasEspera||0) - (a.diasEspera||0));

    const calendarHtml = `
      <div class="page-header">
        <div>
          <div class="page-title">Agenda</div>
          <div class="page-subtitle">Visitas y seguimiento comercial</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="abrirFormVisita()">
            ${UI.icons.plus} Nueva visita
          </button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:3fr 1fr;gap:16px;" id="agenda-grid">
        <div class="card">
          <!-- Navegación mes -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <button class="btn btn-ghost" onclick="navMes(-1)">${UI.icons.arrowLeft}</button>
            <div style="font-size:15px;font-weight:700;text-transform:capitalize;">${mesNombre}</div>
            <button class="btn btn-ghost" onclick="navMes(1)">${UI.icons.arrowLeft.replace('M19 12 L5 12 M12 19 L5 12 12 5','M5 12 L19 12 M12 5 L19 12 12 19')}</button>
          </div>
          <div class="calendar-grid">
            ${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => `<div class="cal-day-header">${d}</div>`).join('')}
            ${celdas}
          </div>
        </div>

        <!-- Panel lateral -->
        <div>
          <div class="card" style="margin-bottom:12px;">
            <div class="card-title" style="margin-bottom:12px;">Cotizaciones en espera</div>
            ${sinRespuesta.length === 0
              ? '<div style="color:var(--text-gray);font-size:13px;">Sin cotizaciones pendientes</div>'
              : sinRespuesta.slice(0,8).map(c => `
                  <div style="padding:8px 0;border-bottom:1px solid var(--border);">
                    <div style="font-size:12.5px;font-weight:600;">#${c.numero} — ${c.clienteNombre||'—'}</div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
                      <span style="font-size:11px;color:var(--text-gray);">${c.diasEspera != null ? c.diasEspera + ' días' : 'Enviada'}</span>
                      <a href="https://wa.me/507${(c.clienteTel||'').replace(/\D/g,'')}" target="_blank"
                         class="btn btn-sm btn-whatsapp" style="padding:3px 8px;font-size:11px;">
                         ${UI.icons.whatsapp}
                      </a>
                    </div>
                  </div>`).join('')
            }
          </div>

          <div class="card">
            <div class="card-title" style="margin-bottom:12px;">Visitas de este mes (${visitas.length})</div>
            <div style="${visitas.length > 6 ? 'max-height:340px;overflow-y:auto;' : ''}">
              ${visitas.length === 0
                ? '<div style="color:var(--text-gray);font-size:13px;">Sin visitas registradas</div>'
                : visitas.sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(v => `
                    <div style="padding:8px 4px 8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="editarVisita('${v.id}')">
                      <div style="font-size:12.5px;font-weight:600;">${v.clienteNombre}</div>
                      <div style="font-size:11px;color:var(--text-gray);">${v.fecha} · ${v.motivo||'—'}</div>
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
                        ${visitaBadge(v.estado)}
                        <button class="btn btn-xs btn-outline" style="color:var(--danger);" title="Eliminar" onclick="event.stopPropagation();eliminarVisita('${v.id}')">${UI.icons.trash}</button>
                      </div>
                    </div>`).join('')
              }
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('agenda-container').innerHTML = calendarHtml;
    bindAgendaEvents();
  }

  function visitaBadge(estado) {
    const map = {
      'Agendada':     'badge-blue',
      'En proceso':   'badge-amber',
      'Culminada':    'badge-success',
      'Cotizar':      'badge-green',
      'No cotizar':   'badge-danger',
      'Se hará el trabajo': 'badge-success',
    };
    return `<span class="badge ${map[estado]||'badge-gray'}">${estado||'—'}</span>`;
  }

  function bindAgendaEvents() {
    if (!document.getElementById('agenda-grid-style')) {
      const s = document.createElement('style');
      s.id = 'agenda-grid-style';
      s.textContent = '@media(max-width:900px){#agenda-grid{grid-template-columns:1fr!important}}';
      document.head.appendChild(s);
    }
  }

  window.navMes = (delta) => {
    viewMonth += delta;
    if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
    if (viewMonth > 11) { viewMonth = 0;  viewYear++; }
    renderCalendar();
  };

  window.abrirFormVisita = async (dia, visitaId = null) => {
    const fecha = dia
      ? `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
      : new Date().toISOString().slice(0,10);

    // Limpiar
    ['v-id','v-fecha','v-hora','v-cliente','v-lugar','v-motivo','v-notas'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = id === 'v-fecha' ? fecha : '';
    });
    document.getElementById('v-hora').value = '09:00';
    document.getElementById('v-estado').value = 'Agendada';
    document.getElementById('modal-visita-titulo').textContent = 'Nueva Visita';
    document.getElementById('btn-eliminar-visita').style.display = 'none';

    if (visitaId) {
      const visitas = await DB.getVisitas();
      const v = visitas.find(x => x.id === visitaId);
      if (v) {
        document.getElementById('modal-visita-titulo').textContent = 'Editar Visita';
        document.getElementById('v-id').value            = v.id;
        document.getElementById('v-fecha').value         = v.fecha;
        document.getElementById('v-hora').value          = v.hora || '09:00';
        document.getElementById('v-cliente').value       = v.clienteNombre || '';
        document.getElementById('v-lugar').value         = v.lugar || '';
        document.getElementById('v-motivo').value        = v.motivo || '';
        document.getElementById('v-estado').value        = v.estado || 'Agendada';
        document.getElementById('v-notas').value         = v.notas || '';
        document.getElementById('btn-eliminar-visita').style.display = '';
      }
    }

    UI.openModal('modal-visita');
  };

  window.editarVisita = async (id) => {
    await window.abrirFormVisita(null, id);
  };

  window.eliminarVisita = async (id) => {
    if (!confirm('¿Eliminar esta visita? Esta acción no se puede deshacer.')) return;
    await DB.deleteVisita(id);
    UI.closeModal('modal-visita');
    UI.toast('Visita eliminada', 'info');
    await renderCalendar();
  };

  window.guardarVisita = async (agregarGCal = false) => {
    const visitaId = document.getElementById('v-id').value;
    const data = {
      id:            visitaId || undefined,
      fecha:         document.getElementById('v-fecha').value,
      hora:          document.getElementById('v-hora').value,
      clienteNombre: document.getElementById('v-cliente').value,
      lugar:         document.getElementById('v-lugar').value,
      motivo:        document.getElementById('v-motivo').value,
      estado:        document.getElementById('v-estado').value,
      notas:         document.getElementById('v-notas').value,
    };
    if (!data.clienteNombre || !data.fecha) { UI.toast('Nombre y fecha son requeridos', 'error'); return; }
    await DB.saveVisita(data);
    UI.closeModal('modal-visita');
    UI.toast('Visita guardada', 'success');

    if (agregarGCal) {
      _abrirGoogleCalendar(data);
    }

    await renderCalendar();
  };

  function _abrirGoogleCalendar(v) {
    const fecha  = (v.fecha || '').replace(/-/g,'');
    const hora   = (v.hora || '09:00').replace(':','');
    const horaFin= (() => {
      const [h, m] = (v.hora||'09:00').split(':').map(Number);
      const finH = String(Math.min(h+1, 23)).padStart(2,'0');
      return finH + String(m).padStart(2,'0');
    })();
    const start  = `${fecha}T${hora}00`;
    const end    = `${fecha}T${horaFin}00`;
    const title  = encodeURIComponent(`Visita: ${v.clienteNombre}`);
    const desc   = encodeURIComponent(`${v.motivo||''}\n${v.notas||''}\nEstado: ${v.estado||''}`);
    const loc    = encodeURIComponent(v.lugar || '');
    const url    = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${desc}&location=${loc}`;
    window.open(url, '_blank');
  }

  view.innerHTML = `
    <div id="agenda-container"></div>

    <!-- Modal nueva/editar visita -->
    <div class="modal-overlay" id="modal-visita">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <div class="modal-title" id="modal-visita-titulo">Nueva Visita</div>
          <button class="modal-close" onclick="UI.closeModal('modal-visita')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="v-id">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Fecha <span class="required">*</span></label>
              <input id="v-fecha" class="form-input" type="date" value="${new Date().toISOString().slice(0,10)}">
            </div>
            <div class="form-group">
              <label class="form-label">Hora</label>
              <input id="v-hora" class="form-input" type="time" value="09:00">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Cliente / Nombre <span class="required">*</span></label>
            <input id="v-cliente" class="form-input" placeholder="Nombre del cliente">
          </div>
          <div class="form-group">
            <label class="form-label">Lugar / Dirección</label>
            <input id="v-lugar" class="form-input" placeholder="Ej: Paitilla, Torre X">
          </div>
          <div class="form-group">
            <label class="form-label">Motivo de la visita</label>
            <input id="v-motivo" class="form-input" placeholder="Ej: Toma de medidas, consulta, cotización">
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <select id="v-estado" class="form-select">
              <option>Agendada</option>
              <option>En proceso</option>
              <option>Culminada</option>
              <option>Cotizar</option>
              <option>No cotizar</option>
              <option>Se hará el trabajo</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Notas</label>
            <textarea id="v-notas" class="form-textarea" placeholder="Observaciones adicionales…"></textarea>
          </div>
        </div>
        <div class="modal-footer" style="gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline" id="btn-eliminar-visita" style="display:none;color:var(--danger);border-color:var(--danger);" onclick="eliminarVisita(document.getElementById('v-id').value)">${UI.icons.trash} Eliminar</button>
          <button class="btn btn-outline" onclick="UI.closeModal('modal-visita')">Cancelar</button>
          <button class="btn btn-secondary" onclick="guardarVisita(false)">Guardar visita</button>
          <button class="btn btn-primary" onclick="guardarVisita(true)" title="Guarda y abre Google Calendar">
            📅 Guardar + Google Calendar
          </button>
        </div>
      </div>
    </div>
  `;

  await renderCalendar();
});
