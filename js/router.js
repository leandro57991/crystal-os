/* =========================================================
   Crystal OS — router.js
   Hash-based SPA router: #/page
   ========================================================= */

const Router = (() => {
  const routes = {};

  function register(page, fn) { routes[page] = fn; }

  function go(page, params = {}) {
    const hash = params && Object.keys(params).length
      ? `#/${page}?${new URLSearchParams(params)}`
      : `#/${page}`;
    window.location.hash = hash;
  }

  function current() {
    const hash = window.location.hash.replace('#/', '');
    const [page, query] = hash.split('?');
    const params = query ? Object.fromEntries(new URLSearchParams(query)) : {};
    return { page: page || 'dashboard', params };
  }

  const COTIZADOR_PAGES = ['cotizaciones', 'nueva-cotizacion', 'ver-cotizacion'];

  async function render() {
    if (!Auth.isLoggedIn()) { UI.showLogin(); return; }
    UI.showApp();

    const { page, params } = current();
    const user = Auth.current();

    // El rol cotizador solo puede acceder al módulo de cotizaciones
    if (user?.rol === 'cotizador' && !COTIZADOR_PAGES.includes(page)) {
      go('cotizaciones');
      return;
    }

    const view = document.getElementById('app-view');
    if (!view) return;

    view.innerHTML = '<div class="empty-state"><p>Cargando...</p></div>';
    UI.buildSidebar(page);
    UI.updateBreadcrumb(page);

    const fn = routes[page];
    if (fn) {
      await fn(view, params);
    } else {
      view.innerHTML = `<div class="empty-state">
        <h3>Página no encontrada</h3>
        <p>La sección "${page}" no existe.</p>
      </div>`;
    }
  }

  function init() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { register, go, init, current };
})();

window.Router = Router;
