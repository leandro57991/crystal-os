/* =========================================================
   Crystal OS — modules/dashboard.js
   Dashboard gerente: KPIs, gráfico, cobros urgentes, equipo
   ========================================================= */

Router.register('dashboard', async (view) => {
  const user   = Auth.current();
  const hoy    = new Date();
  const mesStr = hoy.toLocaleString('es-PA', { month: 'long', year: 'numeric' });
  const fechaHoy = hoy.toISOString().slice(0, 10);
  const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;

  // Datos paralelos
  const [cotizaciones, cobros, reportesHoy, trabajadores, notifs] = await Promise.all([
    DB.getCotizaciones(),
    DB.getCobros(),
    DB.getReportesByFecha(fechaHoy),
    DB.getTrabajadores(),
    DB.getNotificacionesPendientes(),
  ]);

  // KPIs
  const cotzMes    = cotizaciones.filter(c => c.fecha >= inicioMes && c.estado !== 'Borrador');
  const facturado  = cotzMes.filter(c => ['Aprobada','Pagado','Parcial'].includes(c.estado)).reduce((s,c) => s + (c.total||0), 0);
  const cobrado    = cobros.filter(c => c.fecha >= inicioMes).reduce((s,c) => s + (c.pagado||0), 0);
  const porCobrar  = cobros.filter(c => c.estado !== 'Pagado').reduce((s,c) => s + (c.saldo||0), 0);
  const sinRespuesta = cotizaciones.filter(c => c.estado === 'Enviada').length;

  // Alertas de seguimiento cotizaciones
  const alertas = [];
  for (const c of cotizaciones.filter(c => c.estado === 'Enviada' && c.fechaEnvio)) {
    const horasDiff = (Date.now() - new Date(c.fechaEnvio)) / 3600000;
    if (horasDiff >= 12 && horasDiff < 15 && !c.alerta12h) {
      alertas.push({ tipo: 'seguimiento', msg: `Seguimiento cotización #${c.numero} — ${c.clienteNombre || 'Cliente'} (12–15 hrs)`, id: c.id });
    } else if (horasDiff >= 72 && horasDiff < 96 && !c.alerta3d) {
      alertas.push({ tipo: 'seguimiento', msg: `Recordatorio cotización #${c.numero} — ${c.clienteNombre || 'Cliente'} (3 días)`, id: c.id });
    } else if (horasDiff >= 168 && horasDiff < 192 && !c.alerta1s) {
      alertas.push({ tipo: 'seguimiento', msg: `Último aviso cotización #${c.numero} — ${c.clienteNombre || 'Cliente'} (1 semana)`, id: c.id });
    }
  }

  // Cobros urgentes (vencidos o por vencer en 7 días)
  const urgentes = cobros.filter(c => c.estado !== 'Pagado' && (c.saldo||0) > 0)
    .map(c => {
      const dias = Math.floor((new Date(c.vencimiento||fechaHoy) - hoy) / 86400000);
      return { ...c, diasVence: dias };
    })
    .sort((a,b) => a.diasVence - b.diasVence)
    .slice(0, 6);

  // Últimas cotizaciones
  const ultimasCotiz = cotizaciones.slice(0, 5);

  // Facturación últimos 6 meses (para gráfico)
  const meses6 = [];
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth()+1).padStart(2,'0');
    const ini = `${yr}-${mo}-01`;
    const fin = `${yr}-${mo}-31`;
    const total = cotizaciones
      .filter(c => c.fecha >= ini && c.fecha <= fin && ['Aprobada','Pagado','Parcial'].includes(c.estado))
      .reduce((s,c) => s + (c.total||0), 0);
    meses6.push({ mes: d.toLocaleString('es-PA',{month:'short'}), total });
  }
  const maxBar = Math.max(...meses6.map(m => m.total), 100);

  // Equipo hoy
  const trabajadoresConReporte = reportesHoy.map(r => r.trabajadorId);

  view.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Buenos días, ${user?.nombre?.split(' ')[0] || 'Admin'}</div>
        <div class="page-subtitle">Resumen del día — ${hoy.toLocaleDateString('es-PA',{weekday:'long',day:'numeric',month:'long'})}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="Router.go('nueva-cotizacion')">
          ${UI.icons.plus} Nueva cotización
        </button>
      </div>
    </div>

    ${alertas.length > 0 ? `
    <div class="card" style="margin-bottom:20px;border-left:4px solid var(--amber);background:#FFFBEB;">
      <div class="card-title" style="color:var(--amber);margin-bottom:10px;">Seguimiento pendiente (${alertas.length})</div>
      ${alertas.map(a => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #FEF3C7;font-size:13px;">
          ${UI.icons.bell} <span>${a.msg}</span>
          <a href="https://wa.me/507" target="_blank" class="btn btn-sm btn-whatsapp" style="margin-left:auto;">
            ${UI.icons.whatsapp} Escribir
          </a>
        </div>`).join('')}
    </div>` : ''}

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-icon">${UI.icons.dollarSign}</div>
        <div class="kpi-label">Facturado este mes</div>
        <div class="kpi-value">${fmt(facturado)}</div>
        <div class="kpi-trend">${mesStr}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:#DCFCE7;color:#16A34A;">${UI.icons.check}</div>
        <div class="kpi-label">Cobrado este mes</div>
        <div class="kpi-value">${fmt(cobrado)}</div>
        <div class="kpi-trend">${mesStr}</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-icon">${UI.icons.activity}</div>
        <div class="kpi-label">Por cobrar</div>
        <div class="kpi-value">${fmt(porCobrar)}</div>
        <div class="kpi-trend">Saldo pendiente</div>
      </div>
      <div class="kpi-card neutral">
        <div class="kpi-icon">${UI.icons.fileText}</div>
        <div class="kpi-label">Cotizaciones sin respuesta</div>
        <div class="kpi-value" style="font-size:30px;">${sinRespuesta}</div>
        <div class="kpi-trend">Estado: Enviada</div>
      </div>
    </div>

    <!-- Gráfico + Cobros urgentes -->
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:16px;margin-bottom:24px;" class="dash-middle">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Facturación últimos 6 meses</div>
        </div>
        <div class="bar-chart">
          ${meses6.map(m => {
            const h = maxBar > 0 ? Math.max(4, (m.total / maxBar) * 100) : 4;
            return `
              <div class="bar-col">
                <div class="bar-col-val">${m.total > 0 ? '$'+Math.round(m.total/1000)+'k' : ''}</div>
                <div class="bar-fill" style="height:${h}%" title="${fmt(m.total)}"></div>
                <div class="bar-col-label">${m.mes}</div>
              </div>`;
          }).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Cobros urgentes</div>
          <button class="btn btn-sm btn-ghost" onclick="Router.go('cobros')">Ver todos</button>
        </div>
        ${urgentes.length === 0
          ? '<div class="table-empty">Sin cobros pendientes</div>'
          : urgentes.map(c => {
              const badge = c.diasVence < 0 ? 'badge-danger' : c.diasVence <= 7 ? 'badge-amber' : 'badge-success';
              const label = c.diasVence < 0 ? `${Math.abs(c.diasVence)}d vencido` : `${c.diasVence}d restantes`;
              return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.clienteNombre||'—'}</div>
                  <div style="color:var(--text-gray);">${fmt(c.saldo||0)}</div>
                </div>
                <span class="badge ${badge}">${label}</span>
              </div>`;
            }).join('')
        }
      </div>
    </div>

    <!-- Últimas cotizaciones + Equipo hoy -->
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:16px;" class="dash-bottom">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Últimas cotizaciones</div>
          <button class="btn btn-sm btn-ghost" onclick="Router.go('cotizaciones')">Ver todas</button>
        </div>
        <table class="table">
          <thead><tr>
            <th>#</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th>
          </tr></thead>
          <tbody>
            ${ultimasCotiz.length === 0
              ? `<tr><td colspan="5" class="table-empty">Sin cotizaciones aún</td></tr>`
              : ultimasCotiz.map(c => `<tr onclick="Router.go('ver-cotizacion',{id:'${c.id}'})" style="cursor:pointer;">
                  <td><strong>#${c.numero}</strong></td>
                  <td>${c.clienteNombre||'—'}</td>
                  <td>${fmt(c.total||0)}</td>
                  <td>${estadoBadge(c.estado)}</td>
                  <td style="color:var(--text-gray);">${c.fecha||'—'}</td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Equipo hoy</div>
          <button class="btn btn-sm btn-ghost" onclick="Router.go('supervisor')">Ver reportes</button>
        </div>
        ${trabajadores.length === 0
          ? '<div class="table-empty">Sin trabajadores</div>'
          : trabajadores.map(t => {
              const reporto = trabajadoresConReporte.includes(t.id);
              return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
                <div class="avatar" style="width:32px;height:32px;font-size:12px;">${t.nombre[0]}</div>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:600;">${t.nombre}</div>
                  <div style="font-size:11px;color:var(--text-gray);">${t.rol}</div>
                </div>
                <span class="badge ${reporto ? 'badge-success' : 'badge-gray'}">${reporto ? 'Reportó' : 'Sin reporte'}</span>
              </div>`;
            }).join('')
        }
      </div>
    </div>
  `;

  // Responsive: stack columns on narrow screens
  const style = `
    @media(max-width:900px){.dash-middle,.dash-bottom{grid-template-columns:1fr!important}}
  `;
  if (!document.getElementById('dash-style')) {
    const s = document.createElement('style');
    s.id = 'dash-style'; s.textContent = style;
    document.head.appendChild(s);
  }
});

/* helpers */
function fmt(n) {
  return '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function estadoBadge(estado) {
  const map = {
    'Borrador':       'badge-gray',
    'Pendiente':      'badge-amber',
    'En negociación': 'badge-blue',
    'Aprobada':       'badge-success',
    'Aprobado':       'badge-success',
    'Abonado':        'badge-blue',
    'Completado':     'badge-success',
    'Cancelado':      'badge-danger',
    'Rechazada':      'badge-danger',
    'Perdida':        'badge-danger',
    'Enviada':        'badge-amber',
    'Pagado':         'badge-success',
    'Parcial':        'badge-amber',
  };
  return `<span class="badge ${map[estado]||'badge-gray'}">${estado||'—'}</span>`;
}

window.fmt = fmt;
window.estadoBadge = estadoBadge;
