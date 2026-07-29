/* =========================================================
   Crystal OS — modules/biblioteca.js
   Biblioteca de imágenes para cotizaciones
   ========================================================= */

Router.register('biblioteca', async (view) => {
  let busqueda = '';
  let carpetaFiltro = 'Todas';
  let pagina    = 1;
  let porPagina = 20;
  let etiquetasModal = []; // chips activos en el modal de subida
  let etiquetasVer   = []; // chips activos en el modal de ver/editar
  let fotoVerId       = null;
  let fotosCache      = [];

  async function render() {
    let fotos = await DB.getBiblioteca() || [];
    fotosCache = fotos;

    // Carpetas y etiquetas ya usadas — se ofrecen como opciones al subir,
    // para no terminar con carpetas/etiquetas duplicadas por variaciones de escritura.
    const carpetasSet = new Set(fotos.map(f => f.carpeta).filter(Boolean));
    const carpetas = ['Todas', ...Array.from(carpetasSet).sort()];
    const carpetasModal = Array.from(new Set(['General', ...carpetasSet])).sort();

    const etiquetasSet = new Set();
    fotos.forEach(f => (f.etiquetas || '').split(',').forEach(t => {
      const tag = t.trim();
      if (tag) etiquetasSet.add(tag);
    }));
    const etiquetasDisponibles = Array.from(etiquetasSet).sort();

    let lista = fotos;
    if (carpetaFiltro !== 'Todas') {
      lista = lista.filter(f => f.carpeta === carpetaFiltro);
    }

    if (busqueda) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(f =>
        (f.nombre || '').toLowerCase().includes(q) ||
        (f.descripcion || '').toLowerCase().includes(q) ||
        (f.etiquetas || '').toLowerCase().includes(q)
      );
    }

    const pag = UI.paginar(lista, pagina, porPagina);
    pagina = pag.pagina;

    view.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Biblioteca de Imágenes</div>
          <div class="page-subtitle">Gestiona fotos de referencia para usar en cotizaciones</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.abrirModalFoto()">
            ${UI.icons.plus || '+'} Subir Foto
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="filter-bar">
          <select id="bib-carpeta" class="form-select" style="width:180px;">
            ${carpetas.map(c => `<option value="${c}" ${c===carpetaFiltro?'selected':''}>📁 ${c}</option>`).join('')}
          </select>
          <div class="filter-search" style="flex:1;">
            ${UI.icons.search || '🔍'}
            <input id="bib-search" type="text" placeholder="Buscar por nombre, descripción o etiqueta (ej. vidrio templado)..." value="${busqueda}">
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;" id="bib-grid">
        ${lista.length === 0 ? `<div class="empty-state" style="grid-column:1/-1;">No hay fotos que coincidan con la búsqueda.</div>` : ''}
        ${pag.items.map(f => `
          <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;" onclick="window.abrirVerFoto('${f.id}')">
            <div style="height:140px;background:var(--bg-light);border-bottom:1px solid var(--border-light);position:relative;">
              <img src="${f.base64}" style="width:100%;height:100%;object-fit:cover;">
              <button class="btn-icon" style="position:absolute;top:5px;right:5px;background:rgba(255,255,255,0.8);border-radius:4px;color:var(--danger);width:24px;height:24px;display:flex;align-items:center;justify-content:center;" onclick="event.stopPropagation(); window.eliminarFoto('${f.id}')" title="Eliminar">${UI.icons.trash || '🗑️'}</button>
            </div>
            <div style="padding:12px;flex:1;display:flex;flex-direction:column;">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;word-break:break-all;">${f.nombre}</div>
              ${f.descripcion ? `<div style="font-size:11px;color:var(--text-gray);margin-bottom:6px;">${f.descripcion}</div>` : ''}
              <div style="font-size:11px;color:var(--text-gray);margin-bottom:8px;">📁 ${f.carpeta || 'Sin carpeta'}</div>
              <div style="font-size:11px;color:var(--green-mid);background:#eef7f0;padding:4px 6px;border-radius:4px;word-break:break-all;">
                🏷️ ${f.etiquetas || 'Sin etiquetas'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <div id="bib-pagination">${UI.paginacionHTML(pag, 'window._bibPagina', 'window._bibPorPagina')}</div>

      <!-- Modal Subir Foto -->
      <div class="modal-overlay" id="modal-foto">
        <div class="modal" style="max-width:420px;width:100%;">
          <div class="modal-header">
            <h3 class="modal-title">Subir Imagen</h3>
            <button class="modal-close" onclick="UI.closeModal('modal-foto')">${UI.icons.x || 'x'}</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Archivo</label>
              <input type="file" id="foto-file" accept="image/*" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">Nombre / Leyenda</label>
              <input type="text" id="foto-nombre" class="form-input" placeholder="Ej. Puerta Corrediza Baño">
            </div>
            <div class="form-group">
              <label class="form-label">Descripción (opcional)</label>
              <textarea id="foto-descripcion" class="form-textarea" placeholder="Detalles adicionales de la foto o el trabajo..." style="min-height:60px;"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Carpeta</label>
              <select id="foto-carpeta-select" class="form-select">
                ${carpetasModal.map(c => `<option value="${c}">📁 ${c}</option>`).join('')}
                <option value="__nueva__">+ Crear nueva carpeta...</option>
              </select>
              <input type="text" id="foto-carpeta-nueva" class="form-input" placeholder="Nombre de la nueva carpeta" style="display:none;margin-top:8px;">
            </div>
            <div class="form-group">
              <label class="form-label">Etiquetas</label>
              <div id="foto-etiquetas-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
              <input type="text" id="foto-etiquetas-input" class="form-input" list="foto-etiquetas-datalist" placeholder="Escribe una etiqueta y presiona Enter...">
              <datalist id="foto-etiquetas-datalist">
                ${etiquetasDisponibles.map(t => `<option value="${t}">`).join('')}
              </datalist>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="UI.closeModal('modal-foto')">Cancelar</button>
            <button class="btn btn-primary" onclick="window.guardarFoto()">Guardar Imagen</button>
          </div>
        </div>
      </div>

      <!-- Modal Ver / Editar Foto -->
      <div class="modal-overlay" id="modal-ver-foto">
        <div class="modal" style="max-width:420px;width:100%;">
          <div class="modal-header">
            <h3 class="modal-title">Ver / Editar Imagen</h3>
            <button class="modal-close" onclick="UI.closeModal('modal-ver-foto')">${UI.icons.x || 'x'}</button>
          </div>
          <div class="modal-body">
            <img id="ver-foto-img" src="" style="width:100%;max-height:220px;object-fit:contain;background:var(--bg-light);border-radius:8px;margin-bottom:16px;">
            <div class="form-group">
              <label class="form-label">Nombre / Leyenda</label>
              <input type="text" id="ver-foto-nombre" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">Descripción (opcional)</label>
              <textarea id="ver-foto-descripcion" class="form-textarea" style="min-height:60px;"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Carpeta</label>
              <select id="ver-foto-carpeta-select" class="form-select">
                ${carpetasModal.map(c => `<option value="${c}">📁 ${c}</option>`).join('')}
                <option value="__nueva__">+ Crear nueva carpeta...</option>
              </select>
              <input type="text" id="ver-foto-carpeta-nueva" class="form-input" placeholder="Nombre de la nueva carpeta" style="display:none;margin-top:8px;">
            </div>
            <div class="form-group">
              <label class="form-label">Etiquetas</label>
              <div id="ver-foto-etiquetas-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
              <input type="text" id="ver-foto-etiquetas-input" class="form-input" list="foto-etiquetas-datalist" placeholder="Escribe una etiqueta y presiona Enter...">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger);margin-right:auto;" onclick="window._eliminarDesdeVer()">${UI.icons.trash || '🗑️'} Eliminar</button>
            <button class="btn btn-outline" onclick="UI.closeModal('modal-ver-foto')">Cancelar</button>
            <button class="btn btn-primary" onclick="window.guardarEdicionFoto()">Guardar Cambios</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('bib-carpeta')?.addEventListener('change', e => {
      carpetaFiltro = e.target.value;
      pagina = 1;
      render();
    });

    document.getElementById('bib-search')?.addEventListener('input', e => {
      busqueda = e.target.value;
      pagina = 1;
      render();
    });

    document.getElementById('foto-carpeta-select')?.addEventListener('change', e => {
      const nuevaInput = document.getElementById('foto-carpeta-nueva');
      const esNueva = e.target.value === '__nueva__';
      nuevaInput.style.display = esNueva ? 'block' : 'none';
      if (esNueva) nuevaInput.focus();
    });

    const etiquetasInput = document.getElementById('foto-etiquetas-input');
    etiquetasInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        window._agregarEtiquetaModal(etiquetasInput.value);
        etiquetasInput.value = '';
      }
    });

    document.getElementById('ver-foto-carpeta-select')?.addEventListener('change', e => {
      const nuevaInput = document.getElementById('ver-foto-carpeta-nueva');
      const esNueva = e.target.value === '__nueva__';
      nuevaInput.style.display = esNueva ? 'block' : 'none';
      if (esNueva) nuevaInput.focus();
    });

    const etiquetasVerInput = document.getElementById('ver-foto-etiquetas-input');
    etiquetasVerInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        window._agregarEtiquetaVer(etiquetasVerInput.value);
        etiquetasVerInput.value = '';
      }
    });

    renderChipsEtiquetas();
    renderChipsEtiquetasVer();
  }

  function renderChipsEtiquetas() {
    const cont = document.getElementById('foto-etiquetas-chips');
    if (!cont) return;
    cont.innerHTML = etiquetasModal.map((tag, i) => `
      <span style="display:inline-flex;align-items:center;gap:5px;background:#eef7f0;color:var(--green-mid);font-size:12px;padding:4px 8px;border-radius:12px;">
        ${tag}
        <span onclick="window._quitarEtiquetaModal(${i})" style="cursor:pointer;font-weight:700;">×</span>
      </span>
    `).join('') || `<span style="font-size:11px;color:var(--text-gray);">Sin etiquetas todavía</span>`;
  }

  window._agregarEtiquetaModal = (valor) => {
    const tag = (valor || '').trim();
    if (!tag) return;
    if (!etiquetasModal.some(t => t.toLowerCase() === tag.toLowerCase())) {
      etiquetasModal.push(tag);
    }
    renderChipsEtiquetas();
  };

  window._quitarEtiquetaModal = (i) => {
    etiquetasModal.splice(i, 1);
    renderChipsEtiquetas();
  };

  function renderChipsEtiquetasVer() {
    const cont = document.getElementById('ver-foto-etiquetas-chips');
    if (!cont) return;
    cont.innerHTML = etiquetasVer.map((tag, i) => `
      <span style="display:inline-flex;align-items:center;gap:5px;background:#eef7f0;color:var(--green-mid);font-size:12px;padding:4px 8px;border-radius:12px;">
        ${tag}
        <span onclick="window._quitarEtiquetaVer(${i})" style="cursor:pointer;font-weight:700;">×</span>
      </span>
    `).join('') || `<span style="font-size:11px;color:var(--text-gray);">Sin etiquetas todavía</span>`;
  }

  window._agregarEtiquetaVer = (valor) => {
    const tag = (valor || '').trim();
    if (!tag) return;
    if (!etiquetasVer.some(t => t.toLowerCase() === tag.toLowerCase())) {
      etiquetasVer.push(tag);
    }
    renderChipsEtiquetasVer();
  };

  window._quitarEtiquetaVer = (i) => {
    etiquetasVer.splice(i, 1);
    renderChipsEtiquetasVer();
  };

  window.abrirVerFoto = (id) => {
    const foto = fotosCache.find(f => String(f.id) === String(id));
    if (!foto) return;
    fotoVerId = id;
    etiquetasVer = (foto.etiquetas || '').split(',').map(t => t.trim()).filter(Boolean);
    document.getElementById('ver-foto-img').src = foto.base64;
    document.getElementById('ver-foto-nombre').value = foto.nombre || '';
    document.getElementById('ver-foto-descripcion').value = foto.descripcion || '';
    const carpetaSelect = document.getElementById('ver-foto-carpeta-select');
    const tieneOpcion = Array.from(carpetaSelect.options).some(o => o.value === (foto.carpeta || 'General'));
    carpetaSelect.value = tieneOpcion ? (foto.carpeta || 'General') : 'General';
    document.getElementById('ver-foto-carpeta-nueva').value = '';
    document.getElementById('ver-foto-carpeta-nueva').style.display = 'none';
    document.getElementById('ver-foto-etiquetas-input').value = '';
    renderChipsEtiquetasVer();
    UI.openModal('modal-ver-foto');
  };

  window.guardarEdicionFoto = async () => {
    const foto = fotosCache.find(f => String(f.id) === String(fotoVerId));
    if (!foto) return;
    const nombre = document.getElementById('ver-foto-nombre').value.trim();
    const descripcion = document.getElementById('ver-foto-descripcion').value.trim();
    const carpetaSel = document.getElementById('ver-foto-carpeta-select').value;
    const carpeta = carpetaSel === '__nueva__'
      ? (document.getElementById('ver-foto-carpeta-nueva').value.trim() || 'General')
      : carpetaSel;
    const etiquetas = etiquetasVer.join(', ');

    if (!nombre) {
      UI.toast('Escribe un nombre o leyenda', 'error');
      return;
    }

    await DB.saveImagen({ ...foto, nombre, descripcion, carpeta, etiquetas });
    UI.toast('Cambios guardados');
    UI.closeModal('modal-ver-foto');
    render();
  };

  window._eliminarDesdeVer = async () => {
    if (!fotoVerId) return;
    if (!confirm('¿Eliminar esta imagen de la biblioteca?')) return;
    await DB.removeImagen(fotoVerId);
    UI.toast('Imagen eliminada');
    UI.closeModal('modal-ver-foto');
    render();
  };

  window._bibPagina = (n) => { pagina = n; render(); };
  window._bibPorPagina = (n) => { porPagina = parseInt(n); pagina = 1; render(); };

  window.abrirModalFoto = () => {
    etiquetasModal = [];
    document.getElementById('foto-file').value = '';
    document.getElementById('foto-nombre').value = '';
    document.getElementById('foto-descripcion').value = '';
    document.getElementById('foto-carpeta-select').value = 'General';
    document.getElementById('foto-carpeta-nueva').value = '';
    document.getElementById('foto-carpeta-nueva').style.display = 'none';
    document.getElementById('foto-etiquetas-input').value = '';
    renderChipsEtiquetas();
    UI.openModal('modal-foto');
  };

  window.eliminarFoto = async (id) => {
    if(!confirm('¿Eliminar esta imagen de la biblioteca?')) return;
    await DB.removeImagen(id);
    UI.toast('Imagen eliminada');
    render();
  };

  window.guardarFoto = async () => {
    const fileInput = document.getElementById('foto-file');
    const nombre = document.getElementById('foto-nombre').value.trim();
    const descripcion = document.getElementById('foto-descripcion').value.trim();
    const carpetaSel = document.getElementById('foto-carpeta-select').value;
    const carpeta = carpetaSel === '__nueva__'
      ? (document.getElementById('foto-carpeta-nueva').value.trim() || 'General')
      : carpetaSel;
    const etiquetas = etiquetasModal.join(', ');

    if (!fileInput.files[0]) {
      UI.toast('Selecciona una imagen', 'error');
      return;
    }
    if (!nombre) {
      UI.toast('Escribe un nombre o leyenda', 'error');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      await DB.saveImagen({
        nombre,
        descripcion,
        carpeta,
        etiquetas,
        base64,
        fecha: new Date().toISOString()
      });
      UI.toast('Imagen guardada en biblioteca');
      UI.closeModal('modal-foto');
      render();
    };
    reader.readAsDataURL(file);
  };

  render();
});
