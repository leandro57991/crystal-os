/* =========================================================
   Crystal OS — modules/cobros.js
   Cuentas por cobrar, aging, registro de pagos
   ========================================================= */

Router.register('cobros', async (view) => {
  let filtro  = 'Todos';
  let busqueda = '';
  let pagina    = 1;
  let porPagina = 15;

  async function loadAndRender() {
    const cobros = await DB.getCobros();
    const hoy    = new Date();
    const todayStr = hoy.toISOString().slice(0,10);

    // Calcular días de vencimiento
    const conDias = cobros.map(c => {
      const dias = c.vencimiento
        ? Math.floor((new Date(c.vencimiento) - hoy) / 86400000)
        : null;
      return { ...c, diasVence: dias };
    });

    // KPIs
    const total    = cobros.filter(c=>c.estado!=='Pagado').reduce((s,c)=>s+(c.saldo||0),0);
    const cobradoMes = cobros.reduce((s,c)=>s+(c.pagado||0),0);
    const vencidos = conDias.filter(c=>c.estado!=='Pagado' && (c.diasVence||0)<0).reduce((s,c)=>s+(c.saldo||0),0);

    // Aging
    const aging = { d30:0, d60:0, d90:0, d90p:0 };
    conDias.filter(c=>c.estado!=='Pagado' && (c.saldo||0)>0).forEach(c => {
      const d = c.diasVence != null ? -c.diasVence : 0;
      if (d <= 30) aging.d30 += c.saldo||0;
      else if (d <= 60) aging.d60 += c.saldo||0;
      else if (d <= 90) aging.d90 += c.saldo||0;
      else aging.d90p += c.saldo||0;
    });

    // Filtrar lista
    let lista = conDias;
    if (filtro === 'Al día')     lista = lista.filter(c => c.diasVence >= 0 && c.estado!=='Pagado');
    if (filtro === 'Por vencer') lista = lista.filter(c => c.diasVence >= 0 && c.diasVence <= 7 && c.estado!=='Pagado');
    if (filtro === 'Vencidos')   lista = lista.filter(c => c.diasVence < 0 && c.estado!=='Pagado');
    if (filtro === 'Pagados')    lista = lista.filter(c => c.estado === 'Pagado');
    if (busqueda) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(c => (c.clienteNombre||'').toLowerCase().includes(q) || (c.factura||'').toLowerCase().includes(q));
    }

    const cont = document.getElementById('cobros-content');
    if (!cont) return;

    const pag = UI.paginar(lista, pagina, porPagina);
    pagina = pag.pagina;

    cont.innerHTML = `
      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-pill">
          <div class="stat-num">${fmt(total)}</div>
          <div class="stat-lbl">Total cartera</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--success);">${fmt(cobradoMes)}</div>
          <div class="stat-lbl">Total cobrado</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--danger);">${fmt(vencidos)}</div>
          <div class="stat-lbl">Vencido</div>
        </div>
      </div>

      <!-- Aging -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-title" style="margin-bottom:14px;">Antigüedad de la cartera</div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">
          ${[
            {label:'0–30 días',  val:aging.d30, cls:''},
            {label:'31–60 días', val:aging.d60, cls:'amber'},
            {label:'61–90 días', val:aging.d90, cls:'amber'},
            {label:'+90 días',   val:aging.d90p,cls:'danger'},
          ].map(a => `
            <div style="background:var(--green-light);border-radius:8px;padding:14px;${a.cls==='amber'?'background:#FEF3C7':a.cls==='danger'?'background:#FEE2E2':''}">
              <div style="font-size:11px;color:var(--text-gray);margin-bottom:6px;">${a.label}</div>
              <div style="font-size:18px;font-weight:700;color:${a.cls==='danger'?'var(--danger)':a.cls==='amber'?'var(--amber)':'var(--green-main)'};">${fmt(a.val)}</div>
              <div class="progress-bar" style="margin-top:8px;">
                <div class="progress-fill${a.cls?' '+a.cls:''}" style="width:${total?Math.min(100,(a.val/total)*100):0}%"></div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Filtros -->
      <div class="filter-bar">
        ${['Todos','Al día','Por vencer','Vencidos','Pagados'].map(f=>`
          <button class="filter-chip${filtro===f?' active':''}" data-f="${f}">${f}</button>`).join('')}
        <div class="filter-search">${UI.icons.search}
          <input id="cobro-search" type="text" placeholder="Buscar cliente o factura…" value="${busqueda}">
        </div>
        <button class="btn btn-primary btn-sm" onclick="UI.openModal('modal-nuevo-cobro')">
          ${UI.icons.plus} Nuevo cobro
        </button>
      </div>

      <!-- Tabla -->
      <div class="card">
        <div class="table-wrapper">
          <table class="table">
            <thead><tr>
              <th>Cliente</th><th>Factura</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Vencimiento</th><th>Estado</th><th>Acciones</th>
            </tr></thead>
            <tbody id="cobros-tbody"></tbody>
          </table>
        </div>
        <div id="cobros-pagination">${UI.paginacionHTML(pag, 'window._cobrosPagina', 'window._cobrosPorPagina')}</div>
      </div>
    `;

    // Tabla body
    const tbody = document.getElementById('cobros-tbody');
    tbody.innerHTML = pag.items.length === 0
      ? `<tr><td colspan="8" class="table-empty">Sin registros</td></tr>`
      : pag.items.map(c => {
          const badge = c.estado==='Pagado'?'badge-success':c.diasVence<0?'badge-danger':c.diasVence<=7?'badge-amber':'badge-blue';
          const label = c.estado==='Pagado'?'Pagado':c.diasVence<0?`${Math.abs(c.diasVence)}d vencido`:c.diasVence<=7?`${c.diasVence}d restantes`:'Al día';
          return `<tr>
            <td><strong>${c.clienteNombre||'—'}</strong></td>
            <td>${c.factura||'—'}</td>
            <td>${fmt(c.total||0)}</td>
            <td style="color:var(--success);">${fmt(c.pagado||0)}</td>
            <td style="font-weight:600;">${fmt(c.saldo||0)}</td>
            <td style="color:var(--text-gray);">${c.vencimiento||'—'}</td>
            <td><span class="badge ${badge}">${label}</span></td>
            <td>
              <div style="display:flex;gap:4px;">
                ${c.estado!=='Pagado'?`<button class="btn btn-sm btn-primary" onclick="abrirModalPago('${c.id}','${c.clienteNombre||''}','${fmt(c.saldo||0)}')">Pago</button>`:''}
                <button class="btn btn-sm btn-ghost btn-danger" onclick="verHistorialPagos('${c.id}')">${UI.icons.eye}</button>
              </div>
            </td>
          </tr>`;
        }).join('');

    // Bind filtros
    cont.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => { filtro = btn.dataset.f; pagina = 1; loadAndRender(); });
    });
    document.getElementById('cobro-search')?.addEventListener('input', e => { busqueda = e.target.value; pagina = 1; loadAndRender(); });
  }

  window._cobrosPagina = (n) => { pagina = n; loadAndRender(); };
  window._cobrosPorPagina = (n) => { porPagina = parseInt(n); pagina = 1; loadAndRender(); };

  window.abrirModalPago = (cobroId, nombre, saldo) => {
    document.getElementById('pago-cobro-id').value = cobroId;
    document.getElementById('pago-nombre').textContent   = nombre;
    document.getElementById('pago-saldo').textContent    = saldo;
    document.getElementById('pago-monto').value  = '';
    document.getElementById('pago-fecha').value  = new Date().toISOString().slice(0,10);
    document.getElementById('pago-metodo').value = 'Efectivo';
    document.getElementById('pago-notas').value  = '';
    UI.openModal('modal-pago');
  };

  window.registrarPago = async () => {
    const cobroId = document.getElementById('pago-cobro-id').value;
    const monto   = parseFloat(document.getElementById('pago-monto').value);
    const fecha   = document.getElementById('pago-fecha').value;
    const metodo  = document.getElementById('pago-metodo').value;
    const notas   = document.getElementById('pago-notas').value;
    if (!monto || monto <= 0) { UI.toast('Ingresa un monto válido', 'error'); return; }
    await DB.registrarPago(cobroId, monto, fecha, metodo, notas);
    UI.closeModal('modal-pago');
    UI.toast(`Pago de ${fmt(monto)} registrado`, 'success');
    await loadAndRender();
  };

  window.guardarNuevoCobro = async () => {
    const data = {
      clienteNombre: document.getElementById('nc-cliente').value,
      factura:       document.getElementById('nc-factura').value,
      total:         parseFloat(document.getElementById('nc-total').value)||0,
      pagado:        parseFloat(document.getElementById('nc-pagado').value)||0,
      vencimiento:   document.getElementById('nc-vencimiento').value,
      notas:         document.getElementById('nc-notas').value,
    };
    data.saldo  = data.total - data.pagado;
    data.estado = data.saldo <= 0.01 ? 'Pagado' : data.pagado > 0 ? 'Parcial' : 'Pendiente';
    if (!data.clienteNombre) { UI.toast('Nombre del cliente requerido', 'error'); return; }
    await DB.saveCobro(data);
    UI.closeModal('modal-nuevo-cobro');
    UI.toast('Cobro registrado', 'success');
    await loadAndRender();
  };

  window.verHistorialPagos = async (cobroId) => {
    const pagos = await DB.getPagosByCobro(cobroId);
    const cobro = await DB.getOne('cobros', cobroId);
    UI.openModal('modal-historial');
    document.getElementById('historial-titulo').textContent = `Pagos — ${cobro?.clienteNombre||'Cliente'}`;
    document.getElementById('historial-body').innerHTML = pagos.length === 0
      ? '<p style="color:var(--text-gray);">Sin pagos registrados</p>'
      : `<table class="table"><thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Notas</th></tr></thead><tbody>
          ${pagos.map(p => `<tr>
            <td>${p.fecha}</td>
            <td style="font-weight:600;color:var(--success);">${fmt(p.monto)}</td>
            <td>${p.metodo}</td>
            <td style="color:var(--text-gray);">${p.notas||'—'}</td>
          </tr>`).join('')}
        </tbody></table>`;
  };

  view.innerHTML = `
    <div class="page-header">
      <div class="page-title">Cuentas por Cobrar</div>
    </div>
    <div id="cobros-content"></div>

    <!-- Modal pago -->
    <div class="modal-overlay" id="modal-pago">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Registrar Pago</div>
          <button class="modal-close" onclick="UI.closeModal('modal-pago')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="pago-cobro-id">
          <div style="background:var(--green-light);border-radius:8px;padding:12px;margin-bottom:16px;">
            <div style="font-size:13px;font-weight:600;" id="pago-nombre">—</div>
            <div style="font-size:12px;color:var(--text-gray);">Saldo pendiente: <strong id="pago-saldo">—</strong></div>
          </div>
          <div class="form-group">
            <label class="form-label">Monto del pago <span class="required">*</span></label>
            <input id="pago-monto" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Fecha</label>
              <input id="pago-fecha" class="form-input" type="date">
            </div>
            <div class="form-group">
              <label class="form-label">Método de pago</label>
              <select id="pago-metodo" class="form-select">
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Cheque</option>
                <option>ACH</option>
                <option>Tarjeta</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notas</label>
            <input id="pago-notas" class="form-input" placeholder="Referencia, banco, etc.">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="UI.closeModal('modal-pago')">Cancelar</button>
          <button class="btn btn-primary" onclick="registrarPago()">Registrar pago</button>
        </div>
      </div>
    </div>

    <!-- Modal nuevo cobro -->
    <div class="modal-overlay" id="modal-nuevo-cobro">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Nuevo Registro de Cobro</div>
          <button class="modal-close" onclick="UI.closeModal('modal-nuevo-cobro')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Cliente <span class="required">*</span></label>
            <input id="nc-cliente" class="form-input" placeholder="Nombre del cliente">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Número de factura</label>
              <input id="nc-factura" class="form-input" placeholder="F-1234">
            </div>
            <div class="form-group">
              <label class="form-label">Fecha de vencimiento</label>
              <input id="nc-vencimiento" class="form-input" type="date">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Total facturado</label>
              <input id="nc-total" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group">
              <label class="form-label">Abono inicial</label>
              <input id="nc-pagado" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notas</label>
            <textarea id="nc-notas" class="form-textarea" placeholder="Observaciones…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="UI.closeModal('modal-nuevo-cobro')">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarNuevoCobro()">Guardar</button>
        </div>
      </div>
    </div>

    <!-- Modal historial -->
    <div class="modal-overlay" id="modal-historial">
      <div class="modal modal-lg">
        <div class="modal-header">
          <div class="modal-title" id="historial-titulo">Historial de pagos</div>
          <button class="modal-close" onclick="UI.closeModal('modal-historial')">${UI.icons.x}</button>
        </div>
        <div class="modal-body" id="historial-body"></div>
      </div>
    </div>
  `;

  await loadAndRender();
});
