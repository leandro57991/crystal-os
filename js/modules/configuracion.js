/* =========================================================
   Crystal OS — modules/configuracion.js
   Configuración general, contraseña, perfil, usuarios
   ========================================================= */

Router.register('configuracion', async (view) => {
  const sesion = Auth.current();
  const es_gerente = Auth.hasRole('gerente');
  let tabActiva = 'perfil';

  async function render() {
    const usuarios    = es_gerente ? await DB.getAll('usuarios') : [];
    const config      = {
      empresa:  await DB.getConfig('empresa_nombre', 'Crystal Services Panamá'),
      tel:      await DB.getConfig('empresa_tel',    '6456-2658'),
      email:    await DB.getConfig('empresa_email',  'crystalservicejj@gmail.com'),
      itbms:    await DB.getConfig('itbms',           0.07),
    };

    view.innerHTML = `
      <div class="page-header">
        <div class="page-title">Configuración</div>
      </div>

      <div id="cfg-tabs" style="display:flex;gap:4px;border-bottom:2px solid var(--border);margin-bottom:20px;flex-wrap:wrap;">
        <button class="tab-btn ${tabActiva==='perfil'?'active':''}" data-tab="perfil">Mi perfil</button>
        <button class="tab-btn ${tabActiva==='password'?'active':''}" data-tab="password">Cambiar contraseña</button>
        ${es_gerente ? `
          <button class="tab-btn ${tabActiva==='empresa'?'active':''}" data-tab="empresa">Empresa</button>
          <button class="tab-btn ${tabActiva==='usuarios'?'active':''}" data-tab="usuarios">Usuarios</button>
        ` : ''}
      </div>

      <div id="cfg-content">
        ${tabActiva === 'perfil'    ? buildPerfil(sesion)           : ''}
        ${tabActiva === 'password'  ? buildPassword()               : ''}
        ${tabActiva === 'empresa'   ? buildEmpresa(config)          : ''}
        ${tabActiva === 'usuarios'  ? buildUsuarios(usuarios)       : ''}
      </div>

      <!-- Modal nuevo usuario -->
      <div class="modal-overlay" id="modal-nuevo-usuario" style="display:none;">
        <div class="modal" style="max-width:420px;">
          <div class="modal-header">
            <div class="modal-title" id="modal-usuario-titulo">Nuevo usuario</div>
            <button class="modal-close" onclick="document.getElementById('modal-nuevo-usuario').style.display='none'">${UI.icons.x}</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="nu-id">
            <div class="form-group">
              <label class="form-label">Nombre completo <span class="required">*</span></label>
              <input id="nu-nombre" class="form-input" placeholder="Nombre y apellido">
            </div>
            <div class="form-group">
              <label class="form-label">Usuario <span class="required">*</span></label>
              <input id="nu-usuario" class="form-input" placeholder="usuario123">
            </div>
            <div class="form-group">
              <label class="form-label">Contraseña <span class="required">*</span></label>
              <input id="nu-password" class="form-input" type="password" placeholder="Mínimo 6 caracteres">
            </div>
            <div class="form-group">
              <label class="form-label">Rol</label>
              <select id="nu-rol" class="form-select">
                <option value="gerente">Administrador (acceso total)</option>
                <option value="oficina" selected>Secretaria (oficina)</option>
                <option value="cotizador">Cotizador (solo cotizaciones)</option>
                <option value="trabajador">Trabajador de campo</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Correo (opcional)</label>
              <input id="nu-email" class="form-input" type="email" placeholder="correo@ejemplo.com">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="document.getElementById('modal-nuevo-usuario').style.display='none'">Cancelar</button>
            <button class="btn btn-primary" onclick="window.guardarUsuario()">Guardar</button>
          </div>
        </div>
      </div>
    `;

    view.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        tabActiva = btn.dataset.tab;
        render();
      });
    });
  }

  /* ── PESTAÑA: PERFIL ─────────────────────────────────── */

  function buildPerfil(sesion) {
    const iniciales = (sesion?.nombre || sesion?.usuario || 'U').slice(0,2).toUpperCase();
    return `
      <div class="card" style="max-width:520px;">
        <div class="card-title" style="margin-bottom:20px;">Mi perfil</div>

        <!-- Avatar -->
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;">
          <div id="avatar-preview" style="
            width:80px;height:80px;border-radius:50%;
            background:var(--green-soft);color:var(--green-main);
            display:flex;align-items:center;justify-content:center;
            font-size:26px;font-weight:700;overflow:hidden;flex-shrink:0;
            ${sesion?.foto ? 'padding:0;' : ''}
          ">
            ${sesion?.foto
              ? `<img src="${sesion.foto}" style="width:100%;height:100%;object-fit:cover;">`
              : iniciales}
          </div>
          <div>
            <div style="font-size:15px;font-weight:600;">${sesion?.nombre||sesion?.usuario||'—'}</div>
            <div style="font-size:13px;color:var(--text-gray);text-transform:capitalize;">${sesion?.rol||'—'}</div>
            <button class="btn btn-sm btn-outline" style="margin-top:8px;" onclick="document.getElementById('input-foto').click()">
              Cambiar foto
            </button>
            <input type="file" id="input-foto" accept="image/*" style="display:none;" onchange="window.cargarFoto(this)">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Nombre completo</label>
          <input id="perfil-nombre" class="form-input" value="${sesion?.nombre||''}" placeholder="Tu nombre">
        </div>
        <div class="form-group">
          <label class="form-label">Correo electrónico</label>
          <input id="perfil-email" class="form-input" type="email" value="${sesion?.email||''}" placeholder="correo@ejemplo.com">
        </div>
        <div class="form-group">
          <label class="form-label">Usuario (no editable)</label>
          <input class="form-input" value="${sesion?.usuario||''}" disabled style="background:#f3f4f6;">
        </div>

        <button class="btn btn-primary" onclick="window.guardarPerfil()" style="margin-top:8px;">Guardar cambios</button>
      </div>
    `;
  }

  window.cargarFoto = (input) => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { UI.toast('La imagen no puede superar 2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const prev = document.getElementById('avatar-preview');
      if (prev) prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
      window._fotoPendiente = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  window.guardarPerfil = async () => {
    const sesion = Auth.current();
    if (!sesion) return;
    const usuario = await DB.getUsuario(sesion.usuario);
    if (!usuario) { UI.toast('Usuario no encontrado', 'error'); return; }

    usuario.nombre = document.getElementById('perfil-nombre').value.trim() || usuario.nombre;
    usuario.email  = document.getElementById('perfil-email').value.trim();
    if (window._fotoPendiente) {
      usuario.foto = window._fotoPendiente;
      window._fotoPendiente = null;
    }

    await DB.saveUsuario(usuario);

    // Actualizar sesión
    const sesActual = JSON.parse(sessionStorage.getItem('crystal_session') || '{}');
    sesActual.nombre = usuario.nombre;
    sesActual.email  = usuario.email;
    if (usuario.foto) sesActual.foto = usuario.foto;
    sessionStorage.setItem('crystal_session', JSON.stringify(sesActual));

    UI.toast('Perfil actualizado', 'success');
    // Actualizar header/sidebar
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) headerAvatar.textContent = (usuario.nombre||usuario.usuario||'U').slice(0,2).toUpperCase();
  };

  /* ── PESTAÑA: CONTRASEÑA ─────────────────────────────── */

  function buildPassword() {
    return `
      <div class="card" style="max-width:480px;">
        <div class="card-title" style="margin-bottom:20px;">Cambiar contraseña</div>
        <div class="form-group">
          <label class="form-label">Contraseña actual <span class="required">*</span></label>
          <input id="pwd-actual" class="form-input" type="password" placeholder="••••••••">
        </div>
        <div class="form-group">
          <label class="form-label">Nueva contraseña <span class="required">*</span></label>
          <input id="pwd-nueva" class="form-input" type="password" placeholder="Mínimo 6 caracteres">
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar nueva contraseña <span class="required">*</span></label>
          <input id="pwd-confirm" class="form-input" type="password" placeholder="Repite la contraseña">
        </div>
        <div id="pwd-error" style="color:var(--danger);font-size:13px;min-height:18px;margin-bottom:8px;"></div>
        <button class="btn btn-primary" onclick="window.cambiarPassword()">Cambiar contraseña</button>
      </div>
    `;
  }

  window.cambiarPassword = async () => {
    const actual  = document.getElementById('pwd-actual').value;
    const nueva   = document.getElementById('pwd-nueva').value;
    const confirm = document.getElementById('pwd-confirm').value;
    const errEl   = document.getElementById('pwd-error');
    errEl.textContent = '';

    const sesion  = Auth.current();
    const usuario = await DB.getUsuario(sesion?.usuario);
    if (!usuario) { errEl.textContent = 'Sesión inválida'; return; }

    if (usuario.password !== actual) { errEl.textContent = 'La contraseña actual no es correcta'; return; }
    if (nueva.length < 6)            { errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; return; }
    if (nueva !== confirm)           { errEl.textContent = 'Las contraseñas no coinciden'; return; }

    usuario.password = nueva;
    await DB.saveUsuario(usuario);
    UI.toast('Contraseña cambiada exitosamente', 'success');
    document.getElementById('pwd-actual').value  = '';
    document.getElementById('pwd-nueva').value   = '';
    document.getElementById('pwd-confirm').value = '';
  };

  /* ── PESTAÑA: EMPRESA ─────────────────────────────────── */

  function buildEmpresa(config) {
    return `
      <div class="card" style="max-width:520px;">
        <div class="card-title" style="margin-bottom:20px;">Datos de la empresa</div>
        <div class="form-group">
          <label class="form-label">Nombre de la empresa</label>
          <input id="emp-nombre" class="form-input" value="${config.empresa||''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input id="emp-tel" class="form-input" value="${config.tel||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Correo</label>
            <input id="emp-email" class="form-input" type="email" value="${config.email||''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">ITBMS (%)</label>
          <input id="emp-itbms" class="form-input" type="number" min="0" max="30" step="0.1"
                 value="${Math.round((config.itbms||0.07)*100)}">
          <div style="font-size:12px;color:var(--text-gray);margin-top:4px;">Valor actual: ${Math.round((config.itbms||0.07)*100)}% — se aplica automáticamente en cotizaciones</div>
        </div>
        <button class="btn btn-primary" onclick="window.guardarEmpresa()" style="margin-top:8px;">Guardar configuración</button>
      </div>
    `;
  }

  window.guardarEmpresa = async () => {
    await DB.setConfig('empresa_nombre', document.getElementById('emp-nombre').value.trim());
    await DB.setConfig('empresa_tel',    document.getElementById('emp-tel').value.trim());
    await DB.setConfig('empresa_email',  document.getElementById('emp-email').value.trim());
    const itbmsPct = parseFloat(document.getElementById('emp-itbms').value) || 7;
    await DB.setConfig('itbms', itbmsPct / 100);
    UI.toast('Configuración guardada', 'success');
  };

  /* ── PESTAÑA: USUARIOS ─────────────────────────────────── */

  function buildUsuarios(usuarios) {
    const rolLabels = { gerente: 'Gerente / Dueño', oficina: 'Oficina', trabajador: 'Campo', cliente: 'Cliente' };
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Usuarios del sistema</div>
          <button class="btn btn-sm btn-primary" onclick="window.abrirModalUsuario()">
            ${UI.icons.plus} Agregar usuario
          </button>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Correo</th><th>Acciones</th></tr></thead>
            <tbody>
              ${usuarios.map(u => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div style="width:32px;height:32px;border-radius:50%;background:var(--green-soft);
                                  display:flex;align-items:center;justify-content:center;
                                  font-size:12px;font-weight:700;color:var(--green-main);flex-shrink:0;">
                        ${u.foto
                          ? `<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                          : (u.nombre||u.usuario||'?').slice(0,2).toUpperCase()}
                      </div>
                      <strong>${u.nombre||u.usuario}</strong>
                    </div>
                  </td>
                  <td><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${u.usuario}</code></td>
                  <td><span class="badge badge-${u.rol==='gerente'?'success':u.rol==='oficina'?'blue':'gray'}">${rolLabels[u.rol]||u.rol}</span></td>
                  <td style="color:var(--text-gray);font-size:13px;">${u.email||'—'}</td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <button class="btn btn-sm btn-outline" onclick="window.abrirModalUsuario('${u.id}')">${UI.icons.edit}</button>
                      ${u.usuario !== sesion?.usuario ? `
                        <button class="btn btn-sm btn-outline" style="color:var(--danger);"
                                onclick="window.eliminarUsuario('${u.id}','${u.nombre||u.usuario}')">${UI.icons.trash}</button>
                      ` : '<span style="font-size:11px;color:var(--text-gray);padding:4px;">Tú</span>'}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.abrirModalUsuario = async (id = null) => {
    document.getElementById('modal-usuario-titulo').textContent = id ? 'Editar usuario' : 'Nuevo usuario';
    document.getElementById('nu-id').value       = id || '';
    document.getElementById('nu-nombre').value   = '';
    document.getElementById('nu-usuario').value  = '';
    document.getElementById('nu-password').value = '';
    document.getElementById('nu-email').value    = '';
    document.getElementById('nu-rol').value      = 'oficina';

    if (id) {
      const todos = await DB.getAll('usuarios');
      const u = todos.find(x => x.id === id);
      if (u) {
        document.getElementById('nu-nombre').value   = u.nombre || '';
        document.getElementById('nu-usuario').value  = u.usuario;
        document.getElementById('nu-email').value    = u.email  || '';
        document.getElementById('nu-rol').value      = u.rol    || 'oficina';
        document.getElementById('modal-usuario-titulo').textContent = `Editar: ${u.nombre||u.usuario}`;
      }
    }
    document.getElementById('modal-nuevo-usuario').style.display = 'flex';
  };

  window.guardarUsuario = async () => {
    const id       = document.getElementById('nu-id').value;
    const nombre   = document.getElementById('nu-nombre').value.trim();
    const usuario  = document.getElementById('nu-usuario').value.trim();
    const password = document.getElementById('nu-password').value;
    const email    = document.getElementById('nu-email').value.trim();
    const rol      = document.getElementById('nu-rol').value;

    if (!nombre)  { UI.toast('El nombre es requerido', 'error'); return; }
    if (!usuario) { UI.toast('El usuario es requerido', 'error'); return; }

    if (!id && !password) { UI.toast('La contraseña es requerida para nuevos usuarios', 'error'); return; }
    if (!id && password.length < 6) { UI.toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

    // Verificar usuario único
    if (!id) {
      const existente = await DB.getUsuario(usuario);
      if (existente) { UI.toast('Ese nombre de usuario ya existe', 'error'); return; }
    }

    const data = { nombre, usuario, email, rol };
    if (id)       data.id = id;
    if (password) data.password = password;
    else if (id) {
      const todos = await DB.getAll('usuarios');
      const existente = todos.find(u => u.id === id);
      if (existente) data.password = existente.password;
    }

    await DB.saveUsuario(data);
    document.getElementById('modal-nuevo-usuario').style.display = 'none';
    UI.toast(id ? 'Usuario actualizado' : `Usuario ${usuario} creado`, 'success');
    tabActiva = 'usuarios';
    await render();
  };

  window.eliminarUsuario = async (id, nombre) => {
    if (!confirm(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) return;
    await DB.remove('usuarios', id);
    UI.toast('Usuario eliminado', 'info');
    tabActiva = 'usuarios';
    await render();
  };

  await render();
});
