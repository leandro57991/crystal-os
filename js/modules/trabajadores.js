/* =========================================================
   Crystal OS — modules/trabajadores.js
   Reporte diario trabajador (móvil) + vista supervisor
   ========================================================= */

/* ── REPORTE DIARIO (vista trabajador — mobile-first) ──── */

Router.register('reporte', async (view) => {
  const user       = Auth.current();
  const trabajadores = await DB.getTrabajadores();
  const proyectos  = await DB.getProyectosActivos();
  const today      = new Date().toISOString().slice(0,10);
  const todayLabel = new Date().toLocaleDateString('es-PA', { weekday:'long', day:'numeric', month:'long' });

  let materiales = [{ material:'', cantidad:'', unidad:'unidad' }];
  let enviado    = false;

  function renderMateriales() {
    const cont = document.getElementById('mat-list');
    if (!cont) return;
    cont.innerHTML = materiales.map((m, i) => `
      <div class="material-row">
        <input class="form-input" placeholder="Material" value="${m.material}"
               onchange="window._matChange(${i},'material',this.value)">
        <input class="form-input" type="number" min="0" style="max-width:70px;" placeholder="Cant." value="${m.cantidad}"
               onchange="window._matChange(${i},'cantidad',this.value)">
        <select class="form-select" style="max-width:90px;" onchange="window._matChange(${i},'unidad',this.value)">
          ${['unidad','m²','m','rollo','kg','litro','caja','bote'].map(u =>
            `<option ${u===m.unidad?'selected':''}>${u}</option>`).join('')}
        </select>
        <button class="btn-remove-material" onclick="window._removeMat(${i})">${UI.icons.trash}</button>
      </div>`).join('');
  }

  window._matChange  = (i,k,v) => { materiales[i][k] = v; };
  window._removeMat  = (i) => { if(materiales.length>1) materiales.splice(i,1); else materiales[0]={material:'',cantidad:'',unidad:'unidad'}; renderMateriales(); };
  window._addMat     = () => { materiales.push({material:'',cantidad:'',unidad:'unidad'}); renderMateriales(); };

  async function enviarReporte() {
    const proyecto = document.getElementById('r-proyecto').value;
    const tareas   = document.getElementById('r-tareas').value.trim();
    const inicio   = document.getElementById('r-inicio').value;
    const fin      = document.getElementById('r-fin').value;
    const trabId   = document.getElementById('r-trabajador')?.value || user?.id;

    if (!proyecto) { UI.toast('Selecciona un proyecto', 'error'); return; }
    if (!tareas)   { UI.toast('Describe qué hiciste hoy', 'error'); return; }

    await DB.saveReporte({
      trabajadorId: trabId,
      proyectoId:   proyecto,
      tareas, inicio, fin,
      materiales: materiales.filter(m => m.material),
      fecha: today,
    });

    // Pantalla de confirmación
    document.getElementById('reporte-form').style.display = 'none';
    document.getElementById('reporte-confirm').style.display = 'flex';
    enviado = true;
  }

  window.enviarReporte = enviarReporte;

  // Determinar si es vista de trabajador de campo (solo ve su propio reporte)
  const esTrabajador = Auth.hasRole('trabajador');

  view.innerHTML = `
    <div class="worker-report-view">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:11px;color:var(--text-gray);text-transform:uppercase;letter-spacing:1px;">Crystal Services</div>
        <div class="page-title" style="font-size:22px;">Mi Reporte</div>
        <div style="color:var(--text-gray);font-size:14px;margin-top:4px;">${todayLabel}</div>
      </div>

      <div id="reporte-form">
        ${!esTrabajador ? `
        <div class="form-group field-big">
          <label class="form-label">Trabajador</label>
          <select id="r-trabajador" class="form-select">
            ${trabajadores.map(t => `<option value="${t.id}">${t.nombre} — ${t.rol}</option>`).join('')}
          </select>
        </div>` : ''}

        <div class="form-group field-big">
          <label class="form-label">¿En qué proyecto trabajaste hoy? <span class="required">*</span></label>
          <select id="r-proyecto" class="form-select">
            <option value="">— Selecciona un proyecto —</option>
            ${proyectos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
          </select>
        </div>

        <div class="form-group field-big">
          <label class="form-label">¿Qué hiciste hoy? <span class="required">*</span></label>
          <textarea id="r-tareas" class="form-textarea" rows="5"
            placeholder="Ej: Instalé 3 paños de vidrio templado en baño principal, sellé con silicone…"></textarea>
        </div>

        <div class="form-group field-big">
          <label class="form-label">Horario</label>
          <div class="time-row">
            <div>
              <label class="form-label" style="font-size:11px;">Inicio</label>
              <input id="r-inicio" class="form-input" type="time" value="07:00">
            </div>
            <div>
              <label class="form-label" style="font-size:11px;">Fin</label>
              <input id="r-fin" class="form-input" type="time" value="17:00">
            </div>
          </div>
        </div>

        <div class="form-group field-big">
          <label class="form-label">Materiales utilizados</label>
          <div id="mat-list"></div>
          <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="window._addMat()">
            ${UI.icons.plus} Agregar material
          </button>
        </div>

        <button class="btn-send-report" onclick="enviarReporte()">
          ${UI.icons.check} ENVIAR REPORTE
        </button>
      </div>

      <!-- Confirmación -->
      <div id="reporte-confirm" class="success-screen" style="display:none;">
        <div class="checkmark-circle">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="success-title">¡Reporte enviado!</div>
        <div class="success-sub">Buen trabajo hoy. Tu supervisor ya puede ver tu reporte.</div>
        <button class="btn btn-secondary" onclick="Router.go('reporte')">Enviar otro reporte</button>
        ${!esTrabajador ? `<button class="btn btn-primary" onclick="Router.go('supervisor')">Ver equipo hoy</button>` : ''}
      </div>
    </div>
  `;

  renderMateriales();
});

