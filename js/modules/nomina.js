/* =========================================================
   Crystal OS — modules/nomina.js
   Asistencia + nómina + historial + dashboard de desempeño
   ========================================================= */

Router.register('nomina', async (view) => {
  const todayISO  = new Date().toISOString().slice(0,10);
  let fechaActual = todayISO;  // fecha seleccionada en asistencia
  let tabActiva   = 'asistencia';

  // Rango de quincena
  function calcQuincena(fecha) {
    const [y, m, d] = fecha.split('-').map(Number);
    const diasMes = new Date(y, m, 0).getDate();
    if (d <= 15) return { desde: `${y}-${String(m).padStart(2,'0')}-01`, hasta: `${y}-${String(m).padStart(2,'0')}-15` };
    return { desde: `${y}-${String(m).padStart(2,'0')}-16`, hasta: `${y}-${String(m).padStart(2,'0')}-${diasMes}` };
  }

  // Calcular tardanza en minutos desde hora esperada 08:00
  function calcTardanza(entrada) {
    if (!entrada) return 0;
    const [eh, em] = entrada.split(':').map(Number);
    const esperadoMin = 8 * 60; // 08:00
    const entradaMin  = eh * 60 + em;
    return Math.max(0, entradaMin - esperadoMin);
  }

  view.innerHTML = `
    <div class="page-header">
      <div class="page-title">Nómina y Asistencia</div>
    </div>
    <div id="nomina-tabs" style="display:flex;gap:4px;border-bottom:2px solid var(--border);margin-bottom:20px;flex-wrap:wrap;">
      <button class="tab-btn active" data-tab="asistencia">Asistencia</button>
      <button class="tab-btn" data-tab="quincena">Cálculo de Nómina</button>
      <button class="tab-btn" data-tab="dashboard">Dashboard</button>
      <button class="tab-btn" data-tab="trabajadores">Trabajadores</button>
    </div>
    <div id="nomina-content"></div>

    <!-- Modal Trabajador -->
    <div class="modal-overlay" id="modal-trabajador" style="display:none;z-index:9999;">
      <div class="modal" style="max-width:540px;width:100%;">
        <div class="modal-header">
          <div class="modal-title" id="modal-trabajador-title">Agregar Trabajador</div>
          <button class="modal-close" onclick="document.getElementById('modal-trabajador').style.display='none'">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="nt-id">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Nombre <span class="required">*</span></label>
              <input id="nt-nombre" class="form-input" placeholder="Nombre completo">
            </div>
            <div class="form-group">
              <label class="form-label">Rol</label>
              <select id="nt-rol" class="form-select">
                <option>Técnico</option><option>Ayudante</option><option>Eventual</option><option>Supervisor</option><option>Oficina</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Frecuencia de Pago</label>
              <select id="nt-tipoCobro" class="form-select" onchange="window._toggleTrabajadorFields()">
                <option value="Semanal">Semanal (Técnicos)</option>
                <option value="Quincenal">Quincenal (Oficina)</option>
              </select>
            </div>
            <div class="form-group" id="group-salarioFijo" style="display:none;">
              <label class="form-label">Salario Fijo ($/Quincena)</label>
              <input id="nt-salarioFijo" class="form-input" type="number" min="0" step="0.01" placeholder="Ej. 300.00">
            </div>
          </div>
          
          <div id="group-tarifasVariables">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tarifa/día ($)</label>
                <input id="nt-dia" class="form-input" type="number" min="0" step="0.01" placeholder="0.00">
              </div>
              <div class="form-group">
                <label class="form-label">Tarifa noche ($)</label>
                <input id="nt-noche" class="form-input" type="number" min="0" step="0.01" placeholder="Si aplica">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tarifa/Hora ($)</label>
                <input id="nt-hora" class="form-input" type="number" min="0" step="0.01" placeholder="Para hrs extras">
              </div>
              <div class="form-group">
                <label class="form-label">Tarifa semana ($)</label>
                <input id="nt-semana" class="form-input" type="number" min="0" step="0.01" placeholder="Opcional">
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="document.getElementById('modal-trabajador').style.display='none'">Cancelar</button>
          <button class="btn btn-primary" onclick="window.guardarTrabajador()">Guardar</button>
        </div>
      </div>
    </div>

    <!-- Modal editar registro -->
    <div class="modal-overlay" id="modal-editar-asist" style="display:none;">
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <div class="modal-title" id="modal-editar-titulo">Editar asistencia</div>
          <button class="modal-close" onclick="document.getElementById('modal-editar-asist').style.display='none'">${UI.icons.x}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="edit-trab-id">
          <input type="hidden" id="edit-registro-id">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Entrada</label>
              <input id="edit-entrada" class="form-input" type="time" value="08:00">
            </div>
            <div class="form-group">
              <label class="form-label">Salida</label>
              <input id="edit-salida" class="form-input" type="time" value="17:00">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Horas (Día)</label>
              <input id="edit-horasDia" class="form-input" type="number" min="0" step="0.5" placeholder="Ej. 8">
            </div>
            <div class="form-group">
              <label class="form-label">Horas (Noche/Extra)</label>
              <input id="edit-horasNoche" class="form-input" type="number" min="0" step="0.5" placeholder="Ej. 2">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Tardanza (min)</label>
              <input id="edit-tardanza" class="form-input" type="number" min="0" value="0">
            </div>
            <div class="form-group">
              <label class="form-label">Vale ($)</label>
              <input id="edit-vale" class="form-input" type="number" min="0" step="0.01" value="0" placeholder="0.00">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label style="display:flex;gap:8px;align-items:center;cursor:pointer;">
                <input id="edit-almuerzo" type="checkbox"> Almuerzo provisto ($5 desc.)
              </label>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notas</label>
            <input id="edit-notas" class="form-input" placeholder="Observaciones opcionales">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="document.getElementById('modal-editar-asist').style.display='none'">Cancelar</button>
          <button class="btn btn-primary" onclick="window.guardarEdicionAsist()">Guardar cambios</button>
        </div>
      </div>
    </div>
  `;

  // Tabs
  view.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      view.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabActiva = btn.dataset.tab;
      renderContent();
    });
  });

  async function renderContent() {
    const cont = document.getElementById('nomina-content');
    if (!cont) return;
    const trabajadores = await DB.getTrabajadores();

    if (tabActiva === 'asistencia')   cont.innerHTML = await buildAsistencia(trabajadores);
    if (tabActiva === 'quincena') {
       cont.innerHTML = await buildQuincena(trabajadores);
       setTimeout(() => window.recalcQuincena && window.recalcQuincena(), 50);
    }
    if (tabActiva === 'dashboard')    cont.innerHTML = await buildDashboard(trabajadores);
    if (tabActiva === 'trabajadores') cont.innerHTML = buildTrabajadores(trabajadores);

    // Bind eventos
    if (tabActiva === 'asistencia') bindAsistencia(trabajadores);
  }

  /* ── TAB: ASISTENCIA ─────────────────────────────────── */

  async function buildAsistencia(trabajadores) {
    const asistHoy = await DB.getAsistenciaByFecha(fechaActual);
    const asistMap = {};
    asistHoy.forEach(a => asistMap[a.trabajadorId] = a);

    const fecha = new Date(fechaActual + 'T12:00:00');
    const labelFecha = fecha.toLocaleDateString('es-PA', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const esHoy = fechaActual === todayISO;

    return `
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:12px;">
          <div class="card-title">Asistencia — ${labelFecha}${esHoy?' (Hoy)':''}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-sm btn-outline" id="btn-fecha-ant" onclick="window.cambiarFecha(-1)">◀ Anterior</button>
            <input type="date" id="input-fecha-asist" class="form-input" style="width:160px;" value="${fechaActual}" onchange="window.irFecha(this.value)">
            <button class="btn btn-sm btn-outline" id="btn-fecha-sig" onclick="window.cambiarFecha(1)" ${esHoy?'disabled':''}>Siguiente ▶</button>
            ${esHoy ? '' : `<button class="btn btn-sm btn-secondary" onclick="window.irFecha('${todayISO}')">Hoy</button>`}
          </div>
        </div>

        <div class="table-wrapper">
          <table class="table">
            <thead><tr>
              <th>Trabajador</th><th>Rol</th><th>Entrada</th><th>Salida</th>
              <th>Horas Día</th><th>Hrs Noche/Ex</th>
              <th>Tardanza</th><th>Almuerzo</th><th>Vale ($)</th><th>Estado</th><th>Acción</th>
            </tr></thead>
            <tbody>
              ${trabajadores.map(t => {
                const a = asistMap[t.id] || {};
                const tardMin = a.id ? (parseInt(a.tardanza)||0) : calcTardanza(a.entrada||'08:00');
                return `
                  <tr>
                    <td><strong>${t.nombre}</strong></td>
                    <td><span style="font-size:12px;color:var(--text-gray);">${t.rol}</span></td>
                    <td><input type="time" id="ent-${t.id}" class="form-input" style="width:100px;" value="${a.entrada||'08:00'}"></td>
                    <td><input type="time" id="sal-${t.id}" class="form-input" style="width:100px;" value="${a.salida||'17:00'}"></td>
                    <td><input type="number" id="hD-${t.id}" class="form-input" style="width:60px;" min="0" step="0.5" placeholder="8" value="${a.horasDia!==undefined?a.horasDia:8}"></td>
                    <td><input type="number" id="hN-${t.id}" class="form-input" style="width:60px;" min="0" step="0.5" placeholder="0" value="${a.horasNoche||0}"></td>
                    <td>
                      <input type="number" id="tar-${t.id}" class="form-input" style="width:60px;" min="0" value="${a.tardanza||0}">
                      ${tardMin > 0 ? `<div style="font-size:11px;color:var(--amber);">${tardMin} min</div>` : ''}
                    </td>
                    <td><label style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" id="alm-${t.id}" ${a.almuerzo?'checked':''}> Sí</label></td>
                    <td><input type="number" id="vale-${t.id}" class="form-input" style="width:70px;" min="0" step="0.01" value="${a.vale||0}" placeholder="0.00"></td>
                    <td>${a.id
                      ? '<span class="badge badge-success">Ok</span>'
                      : '<span class="badge badge-gray">Pendiente</span>'}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="btn btn-sm btn-primary" data-trab="${t.id}" id="btn-asist-${t.id}">Guardar</button>
                        ${a.id ? `<button class="btn btn-sm btn-outline" onclick="window.abrirEdicion('${t.id}','${a.id||''}','${fechaActual}','${t.nombre}')">${UI.icons.edit}</button>` : ''}
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top:12px;padding:12px;background:var(--green-light);border-radius:8px;font-size:13px;color:var(--text-gray);">
          ⏰ Horario por defecto: <strong>08:00 – 17:00</strong>. La tardanza se calcula automáticamente desde las 08:00.
          Acumulado semanal &gt; 30 min → descuento de $5.
        </div>
      </div>
    `;
  }

  function bindAsistencia(trabajadores) {
    trabajadores.forEach(t => {
      const btn = document.getElementById(`btn-asist-${t.id}`);
      if (btn) btn.addEventListener('click', () => guardarAsistenciaFila(t.id));
    });
  }

  async function guardarAsistenciaFila(trabId) {
    const entrada  = document.getElementById(`ent-${trabId}`)?.value  || '08:00';
    const salida   = document.getElementById(`sal-${trabId}`)?.value  || '17:00';
    const horasDia = parseFloat(document.getElementById(`hD-${trabId}`)?.value)||0;
    const horasNoche = parseFloat(document.getElementById(`hN-${trabId}`)?.value)||0;
    const tardInput= parseInt(document.getElementById(`tar-${trabId}`)?.value)||0;
    const almuerzo = document.getElementById(`alm-${trabId}`)?.checked;
    const vale     = parseFloat(document.getElementById(`vale-${trabId}`)?.value)||0;

    // Auto-calcular tardanza si no se editó manualmente
    const tardAuto = calcTardanza(entrada);
    const tardanza = tardInput || tardAuto;

    const existentes = await DB.getAsistenciaByFecha(fechaActual);
    const existente  = existentes.find(a => a.trabajadorId === trabId);

    await DB.saveAsistencia({
      id:           existente?.id,
      trabajadorId: trabId,
      fecha:        fechaActual,
      entrada, salida, horasDia, horasNoche, tardanza, almuerzo, vale,
    });
    UI.toast('Asistencia guardada', 'success');
    await renderContent();
  }

  window.cambiarFecha = (delta) => {
    const d = new Date(fechaActual + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    const nueva = d.toISOString().slice(0,10);
    if (nueva > todayISO) return;
    fechaActual = nueva;
    renderContent();
  };

  window.irFecha = (f) => {
    if (!f || f > todayISO) return;
    fechaActual = f;
    renderContent();
  };

  window.abrirEdicion = async (trabId, registroId, fecha, nombre) => {
    const regs = await DB.getAsistenciaByFecha(fecha);
    const reg  = regs.find(a => a.trabajadorId === trabId) || {};

    document.getElementById('modal-editar-titulo').textContent = `Editar asistencia — ${nombre} — ${fecha}`;
    document.getElementById('edit-trab-id').value    = trabId;
    document.getElementById('edit-registro-id').value= reg.id || '';
    document.getElementById('edit-entrada').value    = reg.entrada || '08:00';
    document.getElementById('edit-salida').value     = reg.salida  || '17:00';
    document.getElementById('edit-horasDia').value   = reg.horasDia!==undefined?reg.horasDia:8;
    document.getElementById('edit-horasNoche').value = reg.horasNoche || 0;
    document.getElementById('edit-tardanza').value   = reg.tardanza || 0;
    document.getElementById('edit-vale').value       = reg.vale || 0;
    document.getElementById('edit-almuerzo').checked = reg.almuerzo || false;
    document.getElementById('edit-notas').value      = reg.notas    || '';
    document.getElementById('modal-editar-asist').style.display = 'flex';
  };

  window.guardarEdicionAsist = async () => {
    const trabId    = document.getElementById('edit-trab-id').value;
    const registroId= document.getElementById('edit-registro-id').value;
    const entrada   = document.getElementById('edit-entrada').value;
    const salida    = document.getElementById('edit-salida').value;
    const horasDia  = parseFloat(document.getElementById('edit-horasDia').value)||0;
    const horasNoche= parseFloat(document.getElementById('edit-horasNoche').value)||0;
    const tardanza  = parseInt(document.getElementById('edit-tardanza').value)||0;
    const vale      = parseFloat(document.getElementById('edit-vale').value)||0;
    const almuerzo  = document.getElementById('edit-almuerzo').checked;
    const notas     = document.getElementById('edit-notas').value;

    await DB.saveAsistencia({
      id:           registroId || undefined,
      trabajadorId: trabId,
      fecha:        fechaActual,
      entrada, salida, horasDia, horasNoche, tardanza, almuerzo, vale, notas,
    });
    document.getElementById('modal-editar-asist').style.display = 'none';
    UI.toast('Registro actualizado', 'success');
    await renderContent();
  };

  /* ── TAB: CÁLCULO DE NÓMINA ────────────────────────────── */

  async function buildQuincena(trabajadores) {
    const { desde, hasta } = calcQuincena(todayISO);
    let quinDesde = desde, quinHasta = hasta;

    window.setRangoQuincena = () => {
      const q = calcQuincena(todayISO);
      document.getElementById('quin-desde').value = q.desde;
      document.getElementById('quin-hasta').value = q.hasta;
      window.recalcQuincena();
    };
    window.setRangoSemana = () => {
      const d = new Date();
      const day = d.getDay() || 7; // 1=Mon, 7=Sun
      const currMon = new Date(d); currMon.setDate(d.getDate() - day + 1);
      const currSun = new Date(currMon); currSun.setDate(currMon.getDate() + 6);
      document.getElementById('quin-desde').value = currMon.toISOString().slice(0,10);
      document.getElementById('quin-hasta').value = currSun.toISOString().slice(0,10);
      window.recalcQuincena();
    };

    return `
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:10px;">
          <div class="card-title">Cálculo de Nómina</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <select id="quin-filtro" class="form-select" style="width:110px;" onchange="window.recalcQuincena()">
              <option value="Todos">Todos (Frec.)</option>
              <option value="Semanal">Semanal</option>
              <option value="Quincenal">Quincenal</option>
            </select>
            <input type="date" id="quin-desde" class="form-input" style="width:130px;" value="${quinDesde}" onchange="window.recalcQuincena()">
            <input type="date" id="quin-hasta" class="form-input" style="width:130px;" value="${quinHasta}" onchange="window.recalcQuincena()">
            <button class="btn btn-sm btn-outline" onclick="window.setRangoSemana()">Semana</button>
            <button class="btn btn-sm btn-outline" onclick="window.setRangoQuincena()">Quincena</button>
            <button class="btn btn-sm btn-outline" onclick="window.print()">Imprimir</button>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:10px;margin-bottom:4px;flex-wrap:wrap;font-size:13px;" id="quin-roles-container">
          <strong>Roles:</strong>
          <label style="cursor:pointer;"><input type="checkbox" class="quin-rol-chk" value="Técnico" checked onchange="window.recalcQuincena()"> Técnico</label>
          <label style="cursor:pointer;"><input type="checkbox" class="quin-rol-chk" value="Ayudante" checked onchange="window.recalcQuincena()"> Ayudante</label>
          <label style="cursor:pointer;"><input type="checkbox" class="quin-rol-chk" value="Supervisor" checked onchange="window.recalcQuincena()"> Supervisor</label>
          <label style="cursor:pointer;"><input type="checkbox" class="quin-rol-chk" value="Oficina" checked onchange="window.recalcQuincena()"> Oficina</label>
          <label style="cursor:pointer;"><input type="checkbox" class="quin-rol-chk" value="Eventual" checked onchange="window.recalcQuincena()"> Eventual</label>
        </div>
        <div class="table-wrapper">
          <table class="table" id="tabla-quincena">
            <thead><tr>
              <th>Trabajador</th><th>Días/Hrs</th><th>Salario Base/Tarifa</th><th>Bruto</th>
              <th>-Almuerzo</th><th>-Tardanza</th><th>-Vales</th>
              <th style="color:var(--text-gray);font-size:11px;">Min. tard.</th>
              <th>Total Neto</th>
            </tr></thead>
            <tbody>
              <tr><td colspan="9">Haz clic en Calcular para generar la nómina.</td></tr>
            </tbody>
            <tfoot>
              <tr style="background:var(--green-light);">
                <td colspan="8" style="font-weight:700;text-align:right;font-size:14px;">Total a pagar:</td>
                <td style="font-weight:700;color:var(--green-main);font-size:18px;" id="total-nomina-global">$0.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-gray);">
          ⚠️ Tardanza: si la suma en el rango es &gt;= 30 min → descuento de $2.50. Si es &gt;= 45 min → descuento de $5.00.<br>
          💼 Trabajadores Quincenales asumen su "Salario Fijo". Trabajadores Semanales suman según días/horas trabajadas.
        </div>
      </div>
    `;
  }

  window.recalcQuincena = async () => {
    const desde = document.getElementById('quin-desde')?.value;
    const hasta = document.getElementById('quin-hasta')?.value;
    if (!desde || !hasta) return;

    const trabajadores = await DB.getTrabajadores();
    const asistencia   = await DB.getAsistenciaByRango(desde, hasta);

    const filtro = document.getElementById('quin-filtro')?.value || 'Todos';
    const chkRoles = Array.from(document.querySelectorAll('.quin-rol-chk:checked')).map(c => c.value);

    const trabsFiltrados = trabajadores.filter(t => 
      (filtro === 'Todos' || (t.tipoCobro || 'Semanal') === filtro) &&
      chkRoles.includes(t.rol || 'Técnico')
    );

    const tbody = document.querySelector('#tabla-quincena tbody');
    const tfoot = document.getElementById('total-nomina-global');
    if (!tbody) return;

    let totalGlobal = 0;
    tbody.innerHTML = trabsFiltrados.map(t => {
      const regs = asistencia.filter(a => a.trabajadorId === t.id);
      let diasN=0, diasNoche=0, descAlm=0, vales=0, minTard=0;
      let sumHD=0, sumHN=0, brutoDias=0;

      regs.forEach(a => {
        let hD = a.horasDia !== undefined ? a.horasDia : 8;
        let hN = a.horasNoche || 0;
        sumHD += hD; sumHN += hN;
        if (hD > 0) diasN++;
        if (hN > 0) diasNoche++;
        if (a.almuerzo) descAlm += 5;
        vales   += parseFloat(a.vale||0);
        minTard += parseInt(a.tardanza||0);

        if (t.tarifaHora > 0) {
           brutoDias += (hD * t.tarifaHora) + (hN * t.tarifaHora * 1.5); // 1.5x extras
        } else {
           if (hD > 0) brutoDias += (t.tarifaDia || 0);
           if (hN > 0) brutoDias += (t.tarifaNoche || 0);
        }
      });
      let descTard = 0;
      if (minTard >= 45) {
         descTard = 5;
      } else if (minTard >= 30) {
         descTard = 2.50;
      }
      
      let bruto = brutoDias;
      if (t.tipoCobro === 'Quincenal' && t.salarioFijo > 0) {
        bruto = t.salarioFijo;
      } else if (t.tipoCobro === 'Semanal' && t.tarifaSemana > 0 && diasN >= 5) {
        bruto = t.tarifaSemana;
      }

      const neto = Math.max(0, bruto - descAlm - descTard - vales);
      totalGlobal += neto;
      
      const lblTarifa = t.tipoCobro === 'Quincenal' ? `Fijo: ${fmt(t.salarioFijo)}` : 
                        (t.tarifaHora > 0 ? `Hr: ${fmt(t.tarifaHora)}` : `Día: ${fmt(t.tarifaDia)}`);
      const lblDias = `${diasN}d (${sumHD}h)${sumHN>0?` + ${sumHN}hx`:''}`;

      return `<tr>
        <td><strong>${t.nombre}</strong><br><span style="font-size:11px;color:var(--text-gray);">${t.rol} - ${t.tipoCobro||'Semanal'}</span></td>
        <td>${lblDias}</td>
        <td>${lblTarifa}</td><td>${fmt(bruto)}</td>
        <td style="color:var(--danger);">${descAlm>0?'-'+fmt(descAlm):'—'}</td>
        <td style="color:var(--danger);">${descTard>0?'-'+fmt(descTard):'—'}</td>
        <td style="color:var(--danger);">${vales>0?'-'+fmt(vales):'—'}</td>
        <td style="color:var(--text-gray);font-size:12px;">${minTard} min${minTard>30?' ⚠️':''}</td>
        <td style="font-weight:700;color:var(--green-main);font-size:15px;">${fmt(neto)}</td>
      </tr>`;
    }).join('');
    
    if (trabsFiltrados.length === 0) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No hay trabajadores en esta categoría.</td></tr>`;
    if (tfoot) tfoot.textContent = fmt(totalGlobal);
  };

  /* ── TAB: DASHBOARD ─────────────────────────────────────── */

  async function buildDashboard(trabajadores) {
    const meses = 2; // últimas 8 semanas ≈ 2 meses
    const hasta = todayISO;
    const desdeDate = new Date();
    desdeDate.setMonth(desdeDate.getMonth() - meses);
    const desde = desdeDate.toISOString().slice(0,10);
    const asistencia = await DB.getAsistenciaByRango(desde, hasta);

    // KPIs globales
    const totalDias    = asistencia.length;
    const totalTardMn  = asistencia.reduce((s,a) => s+parseInt(a.tardanza||0), 0);
    const totalNoche   = asistencia.filter(a => a.noche).length;
    const descTardanza = asistencia.filter(a => { /* por trabajador por semana */ return false; }).length; // simplificado

    // Por trabajador
    const porTrab = trabajadores.map(t => {
      const regs = asistencia.filter(a => a.trabajadorId === t.id);
      const tard  = regs.reduce((s,a) => s+parseInt(a.tardanza||0), 0);
      return { ...t, dias: regs.length, tardMin: tard };
    });

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px;">
        <div class="kpi-card">
          <div class="kpi-label">Días registrados (2 meses)</div>
          <div class="kpi-value">${totalDias}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Turnos nocturnos</div>
          <div class="kpi-value">${totalNoche}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Min. tardanza total</div>
          <div class="kpi-value" style="color:${totalTardMn>60?'var(--danger)':'var(--amber)'};">${totalTardMn} min</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Trabajadores activos</div>
          <div class="kpi-value">${trabajadores.length}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:16px;">Desempeño por trabajador (últimos 2 meses)</div>
        <div class="table-wrapper">
          <table class="table">
            <thead><tr><th>Trabajador</th><th>Rol</th><th>Días asistidos</th><th>Tardanza total</th><th>Nivel puntualidad</th></tr></thead>
            <tbody>
              ${porTrab.map(t => {
                const pct = t.dias > 0 ? Math.max(0, 100 - Math.round((t.tardMin / (t.dias * 8 * 60)) * 100)) : 100;
                const color = pct >= 90 ? 'var(--success)' : pct >= 70 ? 'var(--amber)' : 'var(--danger)';
                return `<tr>
                  <td><strong>${t.nombre}</strong></td>
                  <td>${t.rol}</td>
                  <td>${t.dias} días</td>
                  <td style="color:${t.tardMin>60?'var(--danger)':'var(--text-gray)'};">${t.tardMin} min</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="flex:1;background:var(--border);border-radius:4px;height:8px;">
                        <div style="width:${pct}%;background:${color};border-radius:4px;height:8px;"></div>
                      </div>
                      <span style="font-size:12px;font-weight:600;color:${color};">${pct}%</span>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ── TAB: TRABAJADORES ─────────────────────────────────── */

  function buildTrabajadores(trabajadores) {
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Equipo de Trabajo</div>
          <button class="btn btn-sm btn-primary" onclick="window.abrirTrabajador()">
            ${UI.icons.plus} Agregar
          </button>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead><tr>
              <th>Nombre</th><th>Rol</th><th>Cobro</th>
              <th>Salario / Tarifas</th><th>Acción</th>
            </tr></thead>
            <tbody>
              ${trabajadores.map(t => `<tr>
                <td><strong>${t.nombre}</strong></td>
                <td>${t.rol}</td>
                <td><span class="badge badge-gray">${t.tipoCobro || 'Semanal'}</span></td>
                <td>
                  ${t.tipoCobro === 'Quincenal' ? `Fijo: ${fmt(t.salarioFijo||0)}` : 
                   `Día: ${fmt(t.tarifaDia||0)} | Noche: ${fmt(t.tarifaNoche||0)} | Hora: ${fmt(t.tarifaHora||0)}`}
                </td>
                <td>
                  <button class="btn btn-sm btn-outline" onclick="window.abrirTrabajador('${t.id}')">${UI.icons.edit} Editar</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ── MODAL TRABAJADOR ─────────────────────────────────── */

  window._toggleTrabajadorFields = () => {
    const tipo = document.getElementById('nt-tipoCobro').value;
    document.getElementById('group-salarioFijo').style.display = tipo === 'Quincenal' ? 'block' : 'none';
    document.getElementById('group-tarifasVariables').style.display = tipo === 'Semanal' ? 'block' : 'none';
  };

  window.abrirTrabajador = async (id = null) => {
    let t = {};
    if (id) {
      const trabajadores = await DB.getTrabajadores();
      t = trabajadores.find(x => x.id === id) || {};
      document.getElementById('modal-trabajador-title').textContent = 'Editar Trabajador';
    } else {
      document.getElementById('modal-trabajador-title').textContent = 'Agregar Trabajador';
    }

    document.getElementById('nt-id').value          = t.id || '';
    document.getElementById('nt-nombre').value      = t.nombre || '';
    document.getElementById('nt-rol').value         = t.rol || 'Técnico';
    document.getElementById('nt-tipoCobro').value   = t.tipoCobro || 'Semanal';
    document.getElementById('nt-salarioFijo').value = t.salarioFijo || '';
    document.getElementById('nt-dia').value         = t.tarifaDia || '';
    document.getElementById('nt-noche').value       = t.tarifaNoche || '';
    document.getElementById('nt-hora').value        = t.tarifaHora || '';
    document.getElementById('nt-semana').value      = t.tarifaSemana || '';
    
    window._toggleTrabajadorFields();
    document.getElementById('modal-trabajador').style.display = 'flex';
  };

  window.guardarTrabajador = async () => {
    const id = document.getElementById('nt-id').value;
    const data = {
      nombre:       document.getElementById('nt-nombre').value.trim(),
      rol:          document.getElementById('nt-rol').value,
      tipoCobro:    document.getElementById('nt-tipoCobro').value,
      salarioFijo:  parseFloat(document.getElementById('nt-salarioFijo').value)||0,
      tarifaDia:    parseFloat(document.getElementById('nt-dia').value)||0,
      tarifaNoche:  parseFloat(document.getElementById('nt-noche').value)||0,
      tarifaHora:   parseFloat(document.getElementById('nt-hora').value)||0,
      tarifaSemana: parseFloat(document.getElementById('nt-semana').value)||null,
    };
    if (id) data.id = id;
    
    if (!data.nombre) { UI.toast('Nombre requerido', 'error'); return; }
    await DB.saveTrabajador(data);
    document.getElementById('modal-trabajador').style.display = 'none';
    UI.toast(id ? 'Trabajador actualizado' : 'Trabajador agregado', 'success');
    tabActiva = 'trabajadores';
    await renderContent();
  };

  await renderContent();
});
