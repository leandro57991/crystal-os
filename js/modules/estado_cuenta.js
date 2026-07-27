/* =========================================================
   Crystal OS — modules/estado_cuenta.js
   Estado de cuenta por cliente: proyectos + abonos + saldo
   Formato basado en el Excel de referencia de Crystal Services
   ========================================================= */

Router.register('estado-cuenta', async (view) => {
  let busqueda = '';
  let pagina    = 1;
  let porPagina = 15;

  async function buildClientData() {
    const [cobros, pagos] = await Promise.all([
      DB.getCobros(),
      DB.getAll('pagos'),
    ]);

    // Agrupar cobros por cliente
    const porCliente = {};
    cobros.forEach(c => {
      const key = (c.clienteNombre || '—').trim();
      if (!porCliente[key]) porCliente[key] = { nombre: key, cobros: [], totalFacturado: 0, totalAbonado: 0 };
      const pagosCobro = pagos.filter(p => p.cobroId === c.id);
      const abonado = pagosCobro.reduce((s, p) => s + (p.monto || 0), 0);
      porCliente[key].cobros.push({ ...c, pagosDetalle: pagosCobro.sort((a,b)=>a.fecha.localeCompare(b.fecha)), abonadoReal: abonado });
      porCliente[key].totalFacturado += (c.total || 0);
      porCliente[key].totalAbonado   += abonado;
    });

    return Object.values(porCliente).sort((a,b) => a.nombre.localeCompare(b.nombre));
  }

  async function render() {
    const clientes = await buildClientData();
    let lista = clientes;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(c => c.nombre.toLowerCase().includes(q));
    }

    const cont = document.getElementById('ec-content');
    if (!cont) return;

    const totalCartera  = clientes.reduce((s,c)=>s+(c.totalFacturado-c.totalAbonado),0);
    const totalClientes = clientes.filter(c=>(c.totalFacturado-c.totalAbonado)>0.01).length;
    const pag = UI.paginar(lista, pagina, porPagina);
    pagina = pag.pagina;

    cont.innerHTML = `
      <div class="stats-row" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:20px;">
        <div class="stat-pill">
          <div class="stat-num">${clientes.length}</div>
          <div class="stat-lbl">Clientes en cartera</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--amber);">${totalClientes}</div>
          <div class="stat-lbl">Con saldo pendiente</div>
        </div>
        <div class="stat-pill">
          <div class="stat-num" style="color:var(--danger);">${fmt(totalCartera)}</div>
          <div class="stat-lbl">Total por cobrar</div>
        </div>
      </div>

      <div class="filter-bar" style="margin-bottom:16px;">
        <div class="filter-search">${UI.icons.search}
          <input id="ec-search" type="text" placeholder="Buscar cliente…" value="${busqueda}">
        </div>
        <button class="btn btn-primary btn-sm" onclick="UI.openModal('modal-nuevo-cobro-ec')">
          ${UI.icons.plus} Nuevo cobro
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${lista.length === 0
          ? `<div class="card"><div class="empty-state"><h3>Sin clientes</h3><p>Registra cobros para ver estados de cuenta</p></div></div>`
          : pag.items.map(cl => {
              const saldoTotal = cl.totalFacturado - cl.totalAbonado;
              const badge = saldoTotal <= 0.01 ? 'badge-success' : saldoTotal > 0 ? 'badge-amber' : 'badge-gray';
              const lbl   = saldoTotal <= 0.01 ? 'Al día' : `Debe ${fmt(saldoTotal)}`;
              return `
                <div class="card">
                  <div style="display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="toggleCliente('${cl.nombre.replace(/'/g,"\\'")}')">
                    <div class="avatar" style="background:var(--green-soft);color:var(--green-main);">${cl.nombre[0].toUpperCase()}</div>
                    <div style="flex:1;">
                      <div style="font-size:15px;font-weight:700;">${cl.nombre}</div>
                      <div style="font-size:12px;color:var(--text-gray);">${cl.cobros.length} proyecto(s) registrado(s)</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:18px;font-weight:700;color:${saldoTotal>0?'var(--danger)':'var(--success)'};">${fmt(saldoTotal)}</div>
                      <span class="badge ${badge}">${lbl}</span>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();generarPDFEstadoCuenta('${cl.nombre.replace(/'/g,"\\'")}')">
                      ${UI.icons.pdf} PDF
                    </button>
                  </div>
                  <div id="detalle-${slugify(cl.nombre)}" style="display:none;margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">
                    ${renderDetalleCliente(cl)}
                  </div>
                </div>`;
            }).join('')
        }
      </div>
      <div id="ec-pagination">${UI.paginacionHTML(pag, 'window._ecPagina', 'window._ecPorPagina')}</div>
    `;

    document.getElementById('ec-search')?.addEventListener('input', e => { busqueda = e.target.value; pagina = 1; render(); });
  }

  window._ecPagina = (n) => { pagina = n; render(); };
  window._ecPorPagina = (n) => { porPagina = parseInt(n); pagina = 1; render(); };

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
              const st    = saldo <= 0.01 ? 'badge-success' : 'badge-amber';
              return `<tr>
                <td><strong>${c.factura||'—'}</strong></td>
                <td>${c.notas||'—'}</td>
                <td>${fmt(c.total||0)}</td>
                <td style="color:var(--success);">${fmt(c.abonadoReal||0)}</td>
                <td style="font-weight:700;color:${saldo>0?'var(--danger)':'var(--success)'};">${fmt(saldo)}</td>
                <td><span class="badge ${st}">${saldo<=0.01?'Pagado':'Pendiente'}</span></td>
                <td>
                  <button class="btn btn-sm btn-primary" onclick="abrirModalPagoEC('${c.id}','${(c.clienteNombre||'').replace(/'/g,"\\'")}','${fmt(saldo)}')">
                    + Pago
                  </button>
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
        <button class="btn btn-outline btn-sm" onclick="UI.openModal('modal-nuevo-cobro-ec');document.getElementById('nc-cliente-ec').value='${cl.nombre.replace(/'/g,"\\'")}'">
          ${UI.icons.plus} Agregar proyecto
        </button>
      </div>
    `;
  }

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  window.toggleCliente = (nombre) => {
    const el = document.getElementById(`detalle-${slugify(nombre)}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

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
  };

  window.guardarNuevoCobroEC = async () => {
    const data = {
      clienteNombre: document.getElementById('nc-cliente-ec').value,
      factura:       document.getElementById('nc-factura-ec').value,
      notas:         document.getElementById('nc-desc-ec').value,
      total:         parseFloat(document.getElementById('nc-total-ec').value)||0,
      pagado:        parseFloat(document.getElementById('nc-pagado-ec').value)||0,
      vencimiento:   document.getElementById('nc-vencimiento-ec').value,
    };
    data.saldo  = data.total - data.pagado;
    data.estado = data.saldo <= 0.01 ? 'Pagado' : data.pagado > 0 ? 'Parcial' : 'Pendiente';
    if (!data.clienteNombre) { UI.toast('Nombre del cliente requerido', 'error'); return; }

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

    UI.closeModal('modal-nuevo-cobro-ec');
    UI.toast('Cobro registrado', 'success');
    await render();
  };

  /* ── PDF Estado de Cuenta ─────────────────────────────── */

  window.generarPDFEstadoCuenta = async (nombreCliente) => {
    if (typeof window.jspdf === 'undefined') {
      UI.toast('Librería PDF no cargada. Verifica tu conexión.', 'error'); return;
    }

    const clientes = await buildClientData();
    const cl = clientes.find(c => c.nombre === nombreCliente);
    if (!cl) { UI.toast('Cliente no encontrado', 'error'); return; }

    const saldoTotal = cl.totalFacturado - cl.totalAbonado;

    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const ancho = 215.9;
    const hoy   = new Date().toLocaleDateString('es-PA', { day:'numeric', month:'long', year:'numeric' });

    /* Header */
    doc.setFillColor(31, 122, 60);
    doc.rect(0, 0, ancho, 42, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('CRYSTAL SERVICES PANAMÁ', 15, 16);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('ALUMINIO · VIDRIO · MANTENIMIENTO', 15, 23);
    doc.text('Tel: 6456-2658 | crystalservicejj@gmail.com', 15, 29);
    doc.text('San Miguelito, Ciudad de Panamá', 15, 35);

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('ESTADO DE CUENTA', ancho - 15, 20, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${hoy}`, ancho - 15, 27, { align: 'right' });

    /* Datos del cliente */
    doc.setTextColor(26, 26, 26);
    doc.setFillColor(244, 249, 246);
    doc.rect(12, 48, ancho - 24, 18, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(cl.nombre, 17, 57);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Proyectos registrados: ${cl.cobros.length}`, 17, 63);

    /* Tabla de proyectos */
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('DETALLE DE PROYECTOS', 15, 78);

    if (typeof doc.autoTable === 'function') {
      const rows = cl.cobros.map(c => {
        const saldo = c.total - (c.abonadoReal || 0);
        return [
          c.factura || '—',
          c.notas || '—',
          fmt(c.total || 0),
          fmt(c.abonadoReal || 0),
          fmt(saldo),
          saldo <= 0.01 ? 'Pagado' : 'Pendiente',
        ];
      });

      doc.autoTable({
        startY: 82,
        head: [['Referencia', 'Descripción', 'Total', 'Abonado', 'Saldo', 'Estado']],
        body: rows,
        foot: [['', 'TOTAL', fmt(cl.totalFacturado), fmt(cl.totalAbonado), fmt(saldoTotal), '']],
        theme: 'striped',
        headStyles:  { fillColor: [31,122,60], textColor: 255, fontStyle:'bold', fontSize:8 },
        bodyStyles:  { fontSize: 8.5 },
        footStyles:  { fillColor: [244,249,246], textColor: [26,26,26], fontStyle:'bold', fontSize:9 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 70 },
          2: { cellWidth: 25, halign:'right' },
          3: { cellWidth: 25, halign:'right' },
          4: { cellWidth: 25, halign:'right' },
          5: { cellWidth: 22, halign:'center' },
        },
        margin: { left: 15, right: 15 },
      });
    }

    const y1 = doc.lastAutoTable?.finalY || 140;

    /* Historial de abonos */
    const todosLosPagos = [];
    cl.cobros.forEach(c => {
      c.pagosDetalle.forEach(p => todosLosPagos.push({ fecha: p.fecha, monto: p.monto, metodo: p.metodo }));
    });
    todosLosPagos.sort((a,b)=>a.fecha.localeCompare(b.fecha));

    if (todosLosPagos.length > 0) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(`ABONOS REALIZADOS — ${cl.nombre.toUpperCase()}`, 15, y1 + 12);

      if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          startY: y1 + 16,
          head: [['Fecha', 'Monto', 'Método de pago']],
          body: todosLosPagos.map(p => [p.fecha, fmt(p.monto), p.metodo || '—']),
          foot: [['Total abonado', fmt(cl.totalAbonado), '']],
          theme: 'grid',
          headStyles:  { fillColor: [39,174,96], textColor: 255, fontStyle:'bold', fontSize:8 },
          bodyStyles:  { fontSize: 9 },
          footStyles:  { fillColor: [220,252,231], textColor:[22,163,74], fontStyle:'bold', fontSize:9 },
          columnStyles: {
            0: { cellWidth: 45 },
            1: { cellWidth: 40, halign:'right' },
            2: { cellWidth: 60 },
          },
          margin: { left: 15, right: 15 },
        });
      }
    }

    const y2 = doc.lastAutoTable?.finalY || (y1 + 80);

    /* Saldo final destacado */
    doc.setFillColor(saldoTotal <= 0.01 ? 220 : 254, saldoTotal <= 0.01 ? 252 : 242, saldoTotal <= 0.01 ? 231 : 199);
    doc.rect(15, y2 + 8, ancho - 30, 22, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.setTextColor(saldoTotal <= 0.01 ? 22 : 217, saldoTotal <= 0.01 ? 163 : 119, saldoTotal <= 0.01 ? 74 : 6);
    doc.text('SALDO PENDIENTE:', 20, y2 + 22);
    doc.setFontSize(16);
    doc.text(fmt(saldoTotal), ancho - 20, y2 + 22, { align: 'right' });

    /* Footer */
    const pg = doc.internal.pageSize.height;
    doc.setFillColor(31, 122, 60);
    doc.rect(0, pg - 14, ancho, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Crystal Services Panamá — Este documento es un estado de cuenta interno.', ancho/2, pg - 6, { align: 'center' });

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
          <div class="modal-title">Nuevo Proyecto / Cobro</div>
          <button class="modal-close" onclick="UI.closeModal('modal-nuevo-cobro-ec')">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Cliente <span class="required">*</span></label>
            <input id="nc-cliente-ec" class="form-input" placeholder="Nombre del cliente">
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
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Total cotizado ($)</label>
              <input id="nc-total-ec" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group">
              <label class="form-label">Abono inicial ($)</label>
              <input id="nc-pagado-ec" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Método del abono inicial</label>
            <select id="nc-metodo-ec" class="form-select">
              <option>Efectivo</option><option>Transferencia</option>
              <option>Cheque</option><option>ACH</option>
            </select>
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