/* ── VISTA SUPERVISOR ─────────────────────────────────── */

Router.register('supervisor', async (view) => {
  const today = new Date().toISOString().slice(0,10);
  let fecha   = today;

  async function render() {
    const [reportes, trabajadores, proyectos] = await Promise.all([
      DB.getReportesByFecha(fecha),
      DB.getTrabajadores(),
      DB.getProyectos(),
    ]);

    const proyMap = {};
    proyectos.forEach(p => proyMap[p.id] = p.nombre);

    const trabMap = {};
    trabajadores.forEach(t => trabMap[t.id] = t);

    // Quién no reportó
    const reportaronIds = new Set(reportes.map(r => r.trabajadorId));
    const sinReporte    = trabajadores.filter(t => !reportaronIds.has(t.id));

    const cont = document.getElementById('supervisor-content');
    if (!cont) return;

    cont.innerHTML = `
      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="stat-pill">
          <div class="stat-num">${reportes.length}</div>
          <div class="stat-lbl">Reportes recibidos</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--danger);">${sinReporte.length}</div>
          <div class="stat-lbl">Sin reporte</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num">${trabajadores.length}</div>
          <div class="stat-lbl">Total equipo</div>
        </div>
      </div>

      ${sinReporte.length > 0 ? `
        <div class="card" style="margin-bottom:16px;border-left:4px solid var(--amber);">
          <div class="card-title" style="margin-bottom:8px;color:var(--amber);">Sin reporte hoy</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${sinReporte.map(t => `<span class="badge badge-amber">${t.nombre}</span>`).join('')}
          </div>
        </div>` : ''}

      ${reportes.length === 0
        ? `<div class="card"><div class="empty-state"><h3>Sin reportes</h3><p>Ningún trabajador ha enviado reporte para ${fecha}</p></div></div>`
        : reportes.map(r => {
            const trab = trabMap[r.trabajadorId];
            const proy = proyMap[r.proyectoId] || r.proyectoId;
            const horas = r.inicio && r.fin ? calcHoras(r.inicio, r.fin) : '—';
            return `
              <div class="card" style="margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                  <div class="avatar">${(trab?.nombre||'T')[0]}</div>
                  <div>
                    <div style="font-weight:700;font-size:15px;">${trab?.nombre||'Trabajador'}</div>
                    <div style="color:var(--text-gray);font-size:12px;">${trab?.rol||'—'} · ${proy}</div>
                  </div>
                  <div style="margin-left:auto;color:var(--text-gray);font-size:12px;">
                    ${r.inicio||'—'} — ${r.fin||'—'} (${horas})
                  </div>
                </div>
                <div style="font-size:13.5px;margin-bottom:10px;line-height:1.6;">${r.tareas||'—'}</div>
                ${(r.materiales||[]).length > 0 ? `
                  <div>
                    <div style="font-size:11px;font-weight:600;color:var(--text-gray);text-transform:uppercase;margin-bottom:6px;">Materiales usados</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      ${r.materiales.map(m => `
                        <span class="badge badge-green">${m.material} — ${m.cantidad} ${m.unidad}</span>
                      `).join('')}
                    </div>
                  </div>` : ''}
              </div>`;
          }).join('')
      }
    `;
  }

  view.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Equipo Hoy</div>
        <div class="page-subtitle">Actividad del equipo de campo</div>
      </div>
      <div class="page-actions">
        <input type="date" id="fecha-supervisor" class="form-input" value="${fecha}" style="width:auto;"
               onchange="cambiarFecha(this.value)">
      </div>
    </div>
    <div id="supervisor-content"></div>
  `;

  window.cambiarFecha = async (f) => { fecha = f; await render(); };

  await render();
});

function calcHoras(inicio, fin) {
  const [hi,mi] = inicio.split(':').map(Number);
  const [hf,mf] = fin.split(':').map(Number);
  const diff = (hf*60+mf) - (hi*60+mi);
  if (diff <= 0) return '—';
  const h = Math.floor(diff/60);
  const m = diff%60;
  return `${h}h${m>0?m+'m':''}`;
}
