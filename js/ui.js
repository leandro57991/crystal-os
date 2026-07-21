/* =========================================================
   Crystal OS — ui.js
   Sidebar, header, toasts, modales, router glue
   ========================================================= */

const UI = (() => {

  /* ── TOAST ─────────────────────────────────────────── */

  function toast(msg, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? icons.check : type === 'error' ? icons.x : icons.info;
    el.innerHTML = `${icon}<span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration + 100);
  }

  /* ── MODAL ─────────────────────────────────────────── */

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }
  function closeAllModals() {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }

  /* ── SIDEBAR ─────────────────────────────────────────── */

  const NAV_ITEMS = [
    { id: 'dashboard',      label: 'Dashboard',         icon: 'home',          roles: ['gerente','oficina'] },
    { id: 'cotizaciones',   label: 'Cotizaciones',       icon: 'fileText',      roles: ['gerente','oficina','cotizador'] },
    { id: 'agenda',         label: 'Agenda',             icon: 'calendar',      roles: ['gerente','oficina'] },
    { id: 'estado-cuenta',  label: 'Estado de Cuenta',   icon: 'receipt',       roles: ['gerente','oficina'] },
    { id: 'cobros',         label: 'Cuentas por Cobrar', icon: 'dollarSign',    roles: ['gerente','oficina'] },
    { id: 'nomina',         label: 'Nómina',             icon: 'users',         roles: ['gerente','oficina'] },
    { id: 'reporte',        label: 'Mi Reporte',         icon: 'clipboardList', roles: ['trabajador','gerente','oficina'] },
    { id: 'supervisor',     label: 'Equipo Hoy',         icon: 'activity',      roles: ['gerente','oficina'] },
    { id: 'inventario',     label: 'Inventario',         icon: 'package',       roles: ['gerente','oficina'] },
    { id: 'proyectos',      label: 'Proyectos',          icon: 'briefcase',     roles: ['gerente','oficina'] },
    { id: 'biblioteca',     label: 'Biblioteca Fotos',   icon: 'image',         roles: ['gerente','oficina'] },
    { id: 'recordatorios',  label: 'Recordatorios',      icon: 'bell',          roles: ['gerente','oficina'] },
    { id: 'configuracion',  label: 'Configuración',      icon: 'settings',      roles: ['gerente'] },
  ];

  function buildSidebar(currentPage) {
    const user = Auth.current();
    const nav  = document.getElementById('sidebar-nav');
    if (!nav) return;

    nav.innerHTML = NAV_ITEMS
      .filter(item => item.roles.includes(user?.rol || 'gerente'))
      .map(item => `
        <button class="nav-item${currentPage === item.id ? ' active' : ''}"
                data-page="${item.id}" title="${item.label}">
          ${icons[item.icon] || ''}
          <span>${item.label}</span>
        </button>
      `).join('');

    nav.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        Router.go(btn.dataset.page);
        closeMobileSidebar();
      });
    });

    // User info footer
    const footerName = document.getElementById('sidebar-user-name');
    const footerRole = document.getElementById('sidebar-user-role');
    const footerAvatar = document.getElementById('sidebar-avatar');
    if (footerName) footerName.textContent = user?.nombre || 'Usuario';
    if (footerRole) footerRole.textContent = rolLabel(user?.rol);
    if (footerAvatar) footerAvatar.textContent = (user?.nombre || 'U')[0].toUpperCase();

    // Menú de usuario del header (siempre accesible, sin depender del sidebar)
    const headerAvatar = document.getElementById('header-avatar');
    const headerName   = document.getElementById('header-user-dropdown-name');
    const headerRole   = document.getElementById('header-user-dropdown-role');
    if (headerAvatar) headerAvatar.textContent = (user?.nombre || 'U')[0].toUpperCase();
    if (headerName) headerName.textContent = user?.nombre || 'Usuario';
    if (headerRole) headerRole.textContent = rolLabel(user?.rol);

    // Notif badge
    refreshNotifBadge();
  }

  /* ── MENÚ DE USUARIO DEL HEADER ──────────────────────── */

  function toggleHeaderUserMenu() {
    document.getElementById('header-user-dropdown')?.classList.toggle('open');
  }
  function closeHeaderUserMenu() {
    document.getElementById('header-user-dropdown')?.classList.remove('open');
  }

  function rolLabel(rol) {
    return { gerente: 'Administrador', oficina: 'Secretaria', trabajador: 'Técnico / Ayudante', cotizador: 'Cotizador', cliente: 'Cliente' }[rol] || rol;
  }

  async function refreshNotifBadge() {
    const notifs = await DB.getNotificacionesPendientes();
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = notifs.length > 0 ? 'block' : 'none';
  }

  /* ── HEADER BREADCRUMB ─────────────────────────────── */

  const PAGE_LABELS = {
    dashboard:         'Dashboard',
    cotizaciones:      'Cotizaciones',
    'nueva-cotizacion':'Nueva Cotización',
    'ver-cotizacion':  'Ver Cotización',
    agenda:            'Agenda',
    'estado-cuenta':   'Estado de Cuenta',
    cobros:            'Cuentas por Cobrar',
    nomina:            'Nómina y Asistencia',
    reporte:           'Mi Reporte Diario',
    supervisor:        'Equipo Hoy',
    inventario:        'Inventario',
    proyectos:         'Proyectos',
    biblioteca:        'Biblioteca de Imágenes',
    recordatorios:     'Recordatorios',
    configuracion:     'Configuración',
  };

  function updateBreadcrumb(page) {
    const el = document.getElementById('breadcrumb-current');
    if (el) el.textContent = PAGE_LABELS[page] || page;
  }

  /* ── MOBILE SIDEBAR ─────────────────────────────────── */

  function openMobileSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('open');
  }
  function closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
  }

  /* ── LOGIN / LAYOUT SWITCH ─────────────────────────── */

  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-layout').style.display  = 'none';
  }
  function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-layout').style.display  = 'flex';
  }

  /* ── CONFIRM DIALOG ─────────────────────────────────── */

  function confirm(msg) {
    return window.confirm(msg);
  }

  /* ── LOADING ─────────────────────────────────────────── */

  function showLoading(containerId, msg = 'Cargando...') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
  }

  /* ── ICON REGISTRY ─────────────────────────────────── */
  /* Using Lucide CDN — these are inlined SVG snippets */
  const icons = {
    home:          `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    fileText:      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    calendar:      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    dollarSign:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    users:         `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    clipboardList: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    activity:      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    package:       `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    briefcase:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    check:         `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    x:             `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    info:          `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    plus:          `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    trash:         `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    edit:          `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    eye:           `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    pdf:           `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    whatsapp:      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>`,
    bell:          `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    search:        `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    chevronRight:  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
    arrowLeft:     `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    logout:        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    hamburger:     `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    receipt:       `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
    image:         `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    settings:      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  };

  return {
    toast, openModal, closeModal, closeAllModals,
    buildSidebar, updateBreadcrumb, refreshNotifBadge,
    openMobileSidebar, closeMobileSidebar,
    toggleHeaderUserMenu, closeHeaderUserMenu,
    showLogin, showApp, confirm, showLoading, icons
  };
})();

window.UI = UI;
