/* =========================================================
   Crystal OS — modules/proyectos.js
   Gestión de proyectos activos
   ========================================================= */

Router.register('proyectos', async (view) => {
  let filtro = 'Todos';

  async function render() {
    let proyectos = await DB.getProyectos();
    if (filtro !== 'Todos') proyectos = proyectos.filter(p => p.estado === filtro);

    const cont = document.getElementById('proy-content');
    if (!cont) return;

    const stats = {
      enProceso: proyectos.filter(p=>p.estado==='En proceso').length,
      pendiente: proyectos.filter(p=>p.estado==='Pendiente').length,
      terminado: proyectos.filter(p=>p.estado==='Terminado').length,
    };

    cont.innerHTML = `
      <div class="stats-row">
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--amber);">${stats.pendiente}</div>
          <div class="stat-lbl">Pendientes</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--green-main);">${stats.enProceso}</div>
          <div class="stat-lbl">En proceso</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--success);">${stats.terminado}</div>
          <div class="stat-lbl">Terminados</div>
        </div>
      </div>

      <div class="filter-bar">
        ${['Todos','Pendiente','En proceso','Terminado','Cancelado'].map(f => `
          <button class="filter-chip${filtro===f?' active':''}" data-f="${f}">${f}</button>`).join('')}
        <button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="UI.openModal('modal-nuevo-proyecto')">
          ${UI.icons.plus} Nuevo proyecto
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        ${proyectos.length === 0
          ? `<div class="card"><div class="empty-state"><h3>Sin proyectos</h3></div></div>`
          : proyectos.map(p => {
              const badgeMap = { Pendiente:'badge-amber','En proceso':'badge-blue',Terminado:'badge-success',Cancelado:'badge-danger' };
              return `
                <div class="card">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                    <div style="font-size:15px;font-weight:700;">${p.nombre}</div>
                    <span class="badge ${badgeMap[p.estado]||'badge-gray'}">${p.estado}</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-gray);margin-bottom:6px;">
                    ${p.cliente?`Cliente: ${p.cliente}`:''}${p.tipo?` · ${p.tipo}`:''}
                  </div>
                  ${p.fechaInicio?`<div style="font-size:11px;color:var(--text-gray);">Inicio: ${p.fechaInicio}</div>`:''}
                  ${p.presupuesto?`<div style="font-size:13px;font-weight:600;color:var(--green-main);margin-top:6px;">Ppto: ${fmt(p.presupuesto)}</div>`:''}
                  <div style="display:flex;gap:6px;margin-top:12px;">
                    <select class="form-select" style="font-size:12px;padding:5px 8px;" onchange="cambiarEstadoProyecto('${p.id}',this.value)">
                      ${['Pendiente','En proceso','Terminado','Cancelado'].map(e=>`<option ${e===p.estado?'selected':''}>${e}</option>`).join('')}
                    </select>
                  </div>
                </div>`;
            }).join('')
        }
      </div>
    `;

    cont.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => { filtro = btn.dataset.f; render(); });
    });
  }

  window.cambiarEstadoProyecto = async (id, estado) => {
    const p = await DB.getOne('proyectos', id);
    if (p) { p.estado = estado; await DB.save('proyectos', p); UI.toast('Estado actualizado', 'success'); await render(); }
  };

  window.guardarNuevoProyecto = async () => {
    const data = {
      nombre:      document.getElementById('np-nombre').value,
      cliente:     document.getElementById('np-cliente').value,
      tipo:        document.getElementById('np-tipo').value,
      fechaInicio: document.getElementById('np-inicio').value,
      presupuesto: parseFloat(document.getElementById('np-presupuesto').value)||0,
      estado:      document.getElementById('np-estado').value,
      notas:       document.getElementById('np-notas').value,
    };
    if (!data.nombre) { UI.toast('Nombre requerido','error'); return; }
    await DB.saveProyecto(data);
    UI.closeModal('modal-nuevo-proyecto');
    UI.toast('Proyecto creado','success');
    await render();
  };

  view.innerHTML = `
    <div class="page-header">
      <div class="page-title">Proyectos</div>
      <div class="page-subtitle">Seguimiento de obras en curso</div>
    </div>
    <div id="proy-content"></div>

    <div class="modal-overlay" id="modal-nuevo-proyecto">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Nuevo Proyecto</div>
          <button class="modal-close" onclick="UI.closeModal('modal-nuevo-proyecto')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre del proyecto <span class="required">*</span></label>
            <input id="np-nombre" class="form-input" placeholder="Ej: Smart Fit Obarrio — Fachada">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Cliente</label>
              <input id="np-cliente" class="form-input" placeholder="Nombre del cliente">
            </div>
            <div class="form-group">
              <label class="form-label">Tipo</label>
              <select id="np-tipo" class="form-select">
                <option>Residencial</option><option>Comercial</option><option>Corporativo</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Fecha de inicio</label>
              <input id="np-inicio" class="form-input" type="date" value="${new Date().toISOString().slice(0,10)}">
            </div>
            <div class="form-group">
              <label class="form-label">Presupuesto ($)</label>
              <input id="np-presupuesto" class="form-input" type="number" min="0" placeholder="0.00">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Estado inicial</label>
            <select id="np-estado" class="form-select">
              <option>Pendiente</option><option>En proceso</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Notas</label>
            <textarea id="np-notas" class="form-textarea" placeholder="Descripción, alcance, ubicación…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="UI.closeModal('modal-nuevo-proyecto')">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarNuevoProyecto()">Crear proyecto</button>
        </div>
      </div>
    </div>
  `;

  await render();
});
