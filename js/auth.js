/* =========================================================
   Crystal OS — auth.js
   Login / logout / sesión activa
   ========================================================= */

const Auth = (() => {
  const STORAGE_KEY = 'crystal_session';

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY))
          || JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    } catch { return null; }
  }
  function setSession(user, remember) {
    const data = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(STORAGE_KEY, data);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, data);
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  function clearSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  }

  async function login(usuario, password, remember = false) {
    const user = await DB.getUsuario(usuario);
    if (!user) return { ok: false, msg: 'Usuario no encontrado' };
    if (user.password !== password) return { ok: false, msg: 'Contraseña incorrecta' };
    setSession({ id: user.id, nombre: user.nombre, rol: user.rol, usuario: user.usuario }, remember);
    return { ok: true, user };
  }

  function logout() {
    clearSession();
    window.location.reload();
  }

  function current() { return getSession(); }
  function isLoggedIn() { return !!getSession(); }

  function requireAuth() {
    if (!isLoggedIn()) {
      UI.showLogin();
      return false;
    }
    return true;
  }

  /* Roles: gerente | oficina | trabajador | cliente */
  function hasRole(...roles) {
    const s = getSession();
    return s && roles.includes(s.rol);
  }

  return { login, logout, current, isLoggedIn, requireAuth, hasRole };
})();

window.Auth = Auth;

/* Toggle visibilidad contraseña en login */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-toggle-pass');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const input = document.getElementById('login-password');
    const show  = document.getElementById('eye-icon-show');
    const hide  = document.getElementById('eye-icon-hide');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (show) show.style.display = 'none';
      if (hide) hide.style.display = '';
    } else {
      input.type = 'password';
      if (show) show.style.display = '';
      if (hide) hide.style.display = 'none';
    }
  });
});
