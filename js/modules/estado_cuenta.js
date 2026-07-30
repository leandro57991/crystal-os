/* =========================================================
   Crystal OS — modules/estado_cuenta.js
   Estado de cuenta por cliente: proyectos + abonos + saldo
   Formato basado en el Excel de referencia de Crystal Services
   ========================================================= */

Router.register('estado-cuenta', async (view) => {
  let busqueda    = '';
  let pagina      = 1;
  let porPagina   = 15;
  let filtroEstado= 'Todos'; // Todos | Pendiente | AlDia | Favor
  let fechaDesde  = '';
  let fechaHasta  = '';
  let clienteDetalleAbierto = null; // nombre del cliente cuyo panel de detalle está abierto (o null)

  async function buildClientData() {
    const [cobros, pagos, cotizaciones] = await Promise.all([
      DB.getCobros(),
      DB.getAll('pagos'),
      DB.getCotizaciones(),
    ]);

    // Cotizaciones Abonadas/Pagadas/Canceladas que todavía no tienen un cobro
    // real asociado (p.ej. una cotización marcada Cancelada nunca dispara el
    // flujo de abono) se muestran igual, como filas "virtuales" derivadas de
    // la cotización — para que el Estado de Cuenta refleje todo, no solo lo
    // que ya se sincronizó a mano.
    const cotizacionesConCobro = new Set(cobros.filter(c => c.cotizacionId).map(c => c.cotizacionId));
    const virtuales = cotizaciones
      .filter(cot => ['Abonado','Pagado','Cancelada'].includes(cot.estado) && !cotizacionesConCobro.has(cot.id))
      .map(cot => {
        const pagado = cot.estado === 'Cancelada' ? (cot.montoAbono || 0) : (cot.montoAbono || 0);
        return {
          id: null,
          cotizacionId: cot.id,
          virtual: true,
          clienteNombre: cot.clienteNombre,
          telefono: cot.clienteTel || '',
          factura: '#' + cot.numero,
          notas: cot.notas || `Cotización #${cot.numero}`,
          nota: cot.estado === 'Cancelada' ? 'Cancelada — no cuenta como saldo pendiente' : '',
          total: cot.total || 0,
          pagado,
          // Una cotización cancelada no genera cobro pendiente real.
          saldo: cot.estado === 'Cancelada' ? 0 : (cot.total || 0) - pagado,
          estado: cot.estado === 'Cancelada' ? 'Cancelada' : (cot.estado === 'Pagado' ? 'Pagado' : 'Parcial'),
          fecha: cot.fecha,
          vencimiento: '',
        };
      });

    const todos = [...cobros, ...virtuales];

    // Agrupar por cliente
    const porCliente = {};
    todos.forEach(c => {
      const key = (c.clienteNombre || '—').trim();
      if (!porCliente[key]) porCliente[key] = { nombre: key, telefono: '', cobros: [], totalFacturado: 0, totalAbonado: 0 };
      if (!porCliente[key].telefono && c.telefono) porCliente[key].telefono = c.telefono;
      const pagosCobro = c.virtual ? [] : pagos.filter(p => p.cobroId === c.id);
      const abonado = c.virtual ? (c.pagado || 0) : pagosCobro.reduce((s, p) => s + (p.monto || 0), 0);
      porCliente[key].cobros.push({ ...c, pagosDetalle: pagosCobro.sort((a,b)=>a.fecha.localeCompare(b.fecha)), abonadoReal: abonado });
      // Las canceladas no suman al total facturado/por cobrar de la cartera.
      if (c.estado !== 'Cancelada') {
        porCliente[key].totalFacturado += (c.total || 0);
        porCliente[key].totalAbonado   += abonado;
      }
    });

    return Object.values(porCliente).sort((a,b) => a.nombre.localeCompare(b.nombre));
  }

  async function render() {
    const [clientes, pagos] = await Promise.all([buildClientData(), DB.getAll('pagos')]);

    const cont = document.getElementById('ec-content');
    if (!cont) return;

    // KPIs globales (snapshot actual, no dependen del rango de fecha)
    const totalCartera  = clientes.reduce((s,c)=>s+(c.totalFacturado-c.totalAbonado),0);
    const totalPendientes = clientes.filter(c=>(c.totalFacturado-c.totalAbonado)>0.01).length;

    // Rango de fecha: si no se eligió nada, el KPI de "generado" usa el mes
    // actual por defecto (igual a como se ve normalmente un estado de cuenta).
    const hoy = new Date().toISOString().slice(0,10);
    const inicioMes = hoy.slice(0,7) + '-01';
    const rangoDesde = fechaDesde || inicioMes;
    const rangoHasta = fechaHasta || hoy;
    const rangoActivo = !!(fechaDesde || fechaHasta);
    const rangoLabel = rangoActivo ? 'en el período' : 'este mes';

    let generadoPeriodo = 0;
    clientes.forEach(cl => cl.cobros.forEach(c => {
      if (c.estado === 'Cancelada') return;
      const f = c.fecha || (c.creadoEn||'').slice(0,10);
      if (f && f >= rangoDesde && f <= rangoHasta) generadoPeriodo += (c.total||0);
    }));
    const cobradoPeriodo = pagos.reduce((s,p) => (p.fecha && p.fecha >= rangoDesde && p.fecha <= rangoHasta) ? s + (p.monto||0) : s, 0);

    // Clasificación por cliente (para el filtro de estado y la dona de saldos)
    const clasificar = (cl) => {
      const s = cl.totalFacturado - cl.totalAbonado;
      if (s > 0.01) return 'Pendiente';
      if (s < -0.01) return 'Favor';
      return 'AlDia';
    };
    const pendCount  = clientes.filter(c=>clasificar(c)==='Pendiente').length;
    const favorCount = clientes.filter(c=>clasificar(c)==='Favor').length;
    const aldiaCount = clientes.length - pendCount - favorCount;
    const favorTotal = clientes.reduce((s,c)=>{ const v=c.totalFacturado-c.totalAbonado; return v<-0.01? s+Math.abs(v) : s; },0);
    const totalDona  = clientes.length || 1;
    const pctPend  = pendCount/totalDona*100, pctFavor = favorCount/totalDona*100;

    // Próximos cobros: cualquier cobro con vencimiento y saldo pendiente real
    const proximos = [];
    clientes.forEach(cl => cl.cobros.forEach(c => {
      const saldo = c.total - (c.abonadoReal||0);
      if (c.vencimiento && saldo > 0.01 && c.estado !== 'Cancelada') {
        proximos.push({ cliente: cl.nombre, factura: c.factura, saldo, vencimiento: c.vencimiento });
      }
    }));
    proximos.sort((a,b)=>a.vencimiento.localeCompare(b.vencimiento));
    const proximosTop = proximos.slice(0,5);

    // Filtro visible: búsqueda + estado + rango de fecha (si se eligió uno)
    let lista = clientes;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(c => c.nombre.toLowerCase().includes(q));
    }
    if (filtroEstado !== 'Todos') lista = lista.filter(c => clasificar(c) === filtroEstado);
    if (rangoActivo) {
      lista = lista.filter(cl => cl.cobros.some(c => {
        const f = c.fecha || (c.creadoEn||'').slice(0,10);
        return f && f >= rangoDesde && f <= rangoHasta;
      }));
    }

    const pag = UI.paginar(lista, pagina, porPagina);
    pagina = pag.pagina;

    cont.innerHTML = `
      <div class="stats-row" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:20px;">
        <div class="stat-pill">
          <div class="stat-num">${clientes.length}</div>
          <div class="stat-lbl">Clientes en cartera</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--amber);">${totalPendientes}</div>
          <div class="stat-lbl">Con saldo pendiente</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--danger);">${fmt(totalCartera)}</div>
          <div class="stat-lbl">Total por cobrar</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--success);">${fmt(generadoPeriodo)}</div>
          <div class="stat-lbl">Generado ${rangoLabel}</div>
        </div>
      </div>

      <div class="filter-bar" style="margin-bottom:16px;flex-wrap:wrap;">
        <div class="filter-search">${UI.icons.search}
          <input id="ec-search" type="text" placeholder="Buscar cliente…" value="${busqueda}">
        </div>
        <select id="ec-filtro-estado" class="form-select" style="width:150px;" onchange="window._ecFiltroEstado(this.value)">
          <option value="Todos" ${filtroEstado==='Todos'?'selected':''}>Todos los estados</option>
          <option value="Pendiente" ${filtroEstado==='Pendiente'?'selected':''}>Pendiente</option>
          <option value="AlDia" ${filtroEstado==='AlDia'?'selected':''}>Al día</option>
          <option value="Favor" ${filtroEstado==='Favor'?'selected':''}>A favor</option>
        </select>
        <input type="date" id="ec-desde" class="form-input" style="width:150px;" value="${fechaDesde}" onchange="window._ecFecha('desde',this.value)" title="Desde">
        <input type="date" id="ec-hasta" class="form-input" style="width:150px;" value="${fechaHasta}" onchange="window._ecFecha('hasta',this.value)" title="Hasta">
        ${rangoActivo ? `<button class="btn btn-sm btn-outline" onclick="window._ecFecha('clear')">Limpiar fechas</button>` : ''}
        <button class="btn btn-primary btn-sm" onclick="window._abrirNuevoCobroEC()">
          ${UI.icons.plus} Nuevo cobro
        </button>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;align-items:start;">
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="table-wrapper">
            <table class="table">
              <thead><tr><th>Cliente</th><th>Proyectos</th><th>Último pago</th><th>Saldo</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                ${lista.length === 0
                  ? `<tr><td colspan="6" class="table-empty">Sin clientes para este filtro</td></tr>`
                  : pag.items.map(cl => {
                      const saldoTotal = cl.totalFacturado - cl.totalAbonado;
                      const est = clasificar(cl);
                      const badge = est==='Pendiente'?'badge-amber':est==='Favor'?'badge-blue':'badge-success';
                      const lbl   = est==='Pendiente'?'Pendiente':est==='Favor'?'A favor':'Al día';
                      const ultimoPago = cl.cobros.flatMap(c=>c.pagosDetalle).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0];
                      return `<tr style="cursor:pointer;" onclick="window._verDetalleClienteEC('${cl.nombre.replace(/'/g,"\\'")}')">
                        <td>
                          <div style="display:flex;align-items:center;gap:10px;">
                            <div class="avatar" style="width:32px;height:32px;font-size:13px;background:var(--green-soft);color:var(--green-main);">${cl.nombre[0].toUpperCase()}</div>
                            <div>
                              <div style="font-weight:600;">${cl.nombre}</div>
                              ${cl.telefono ? `<div style="font-size:11px;color:var(--text-gray);">${cl.telefono}</div>` : ''}
                            </div>
                          </div>
                        </td>
                        <td>${cl.cobros.length}</td>
                        <td style="color:var(--text-gray);">${ultimoPago ? ultimoPago.fecha : '—'}</td>
                        <td style="font-weight:700;color:${saldoTotal>0.01?'var(--danger)':saldoTotal<-0.01?'var(--success)':'var(--text-gray)'};">${fmt(saldoTotal)}</td>
                        <td><span class="badge ${badge}">${lbl}</span></td>
                        <td onclick="event.stopPropagation();">
                          <button class="btn btn-sm btn-secondary" title="PDF" onclick="generarPDFEstadoCuenta('${cl.nombre.replace(/'/g,"\\'")}')">${UI.icons.pdf}</button>
                        </td>
                      </tr>`;
                    }).join('')
                }
              </tbody>
            </table>
          </div>
          <div style="padding:12px 16px;" id="ec-pagination">${UI.paginacionHTML(pag, 'window._ecPagina', 'window._ecPorPagina')}</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="card">
            <div style="font-weight:700;margin-bottom:14px;">Resumen de saldos</div>
            <div style="display:flex;align-items:center;gap:16px;">
              <div style="width:110px;height:110px;flex-shrink:0;border-radius:50%;background:conic-gradient(var(--danger) 0% ${pctPend}%, var(--green-main) ${pctPend}% ${pctPend+pctFavor}%, var(--green-soft) ${pctPend+pctFavor}% 100%);display:flex;align-items:center;justify-content:center;">
                <div style="width:66px;height:66px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                  <div style="font-size:9px;color:var(--text-gray);">Total</div>
                  <div style="font-size:12px;font-weight:700;">${fmt(totalCartera)}</div>
                </div>
              </div>
              <div style="font-size:12px;flex:1;">
                <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--danger);margin-right:6px;"></span>Por cobrar</span><strong>${fmt(totalCartera)}</strong></div>
                <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green-main);margin-right:6px;"></span>A favor</span><strong>${fmt(favorTotal)}</strong></div>
                <div style="display:flex;justify-content:space-between;gap:8px;"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green-soft);margin-right:6px;"></span>Al día</span><strong>${aldiaCount}</strong></div>
              </div>
            </div>
          </div>

          <div class="card">
            <div style="font-weight:700;margin-bottom:12px;">Cobrado vs. pendiente <span style="font-weight:400;color:var(--text-gray);font-size:12px;">(${rangoLabel})</span></div>
            <div style="margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>Cobrado</span><strong style="color:var(--success);">${fmt(cobradoPeriodo)}</strong></div>
              <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${Math.min(100,(cobradoPeriodo/((cobradoPeriodo+totalCartera)||1))*100)}%;background:var(--success);"></div></div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>Pendiente (total)</span><strong style="color:var(--danger);">${fmt(totalCartera)}</strong></div>
              <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${Math.min(100,(totalCartera/((cobradoPeriodo+totalCartera)||1))*100)}%;background:var(--danger);"></div></div>
            </div>
          </div>

          <div class="card">
            <div style="font-weight:700;margin-bottom:12px;">Próximos cobros</div>
            ${proximosTop.length === 0
              ? `<p style="color:var(--text-gray);font-size:13px;">Sin vencimientos próximos registrados.</p>`
              : proximosTop.map(p => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                  <div>
                    <div style="font-weight:600;font-size:13px;">${p.cliente}</div>
                    <div style="font-size:11px;color:var(--text-gray);">${p.factura||''}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;color:var(--danger);font-size:13px;">${fmt(p.saldo)}</div>
                    <div style="font-size:11px;color:var(--text-gray);">Vence: ${p.vencimiento}</div>
                  </div>
                </div>`).join('')
            }
          </div>
        </div>
      </div>
    `;

    document.getElementById('ec-search')?.addEventListener('input', e => { busqueda = e.target.value; pagina = 1; render(); });
  }

  window._ecPagina = (n) => { pagina = n; render(); };
  window._ecPorPagina = (n) => { porPagina = parseInt(n); pagina = 1; render(); };
  window._ecFiltroEstado = (v) => { filtroEstado = v; pagina = 1; render(); };
  window._ecFecha = (cual, valor) => {
    if (cual === 'clear') { fechaDesde = ''; fechaHasta = ''; }
    else if (cual === 'desde') fechaDesde = valor;
    else if (cual === 'hasta') fechaHasta = valor;
    pagina = 1;
    render();
  };

  // Abre el panel de detalle de un cliente (proyectos, abonos, editar/eliminar)
  // en un modal, en vez de expandir la fila como antes.
  window._verDetalleClienteEC = async (nombre) => {
    const clientes = await buildClientData();
    const cl = clientes.find(c => c.nombre === nombre);
    if (!cl) { UI.toast('Cliente no encontrado', 'error'); return; }
    clienteDetalleAbierto = nombre;
    document.getElementById('ec-detalle-titulo').textContent = nombre;
    document.getElementById('ec-detalle-body').innerHTML = renderDetalleCliente(cl);
    UI.openModal('modal-detalle-cliente-ec');
  };

  window._cerrarDetalleClienteEC = () => {
    clienteDetalleAbierto = null;
    UI.closeModal('modal-detalle-cliente-ec');
  };

  // Si el panel de detalle está abierto cuando se registra un pago o se
  // edita/elimina un cobro, lo refresca para no dejarlo con datos viejos.
  async function refrescarDetalleSiAbierto() {
    if (clienteDetalleAbierto) await window._verDetalleClienteEC(clienteDetalleAbierto);
  }

  function renderDetalleCliente(cl) {
    const saldoTotal = cl.totalFacturado - cl.totalAbonado;
    // Recopilar todos los pagos con fecha para la sección de abonos
    const todosLosPagos = [];
    cl.cobros.forEach(c => {
      c.pagosDetalle.forEach(p => todosLosPagos.push({ fecha: p.fecha, monto: p.monto, metodo: p.metodo, proyecto: c.factura || c.clienteNombre }));
    });
    todosLosPagos.sort((a,b)=>a.fecha.localeCompare(b.fecha));

    return `
      <!-- Tabla de proyectos -->
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-gray);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Proyectos / Facturas</div>
        <table class="table">
          <thead><tr>
            <th>Factura / Ref.</th><th>Descripción</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Estado</th><th>Acción</th>
          </tr></thead>
          <tbody>
            ${cl.cobros.map(c => {
              const saldo = c.total - (c.abonadoReal || 0);
              const esCancelada = c.estado === 'Cancelada';
              const st  = esCancelada ? 'badge-gray' : (saldo <= 0.01 ? 'badge-success' : 'badge-amber');
              const lbl = esCancelada ? 'Cancelada' : (saldo <= 0.01 ? 'Pagado' : 'Pendiente');
              return `<tr${esCancelada ? ' style="opacity:.65;"' : ''}>
                <td><strong>${c.factura||'—'}</strong>${c.virtual ? '<div style="font-size:10px;color:var(--text-gray);">Desde cotización</div>' : ''}</td>
                <td>${c.notas||'—'}${c.nota ? `<div style="font-size:11px;color:var(--amber);margin-top:2px;">${c.nota}</div>` : ''}</td>
                <td>${(typeof fmtTotal === 'function' ? fmtTotal : fmt)(c.total||0)}</td>
                <td style="color:var(--success);">${fmt(c.abonadoReal||0)}</td>
                <td style="font-weight:700;color:${esCancelada?'var(--text-gray)':(saldo>0?'var(--danger)':'var(--success)')};">${esCancelada?'—':fmt(saldo)}</td>
                <td><span class="badge ${st}">${lbl}</span></td>
                <td>
                  ${c.virtual
                    ? `<button class="btn btn-sm btn-outline" onclick="Router.go('ver-cotizacion',{id:'${c.cotizacionId}'})">${UI.icons.eye} Ver cotización</button>`
                    : `<div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button class="btn btn-sm btn-primary" onclick="abrirModalPagoEC('${c.id}','${(c.clienteNombre||'').replace(/'/g,"\\'")}','${fmt(saldo)}')">
                          + Pago
                        </button>
                        <button class="btn btn-sm btn-outline" title="Editar" onclick="editarCobroEC('${c.id}')">${UI.icons.edit}</button>
                        <button class="btn btn-sm btn-outline" style="color:var(--danger);" title="Eliminar" onclick="eliminarCobroEC('${c.id}','${(c.factura||c.clienteNombre||'este registro').replace(/'/g,"\\'")}')">${UI.icons.trash}</button>
                      </div>`}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--green-light);font-weight:700;">
              <td colspan="2">TOTAL</td>
              <td>${fmt(cl.totalFacturado)}</td>
              <td style="color:var(--success);">${fmt(cl.totalAbonado)}</td>
              <td style="color:${saldoTotal>0?'var(--danger)':'var(--success)'};">${fmt(saldoTotal)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Historial de abonos -->
      ${todosLosPagos.length > 0 ? `
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--text-gray);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Historial de abonos</div>
          <table class="table">
            <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th></tr></thead>
            <tbody>
              ${todosLosPagos.map(p=>`<tr>
                <td>${p.fecha}</td>
                <td style="font-weight:600;color:var(--success);">${fmt(p.monto)}</td>
                <td>${p.metodo||'—'}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="background:var(--green-light);font-weight:700;">
                <td>Total abonado</td>
                <td style="color:var(--success);">${fmt(cl.totalAbonado)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>` : ''}

      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-secondary btn-sm" onclick="generarPDFEstadoCuenta('${cl.nombre.replace(/'/g,"\\'")}')">
          ${UI.icons.pdf} Generar estado de cuenta PDF
        </button>
        <button class="btn btn-outline btn-sm" onclick="window._abrirNuevoCobroEC();document.getElementById('nc-cliente-ec').value='${cl.nombre.replace(/'/g,"\\'")}'">
          ${UI.icons.plus} Agregar proyecto
        </button>
      </div>
    `;
  }

  window.abrirModalPagoEC = (cobroId, nombre, saldo) => {
    document.getElementById('pago-cobro-id-ec').value = cobroId;
    document.getElementById('pago-nombre-ec').textContent = nombre;
    document.getElementById('pago-saldo-ec').textContent  = saldo;
    document.getElementById('pago-monto-ec').value  = '';
    document.getElementById('pago-fecha-ec').value  = new Date().toISOString().slice(0,10);
    document.getElementById('pago-metodo-ec').value = 'Efectivo';
    document.getElementById('pago-notas-ec').value  = '';
    UI.openModal('modal-pago-ec');
  };

  window.registrarPagoEC = async () => {
    const cobroId = document.getElementById('pago-cobro-id-ec').value;
    const monto   = parseFloat(document.getElementById('pago-monto-ec').value);
    const fecha   = document.getElementById('pago-fecha-ec').value;
    const metodo  = document.getElementById('pago-metodo-ec').value;
    const notas   = document.getElementById('pago-notas-ec').value;
    if (!monto || monto <= 0) { UI.toast('Ingresa un monto válido', 'error'); return; }
    await DB.registrarPago(cobroId, monto, fecha, metodo, notas);
    UI.closeModal('modal-pago-ec');
    UI.toast(`Abono de ${fmt(monto)} registrado`, 'success');
    await render();
    await refrescarDetalleSiAbierto();
  };

  // Deja el modal listo para crear un cobro nuevo (limpia el modo edición
  // por si quedó abierto de una edición anterior).
  window._abrirNuevoCobroEC = () => {
    document.getElementById('nc-id-ec').value = '';
    document.getElementById('nc-modal-title-ec').textContent = 'Nuevo Proyecto / Cobro';
    document.getElementById('nc-abono-inicial-row-ec').style.display = '';
    ['nc-cliente-ec','nc-telefono-ec','nc-factura-ec','nc-vencimiento-ec','nc-desc-ec','nc-nota-ec','nc-total-ec','nc-pagado-ec']
      .forEach(id => document.getElementById(id).value = '');
    UI.openModal('modal-nuevo-cobro-ec');
  };

  // Abre el mismo modal en modo edición, precargado con el cobro existente.
  // El abono inicial no se toca aquí — los pagos se registran/editan aparte
  // con el botón "+ Pago", para no desincronizar el total abonado real.
  window.editarCobroEC = async (id) => {
    const c = await DB.getOne('cobros', id);
    if (!c) { UI.toast('Registro no encontrado', 'error'); return; }
    document.getElementById('nc-id-ec').value = id;
    document.getElementById('nc-modal-title-ec').textContent = 'Editar Proyecto / Cobro';
    document.getElementById('nc-abono-inicial-row-ec').style.display = 'none';
    document.getElementById('nc-cliente-ec').value    = c.clienteNombre || '';
    document.getElementById('nc-telefono-ec').value   = c.telefono || '';
    document.getElementById('nc-factura-ec').value    = c.factura || '';
    document.getElementById('nc-vencimiento-ec').value= c.vencimiento || '';
    document.getElementById('nc-desc-ec').value       = c.notas || '';
    document.getElementById('nc-nota-ec').value        = c.nota || '';
    document.getElementById('nc-total-ec').value       = c.total || 0;
    UI.openModal('modal-nuevo-cobro-ec');
  };

  window.eliminarCobroEC = async (id, label) => {
    if (!confirm(`¿Eliminar "${label}"? Esto borra también su historial de abonos. Esta acción no se puede deshacer.`)) return;
    await DB.deleteCobro(id);
    UI.toast('Registro eliminado', 'success');
    await render();
    await refrescarDetalleSiAbierto();
  };

  window.guardarNuevoCobroEC = async () => {
    const id = document.getElementById('nc-id-ec').value;
    const data = {
      clienteNombre: document.getElementById('nc-cliente-ec').value,
      telefono:      document.getElementById('nc-telefono-ec').value,
      factura:       document.getElementById('nc-factura-ec').value,
      notas:         document.getElementById('nc-desc-ec').value,
      nota:          document.getElementById('nc-nota-ec').value,
      total:         parseFloat(document.getElementById('nc-total-ec').value)||0,
      vencimiento:   document.getElementById('nc-vencimiento-ec').value,
    };
    if (!data.clienteNombre) { UI.toast('Nombre del cliente requerido', 'error'); return; }

    if (id) {
      // Edición: mantiene lo ya abonado/estado tal cual, solo cambian los
      // datos editables (el abono se maneja aparte con "+ Pago").
      const existente = await DB.getOne('cobros', id);
      const pagado = existente?.pagado || 0;
      data.id     = id;
      data.pagado = pagado;
      data.saldo  = data.total - pagado;
      data.estado = data.saldo <= 0.01 ? 'Pagado' : pagado > 0 ? 'Parcial' : 'Pendiente';
      await DB.saveCobro(data);
      UI.toast('Cobro actualizado', 'success');
    } else {
      data.pagado = parseFloat(document.getElementById('nc-pagado-ec').value)||0;
      data.saldo  = data.total - data.pagado;
      data.estado = data.saldo <= 0.01 ? 'Pagado' : data.pagado > 0 ? 'Parcial' : 'Pendiente';
      const cobro = await DB.saveCobro(data);
      // Si hubo un pago inicial, registrarlo como abono
      if (data.pagado > 0) {
        await DB.save('pagos', {
          cobroId: cobro.id,
          monto:   data.pagado,
          fecha:   new Date().toISOString().slice(0,10),
          metodo:  document.getElementById('nc-metodo-ec').value || 'Efectivo',
          notas:   'Abono inicial',
        });
      }
      UI.toast('Cobro registrado', 'success');
    }

    UI.closeModal('modal-nuevo-cobro-ec');
    await render();
    await refrescarDetalleSiAbierto();
  };

  /* ── PDF Estado de Cuenta ─────────────────────────────── */

  // Helpers de dibujo para los íconos/insignias del diseño (sin depender de
  // emojis ni fuentes con glifos especiales — todo son formas vectoriales).
  function _polar(cx, cy, r, angDeg) {
    const rad = angDeg * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function _drawCheckBadge(doc, cx, cy, r, bgColor) {
    doc.setFillColor(...bgColor);
    doc.circle(cx, cy, r, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(Math.max(0.5, r * 0.16));
    doc.line(cx - r * 0.45, cy, cx - r * 0.05, cy + r * 0.4);
    doc.line(cx - r * 0.05, cy + r * 0.4, cx + r * 0.5, cy - r * 0.35);
  }

  function _drawIconBadge(doc, cx, cy, r, bgColor, glyph) {
    doc.setFillColor(...bgColor);
    doc.circle(cx, cy, r, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(r * 1.15);
    doc.text(glyph, cx, cy + r * 0.35, { align: 'center' });
  }

  function _drawRing(doc, cx, cy, r, pct, colorDone, colorRemain, lineWidth) {
    const steps = 72;
    doc.setLineWidth(lineWidth);
    doc.setDrawColor(...colorRemain);
    let prev = _polar(cx, cy, r, -90);
    for (let i = 1; i <= steps; i++) {
      const pt = _polar(cx, cy, r, -90 + (360 * i / steps));
      doc.line(prev.x, prev.y, pt.x, pt.y);
      prev = pt;
    }
    const sweep = 360 * Math.min(Math.max(pct, 0), 100) / 100;
    if (sweep > 0) {
      doc.setDrawColor(...colorDone);
      const stepsFg = Math.max(2, Math.round(steps * sweep / 360));
      prev = _polar(cx, cy, r, -90);
      for (let i = 1; i <= stepsFg; i++) {
        const pt = _polar(cx, cy, r, -90 + (sweep * i / stepsFg));
        doc.line(prev.x, prev.y, pt.x, pt.y);
        prev = pt;
      }
    }
  }

  window.generarPDFEstadoCuenta = async (nombreCliente) => {
    if (typeof window.jspdf === 'undefined') {
      UI.toast('Librería PDF no cargada. Verifica tu conexión.', 'error'); return;
    }

    const clientes = await buildClientData();
    const cl = clientes.find(c => c.nombre === nombreCliente);
    if (!cl) { UI.toast('Cliente no encontrado', 'error'); return; }

    const saldoTotal = cl.totalFacturado - cl.totalAbonado;
    const pctPagado  = cl.totalFacturado > 0 ? (cl.totalAbonado / cl.totalFacturado) * 100 : 0;
    const estado     = saldoTotal <= 0.01 ? 'PAGADO' : (cl.totalAbonado > 0 ? 'ABONADO' : 'PENDIENTE');
    const colorEstado = estado === 'PAGADO' ? [34, 197, 94] : estado === 'ABONADO' ? [245, 158, 11] : [239, 68, 68];
    const bgEstado     = estado === 'PAGADO' ? [220, 252, 231] : estado === 'ABONADO' ? [254, 243, 199] : [254, 226, 226];

    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W     = 215.9;
    const H     = 279.4;
    const ML    = 15;
    const MR    = W - 15;
    const green = [31, 122, 60];
    const hoy   = new Date().toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' });

    /* ── Franja superior ── */
    doc.setFillColor(...green);
    doc.rect(0, 0, W, 3, 'F');

    /* ── Header: logo + datos empresa | título + fecha + estado ── */
    const logoBase64 = window.PDF_ASSETS?.logo || null;
    let logoRatio = 903 / 462;
    let logoW = 26 * logoRatio;
    if (logoBase64) {
      try {
        const props = doc.getImageProperties(logoBase64);
        if (props?.width && props?.height) logoRatio = props.width / props.height;
        logoW = 24 * logoRatio;
        doc.addImage(logoBase64, 'PNG', ML, 8, logoW, 24);
      } catch (e) { logoW = 0; }
    }

    const xInfo = ML + logoW + 8;
    doc.setTextColor(26, 26, 26);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
    const nombreEmpresa = 'CRYSTAL SERVICE PANAMÁ';
    doc.text(nombreEmpresa, xInfo, 15);
    const anchoNombreEmpresa = doc.getTextWidth(nombreEmpresa);
    doc.setTextColor(...green);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text('ALUMINIO  •  VIDRIO  •  MANTENIMIENTO', xInfo, 20);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text('Tel: 6456-2658', xInfo, 26);
    doc.text('crystalservicejj@gmail.com', xInfo, 31);
    doc.text('San Miguelito, Ciudad de Panamá', xInfo, 36);

    const xDiv = Math.max(125, xInfo + anchoNombreEmpresa + 6);
    doc.setDrawColor(209, 232, 217);
    doc.setLineWidth(0.3);
    doc.line(xDiv, 8, xDiv, 38);

    const xRight = xDiv + 8;
    doc.setTextColor(26, 26, 26);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text('ESTADO', xRight, 15);
    doc.text('DE CUENTA', xRight, 23);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Fecha de emisión:', xRight, 29);
    doc.setTextColor(26, 26, 26);
    doc.setFont('helvetica', 'bold');
    doc.text(hoy, xRight, 33.5);

    // Insignia de estado actual
    const badgeY = 35.5, badgeH = 8;
    doc.setFillColor(...bgEstado);
    doc.roundedRect(xRight, badgeY, MR - xRight, badgeH, 2, 2, 'F');
    _drawCheckBadge(doc, xRight + 5, badgeY + badgeH / 2, 2.6, colorEstado);
    doc.setTextColor(...colorEstado);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(estado, xRight + 10, badgeY + badgeH / 2 + 1.4);

    /* ── Datos del cliente ── */
    const clY = 45;
    const clH = 32;
    doc.setFillColor(244, 249, 246);
    doc.setDrawColor(209, 232, 217);
    doc.roundedRect(ML, clY, MR - ML, clH, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(...green);
    doc.text('CLIENTE', ML + 6, clY + 8);

    const colL = ML + 6, colR = ML + (MR - ML) / 2 + 6;
    const filas = [
      ['Nombre:', cl.nombre],
      ['Proyectos:', `${cl.cobros.length} registrado(s)`],
      ['Dirección:', '—'],
      ['Teléfono:', cl.telefono || '—'],
    ];
    const filasR = [
      ['Fecha de inicio:', '—'],
      ['Asesor:', 'Crystal Service'],
      ['Estado general:', estado === 'PAGADO' ? 'Finalizado' : 'En proceso'],
    ];
    doc.setFontSize(8.5);
    filas.forEach((f, i) => {
      const y = clY + 15 + i * 5.3;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      doc.text(f[0], colL, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      doc.text(String(f[1]), colL + 24, y);
    });
    filasR.forEach((f, i) => {
      const y = clY + 15 + i * 5.3;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      doc.text(f[0], colR, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      doc.text(String(f[1]), colR + 30, y);
    });

    /* ── Tarjetas de totales ── */
    const stY = clY + clH + 8;
    const stH = 22;
    const gap = 4;
    const stW = (MR - ML - gap * 3) / 4;
    const tarjetas = [
      { label: 'TOTAL DEL PROYECTO', valor: fmt(cl.totalFacturado), glyph: '$', color: green },
      { label: 'TOTAL ABONADO',      valor: fmt(cl.totalAbonado),   glyph: '$', color: [39, 174, 96] },
      { label: 'SALDO PENDIENTE',    valor: fmt(saldoTotal),        glyph: '$', color: saldoTotal > 0.01 ? [245, 158, 11] : [39, 174, 96] },
      { label: 'ESTADO',             valor: estado,                 glyph: '',  color: colorEstado, esEstado: true },
    ];
    tarjetas.forEach((t, i) => {
      const x = ML + i * (stW + gap);
      doc.setFillColor(t.esEstado ? bgEstado[0] : 250, t.esEstado ? bgEstado[1] : 251, t.esEstado ? bgEstado[2] : 250);
      doc.setDrawColor(...(t.esEstado ? t.color : [230, 235, 232]));
      doc.roundedRect(x, stY, stW, stH, 3, 3, 'FD');
      const cx = x + 9, cy = stY + stH / 2;
      if (t.esEstado) _drawCheckBadge(doc, cx, cy, 4.2, t.color);
      else _drawIconBadge(doc, cx, cy, 4.2, t.color, t.glyph);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6);
      doc.setTextColor(107, 114, 128);
      doc.text(t.label, x + 16, stY + 8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
      doc.setTextColor(26, 26, 26);
      doc.text(String(t.valor), x + 16, stY + 16);
    });

    /* ── Detalle de proyectos ── */
    const detY = stY + stH + 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('DETALLE DE PROYECTOS', ML, detY);

    if (typeof doc.autoTable === 'function') {
      const rows = cl.cobros.map(c => {
        const saldo = c.total - (c.abonadoReal || 0);
        return [
          c.factura || '—',
          c.notas || '—',
          (typeof fmtTotal === 'function' ? fmtTotal : fmt)(c.total || 0),
          fmt(c.abonadoReal || 0),
          fmt(saldo),
          saldo <= 0.01 ? 'Pagado' : 'Pendiente',
        ];
      });

      doc.autoTable({
        startY: detY + 4,
        head: [['Ref.', 'Descripción', 'Total', 'Abonado', 'Saldo', 'Estado']],
        body: rows,
        foot: [['', 'TOTAL', fmt(cl.totalFacturado), fmt(cl.totalAbonado), fmt(saldoTotal), '']],
        theme: 'striped',
        headStyles:  { fillColor: green, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles:  { fontSize: 8.5 },
        footStyles:  { fillColor: [230, 244, 236], textColor: [26, 26, 26], fontStyle: 'bold', fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 68 },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 25, halign: 'right' },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 25.9, halign: 'center' },
        },
        margin: { left: ML, right: 15 },
      });
    }

    const y1 = doc.lastAutoTable?.finalY || (detY + 40);

    /* ── Historial de abonos (izq) + Resumen (der) ── */
    const todosLosPagos = [];
    cl.cobros.forEach(c => {
      c.pagosDetalle.forEach(p => todosLosPagos.push({ fecha: p.fecha, monto: p.monto, metodo: p.metodo }));
    });
    todosLosPagos.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const colWidth  = (MR - ML - 8) / 2;
    const xResumen  = ML + colWidth + 8;
    const secY      = y1 + 10;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('HISTORIAL DE ABONOS', ML, secY);

    let abonosFinalY = secY + 4;
    if (todosLosPagos.length > 0 && typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: secY + 4,
        head: [['Fecha', 'Método', 'Monto']],
        body: todosLosPagos.map(p => [p.fecha, p.metodo || '—', fmt(p.monto)]),
        foot: [['TOTAL ABONADO', '', fmt(cl.totalAbonado)]],
        theme: 'grid',
        headStyles:  { fillColor: green, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles:  { fontSize: 8 },
        footStyles:  { fillColor: [230, 244, 236], textColor: [26, 26, 26], fontStyle: 'bold', fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: colWidth * 0.38 },
          1: { cellWidth: colWidth * 0.34 },
          2: { cellWidth: colWidth * 0.28, halign: 'right' },
        },
        margin: { left: ML, right: W - ML - colWidth },
        tableWidth: colWidth,
      });
      abonosFinalY = doc.lastAutoTable.finalY;
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.setTextColor(107, 114, 128);
      doc.text('Aún no se han registrado abonos.', ML, secY + 10);
      abonosFinalY = secY + 14;
    }

    /* Resumen (columna derecha) */
    const resH = 62;
    doc.setFillColor(244, 249, 246);
    doc.setDrawColor(209, 232, 217);
    doc.roundedRect(xResumen, secY - 5, colWidth, resH, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('RESUMEN', xResumen + 6, secY + 2);

    doc.setFontSize(8.3);
    const resumenFilas = [
      ['Valor contratado', fmt(cl.totalFacturado)],
      ['Pagos realizados', fmt(cl.totalAbonado)],
    ];
    resumenFilas.forEach((f, i) => {
      const y = secY + 10 + i * 6;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      doc.text(f[0], xResumen + 6, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      doc.text(f[1], xResumen + colWidth - 6, y, { align: 'right' });
    });
    doc.setDrawColor(209, 232, 217);
    doc.line(xResumen + 6, secY + 24, xResumen + colWidth - 6, secY + 24);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3);
    doc.setTextColor(107, 114, 128);
    doc.text('Saldo pendiente', xResumen + 6, secY + 30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.setTextColor(...(saldoTotal > 0.01 ? [245, 158, 11] : [39, 174, 96]));
    doc.text(fmt(saldoTotal), xResumen + colWidth - 6, secY + 31, { align: 'right' });

    const ringCx = xResumen + 16, ringCy = secY + 46;
    _drawRing(doc, ringCx, ringCy, 9, pctPagado, [39, 174, 96], [225, 235, 229], 2.6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.setTextColor(26, 26, 26);
    doc.text(`${Math.round(pctPagado)}%`, ringCx, ringCy + 1.4, { align: 'center' });

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8);
    doc.setTextColor(...(estado === 'PAGADO' ? [39, 174, 96] : [26, 26, 26]));
    const msg = estado === 'PAGADO'
      ? 'El proyecto ha sido cancelado en su totalidad.'
      : 'Aún queda un saldo por completar.';
    doc.text(doc.splitTextToSize(msg, colWidth - 34), ringCx + 13, secY + 42);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.setTextColor(...colorEstado);
    doc.text(estado, ringCx + 13, secY + 51);

    /* ── Observaciones ── */
    const obsY = abonosFinalY + 8;
    const obsH = 24;
    doc.setFillColor(244, 249, 246);
    doc.setDrawColor(209, 232, 217);
    doc.roundedRect(ML, obsY, colWidth, obsH, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(26, 26, 26);
    doc.text('OBSERVACIONES', ML + 6, obsY + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    const observaciones = [
      'Documento generado automáticamente.',
      'Si tiene alguna consulta puede comunicarse con nuestro departamento administrativo.',
      'Gracias por confiar en Crystal Service.',
    ];
    let obsLineY = obsY + 12;
    observaciones.forEach(o => {
      const lines = doc.splitTextToSize(`•  ${o}`, colWidth - 12);
      doc.text(lines, ML + 6, obsLineY);
      obsLineY += lines.length * 3.6;
    });

    /* ── Footer ── */
    doc.setFillColor(...green);
    doc.rect(0, H - 16, W, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Tel: 6456-2658    •    crystalservicejj@gmail.com    •    San Miguelito, Ciudad de Panamá', W / 2, H - 10, { align: 'center' });
    doc.setFillColor(20, 92, 46);
    doc.rect(0, H - 4, W, 4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text('ALUMINIO  •  VIDRIO  •  MANTENIMIENTO', W / 2, H - 1.3, { align: 'center' });

    doc.save(`Estado_Cuenta_${cl.nombre.replace(/\s+/g,'_')}.pdf`);
    UI.toast('Estado de cuenta PDF generado', 'success');
  };

  view.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Estado de Cuenta</div>
        <div class="page-subtitle">Historial de pagos y saldos por cliente</div>
      </div>
    </div>
    <div id="ec-content"></div>

    <!-- Modal detalle de cliente -->
    <div class="modal-overlay" id="modal-detalle-cliente-ec">
      <div class="modal" style="max-width:900px;width:100%;">
        <div class="modal-header">
          <div class="modal-title" id="ec-detalle-titulo">Cliente</div>
          <button class="modal-close" onclick="window._cerrarDetalleClienteEC()">${UI.icons.x}</button>
        </div>
        <div class="modal-body" id="ec-detalle-body"></div>
      </div>
    </div>

    <!-- Modal pago EC -->
    <div class="modal-overlay" id="modal-pago-ec">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Registrar Abono</div>
          <button class="modal-close" onclick="UI.closeModal('modal-pago-ec')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="pago-cobro-id-ec">
          <div style="background:var(--green-light);border-radius:8px;padding:12px;margin-bottom:16px;">
            <div style="font-size:13px;font-weight:600;" id="pago-nombre-ec">—</div>
            <div style="font-size:12px;color:var(--text-gray);">Saldo pendiente: <strong id="pago-saldo-ec">—</strong></div>
          </div>
          <div class="form-group">
            <label class="form-label">Monto del abono <span class="required">*</span></label>
            <input id="pago-monto-ec" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Fecha</label>
              <input id="pago-fecha-ec" class="form-input" type="date">
            </div>
            <div class="form-group">
              <label class="form-label">Método</label>
              <select id="pago-metodo-ec" class="form-select">
                <option>Efectivo</option><option>Transferencia</option>
                <option>Cheque</option><option>ACH</option><option>Tarjeta</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notas</label>
            <input id="pago-notas-ec" class="form-input" placeholder="Referencia, observación…">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="UI.closeModal('modal-pago-ec')">Cancelar</button>
          <button class="btn btn-primary" onclick="registrarPagoEC()">Registrar abono</button>
        </div>
      </div>
    </div>

    <!-- Modal nuevo cobro EC -->
    <div class="modal-overlay" id="modal-nuevo-cobro-ec">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" id="nc-modal-title-ec">Nuevo Proyecto / Cobro</div>
          <button class="modal-close" onclick="UI.closeModal('modal-nuevo-cobro-ec')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="nc-id-ec" value="">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Cliente <span class="required">*</span></label>
              <input id="nc-cliente-ec" class="form-input" placeholder="Nombre del cliente">
            </div>
            <div class="form-group">
              <label class="form-label">Teléfono</label>
              <input id="nc-telefono-ec" class="form-input" placeholder="Ej: 6456-2658">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Referencia / # Cotización</label>
              <input id="nc-factura-ec" class="form-input" placeholder="Ej: F-1757 o #1806">
            </div>
            <div class="form-group">
              <label class="form-label">Vencimiento</label>
              <input id="nc-vencimiento-ec" class="form-input" type="date">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Descripción del proyecto</label>
            <input id="nc-desc-ec" class="form-input" placeholder="Ej: Fachada vidrio templado, Showroom…">
          </div>
          <div class="form-group">
            <label class="form-label">Nota (plan de pago, observaciones…)</label>
            <input id="nc-nota-ec" class="form-input" placeholder="Ej: Abono restante en 2 partes, 30 jun y 15 jul">
          </div>
          <div class="form-group">
            <label class="form-label">Total cotizado ($)</label>
            <input id="nc-total-ec" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
          </div>
          <div id="nc-abono-inicial-row-ec">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Abono inicial ($)</label>
                <input id="nc-pagado-ec" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
              </div>
              <div class="form-group">
                <label class="form-label">Método del abono inicial</label>
                <select id="nc-metodo-ec" class="form-select">
                  <option>Efectivo</option><option>Transferencia</option>
                  <option>Cheque</option><option>ACH</option>
                </select>
              </div>
            </div>
            <p style="font-size:12px;color:var(--text-gray);margin-top:-8px;">Los abonos posteriores se registran con el botón "+ Pago" de cada proyecto.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="UI.closeModal('modal-nuevo-cobro-ec')">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarNuevoCobroEC()">Guardar</button>
        </div>
      </div>
    </div>
  `;

  await render();
});
