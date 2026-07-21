/* =========================================================
   Crystal OS — app.js
   Inicialización, login handler, arranque
   ========================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  // Registrar PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW Registrado:', reg.scope))
      .catch(err => console.log('Error SW:', err));
  }

  // Inicializar DB (seed inicial si está vacía)
  await DB.seedIfEmpty();

  // Si hay sesión activa, mostrar app; si no, login
  if (Auth.isLoggedIn()) {
    UI.showApp();
    Router.init();
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
    window.startRemindersPoller();
  } else {
    UI.showLogin();
  }

  /* ── LOGIN ─────────────────────────────────────────── */

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usuario  = document.getElementById('login-usuario').value.trim();
      const password = document.getElementById('login-password').value;
      const btnLogin = document.getElementById('btn-login');
      const errEl    = document.getElementById('login-error');

      const btnOriginal = btnLogin.innerHTML;
      btnLogin.disabled = true;
      btnLogin.innerHTML = 'Ingresando…';
      errEl.textContent = '';

      const remember = document.getElementById('login-remember')?.checked || false;
      const res = await Auth.login(usuario, password, remember);
      if (res.ok) {
        UI.showApp();
        // Cotizador entra directo a cotizaciones
        if (res.user.rol === 'cotizador') {
          window.location.hash = '#/cotizaciones';
        }
        Router.init();
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
        if (!window._pollerStarted) window.startRemindersPoller();
      } else {
        errEl.textContent = res.msg;
        btnLogin.disabled = false;
        btnLogin.innerHTML = btnOriginal;
      }
    });
  }

  /* ── LOGOUT ─────────────────────────────────────────── */

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    if (window.confirm('¿Cerrar sesión?')) Auth.logout();
  });

  /* ── AVATAR DEL HEADER → CONFIGURACIÓN ────────────────── */

  document.getElementById('header-avatar')?.addEventListener('click', () => {
    Router.go('configuracion');
  });

  /* ── SIDEBAR MOBILE ─────────────────────────────────── */

  document.getElementById('btn-hamburger')?.addEventListener('click', () => {
    UI.openMobileSidebar();
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    UI.closeMobileSidebar();
  });

  document.getElementById('btn-notif')?.addEventListener('click', async () => {
    const notifs = await DB.getNotificacionesPendientes();
    if (notifs.length === 0) {
      UI.toast('Sin notificaciones pendientes', 'success');
      return;
    }
    const msg = notifs.slice(0,5).map(n => `• ${n.titulo}`).join('\n');
    alert(`Notificaciones (${notifs.length}):\n\n${msg}`);
    // Marcar como leídas
    for (const n of notifs) await DB.marcarLeida(n.id);
    UI.refreshNotifBadge();
  });

  /* ── BACKGROUND RECORDATORIOS ─────────────────────────── */

  window.startRemindersPoller = () => {
    window._pollerStarted = true;
    setInterval(async () => {
      if (!Auth.isLoggedIn()) return;
      const hm = new Date().toTimeString().slice(0,5);
      const todos = await DB.getRecordatorios();
      
      const activos = todos.filter(r => r.activo !== false && r.hora === hm && r.yaNotificado !== hm);
      
      if (activos.length > 0) {
        for (const r of activos) {
          r.yaNotificado = hm;
          await DB.saveRecordatorio(r);
          
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Crystal OS — Recordatorio', { body: r.texto });
          } else {
            setTimeout(() => alert('⏰ Recordatorio: ' + r.texto), 100);
          }
          
          try {
             const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
             audio.play().catch(()=>{});
          } catch(e) {}
          
          UI.toast('⏰ ' + r.texto, 'success');
        }
        
        if (window.location.hash === '#/recordatorios') {
          Router.init();
        }
      }
    }, 20000); // Check every 20s to ensure we don't skip a minute boundary easily
  };

  /* ── MODAL CIERRE AL HACER CLICK FUERA ──────────────── */

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
    }
  });
});
