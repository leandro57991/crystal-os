/* =========================================================
   Crystal OS — modules/biblioteca.js
   Biblioteca de imágenes para cotizaciones
   ========================================================= */

Router.register('biblioteca', async (view) => {
  let busqueda = '';
  let carpetaFiltro = 'Todas';

  async function render() {
    let fotos = await DB.getBiblioteca() || [];
    
    // Obtener carpetas únicas
    const carpetasSet = new Set(fotos.map(f => f.carpeta).filter(Boolean));
    const carpetas = ['Todas', ...Array.from(carpetasSet).sort()];

    let lista = fotos;
    if (carpetaFiltro !== 'Todas') {
      lista = lista.filter(f => f.carpeta === carpetaFiltro);
    }
    
    if (busqueda) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(f => 
        (f.nombre || '').toLowerCase().includes(q) || 
        (f.etiquetas || '').toLowerCase().includes(q)
      );
    }

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
            <input id="bib-search" type="text" placeholder="Buscar por nombre o etiqueta (ej. vidrio templado)..." value="${busqueda}">
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;" id="bib-grid">
        ${lista.length === 0 ? `<div class="empty-state" style="grid-column:1/-1;">No hay fotos que coincidan con la búsqueda.</div>` : ''}
        ${lista.map(f => `
          <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;">
            <div style="height:140px;background:var(--bg-light);border-bottom:1px solid var(--border-light);position:relative;">
              <img src="${f.base64}" style="width:100%;height:100%;object-fit:cover;">
              <button class="btn-icon" style="position:absolute;top:5px;right:5px;background:rgba(255,255,255,0.8);border-radius:4px;color:var(--danger);width:24px;height:24px;display:flex;align-items:center;justify-content:center;" onclick="window.eliminarFoto('${f.id}')" title="Eliminar">${UI.icons.trash || '🗑️'}</button>
            </div>
            <div style="padding:12px;flex:1;display:flex;flex-direction:column;">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;word-break:break-all;">${f.nombre}</div>
              <div style="font-size:11px;color:var(--text-gray);margin-bottom:8px;">📁 ${f.carpeta || 'Sin carpeta'}</div>
              <div style="font-size:11px;color:var(--green-mid);background:#eef7f0;padding:4px 6px;border-radius:4px;word-break:break-all;">
                🏷️ ${f.etiquetas || 'Sin etiquetas'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Modal Subir Foto -->
      <div class="modal-overlay" id="modal-foto">
        <div class="modal" style="max-width:400px;width:100%;">
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
              <label class="form-label">Carpeta</label>
              <input type="text" id="foto-carpeta" class="form-input" placeholder="Ej. Baños, Cocinas, Ventanas...">
            </div>
            <div class="form-group">
              <label class="form-label">Etiquetas (separadas por coma)</label>
              <input type="text" id="foto-etiquetas" class="form-input" placeholder="Ej. vidrio, templado, perfileria">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="UI.closeModal('modal-foto')">Cancelar</button>
            <button class="btn btn-primary" onclick="window.guardarFoto()">Guardar Imagen</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('bib-carpeta')?.addEventListener('change', e => {
      carpetaFiltro = e.target.value;
      render();
    });

    document.getElementById('bib-search')?.addEventListener('input', e => {
      busqueda = e.target.value;
      render();
    });
  }

  window.abrirModalFoto = () => {
    document.getElementById('foto-file').value = '';
    document.getElementById('foto-nombre').value = '';
    document.getElementById('foto-carpeta').value = '';
    document.getElementById('foto-etiquetas').value = '';
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
    const carpeta = document.getElementById('foto-carpeta').value.trim() || 'General';
    const etiquetas = document.getElementById('foto-etiquetas').value.trim();

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
