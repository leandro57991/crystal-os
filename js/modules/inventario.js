/* =========================================================
   Crystal OS — modules/inventario.js
   Control de stock, entradas/salidas, alertas mínimo
   ========================================================= */

Router.register('inventario', async (view) => {
  let filtro   = 'Todos';
  let busqueda = '';
  let pagina    = 1;
  let porPagina = 15;
  const categorias = ['Todos','Vidrio','Aluminio','Smart','Ducha','Baranda','Fachada','Herraje','Servicio'];

  async function render() {
    let items = await DB.getInventario();
    if (filtro !== 'Todos') items = items.filter(i => i.categoria === filtro);
    if (busqueda) {
      const q = busqueda.toLowerCase();
      items = items.filter(i => (i.nombre||'').toLowerCase().includes(q));
    }

    const stockBajo = items.filter(i => i.stockMinimo && (i.stock||0) <= i.stockMinimo);
    const cont = document.getElementById('inv-content');
    if (!cont) return;

    const pag = UI.paginar(items, pagina, porPagina);
    pagina = pag.pagina;

    cont.innerHTML = `
      ${stockBajo.length > 0 ? `
        <div class="card" style="margin-bottom:16px;border-left:4px solid var(--danger);">
          <div class="card-title" style="color:var(--danger);margin-bottom:8px;">Stock bajo — alerta</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${stockBajo.map(i => `<span class="badge badge-danger">${i.nombre}: ${i.stock||0} ${i.unidad}</span>`).join('')}
          </div>
        </div>` : ''}

      <div class="filter-bar">
        ${categorias.map(c => `<button class="filter-chip${filtro===c?' active':''}" data-cat="${c}">${c}</button>`).join('')}
        <div class="filter-search">${UI.icons.search}
          <input id="inv-search" type="text" placeholder="Buscar producto…" value="${busqueda}">
        </div>
        <button class="btn btn-primary btn-sm" onclick="UI.openModal('modal-nuevo-item')">
          ${UI.icons.plus} Agregar
        </button>
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table class="table">
            <thead><tr>
              <th>Producto / Servicio</th><th>Categoría</th><th>Stock</th><th>Unidad</th><th>Precio m²</th><th>Stock mín.</th><th>Nivel</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${items.length === 0
                ? `<tr><td colspan="8" class="table-empty">Sin productos registrados</td></tr>`
                : pag.items.map(i => {
                    const stockPct = i.stockMinimo ? Math.min(100, ((i.stock||0)/i.stockMinimo)*100) : 100;
                    const cls = (i.stock||0) <= 0 ? 'danger' : (i.stock||0) <= (i.stockMinimo||0) ? 'amber' : '';
                    return `<tr>
                      <td><strong>${i.nombre}</strong></td>
                      <td><span class="badge badge-green">${i.categoria||'—'}</span></td>
                      <td style="font-weight:700;color:${cls==='danger'?'var(--danger)':cls==='amber'?'var(--amber)':'var(--text-dark)'};">${i.stock||0}</td>
                      <td>${i.unidad||'—'}</td>
                      <td>${i.precio>0?fmt(i.precio):'—'}</td>
                      <td style="color:var(--text-gray);">${i.stockMinimo||'—'}</td>
                      <td style="min-width:80px;">
                        <div class="progress-bar">
                          <div class="progress-fill${cls?' '+cls:''}" style="width:${stockPct}%"></div>
                        </div>
                      </td>
                      <td>
                        <div style="display:flex;gap:4px;">
                          <button class="btn btn-sm btn-secondary" onclick="abrirMovimiento('${i.id}','${i.nombre}','entrada')">+ Entrada</button>
                          <button class="btn btn-sm btn-outline" onclick="abrirMovimiento('${i.id}','${i.nombre}','salida')">- Salida</button>
                        </div>
                      </td>
                    </tr>`;
                  }).join('')
              }
            </tbody>
          </table>
        </div>
        <div id="inv-pagination">${UI.paginacionHTML(pag, 'window._invPagina', 'window._invPorPagina')}</div>
      </div>
    `;

    cont.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => { filtro = btn.dataset.cat; pagina = 1; render(); });
    });
    document.getElementById('inv-search')?.addEventListener('input', e => { busqueda = e.target.value; pagina = 1; render(); });
  }

  window._invPagina = (n) => { pagina = n; render(); };
  window._invPorPagina = (n) => { porPagina = parseInt(n); pagina = 1; render(); };

  window.abrirMovimiento = (itemId, nombre, tipo) => {
    document.getElementById('mov-item-id').value = itemId;
    document.getElementById('mov-tipo').value    = tipo;
    document.getElementById('mov-titulo').textContent = (tipo === 'entrada' ? 'Entrada' : 'Salida') + ' — ' + nombre;
    document.getElementById('mov-cantidad').value = '';
    document.getElementById('mov-notas').value    = '';
    UI.openModal('modal-movimiento');
  };

  window.guardarMovimiento = async () => {
    const itemId   = document.getElementById('mov-item-id').value;
    const tipo     = document.getElementById('mov-tipo').value;
    const cantidad = parseFloat(document.getElementById('mov-cantidad').value)||0;
    const notas    = document.getElementById('mov-notas').value;
    if (cantidad <= 0) { UI.toast('Ingresa una cantidad válida', 'error'); return; }
    try {
      await DB.movimientoInventario(itemId, tipo, cantidad, notas);
      UI.closeModal('modal-movimiento');
      UI.toast(`${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada`, 'success');
      await render();
    } catch(e) { UI.toast(e.message, 'error'); }
  };

  window.guardarNuevoItem = async () => {
    const data = {
      nombre:      document.getElementById('ni-nombre').value,
      categoria:   document.getElementById('ni-categoria').value,
      precio:      parseFloat(document.getElementById('ni-precio').value)||0,
      unidad:      document.getElementById('ni-unidad').value,
      stock:       parseFloat(document.getElementById('ni-stock').value)||0,
      stockMinimo: parseFloat(document.getElementById('ni-minimo').value)||0,
    };
    if (!data.nombre) { UI.toast('Nombre requerido', 'error'); return; }
    await DB.saveItemInventario(data);
    UI.closeModal('modal-nuevo-item');
    UI.toast('Producto agregado', 'success');
    await render();
  };

  view.innerHTML = `
    <div class="page-header">
      <div class="page-title">Inventario</div>
      <div class="page-subtitle">Control de materiales y productos</div>
    </div>
    <div id="inv-content"></div>

    <!-- Modal movimiento -->
    <div class="modal-overlay" id="modal-movimiento">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" id="mov-titulo">Movimiento</div>
          <button class="modal-close" onclick="UI.closeModal('modal-movimiento')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="mov-item-id">
          <input type="hidden" id="mov-tipo">
          <div class="form-group">
            <label class="form-label">Cantidad <span class="required">*</span></label>
            <input id="mov-cantidad" class="form-input" type="number" min="0" step="0.01" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Notas / Proyecto</label>
            <input id="mov-notas" class="form-input" placeholder="Ej: Proyecto Smart Fit">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="UI.closeModal('modal-movimiento')">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarMovimiento()">Guardar</button>
        </div>
      </div>
    </div>

    <!-- Modal nuevo item -->
    <div class="modal-overlay" id="modal-nuevo-item">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Nuevo Producto / Servicio</div>
          <button class="modal-close" onclick="UI.closeModal('modal-nuevo-item')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre <span class="required">*</span></label>
            <input id="ni-nombre" class="form-input" placeholder="Ej: Vidrio templado 6mm claro">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Categoría</label>
              <select id="ni-categoria" class="form-select">
                <option>Vidrio</option><option>Aluminio</option><option>Smart</option>
                <option>Ducha</option><option>Baranda</option><option>Fachada</option>
                <option>Herraje</option><option>Servicio</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Unidad</label>
              <select id="ni-unidad" class="form-select">
                <option>m²</option><option>unidad</option><option>m</option><option>rollo</option><option>kg</option><option>global</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Precio unitario ($)</label>
              <input id="ni-precio" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group">
              <label class="form-label">Stock inicial</label>
              <input id="ni-stock" class="form-input" type="number" min="0" placeholder="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Stock mínimo (alerta)</label>
            <input id="ni-minimo" class="form-input" type="number" min="0" placeholder="0">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="UI.closeModal('modal-nuevo-item')">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarNuevoItem()">Guardar</button>
        </div>
      </div>
    </div>
  `;

  await render();
});
