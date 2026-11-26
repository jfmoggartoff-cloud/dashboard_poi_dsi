/* ============================================================
   Monitor de solo lectura (jefaturas): laptop (pestañas) y TV (rotación).
   URL: monitor.html?modo=tv&tema=oscuro&anio=2026&seg=20
   ============================================================ */
(function () {
  'use strict';
  const D = window.DSI;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);

  let config = null, datos = null, pantallas = [], actual = 0, timerRot = null, timerRecarga = null, inicioRot = 0;
  let modoTV = q.get('modo') === 'tv';
  let filtroResp = '';

  /* ---------- números animados ----------
     cnt() deja el valor final escrito (sirve sin animación) y lo marca para contar desde 0. */
  function cnt(v, dec, suf) {
    if (v == null || isNaN(v)) return '—';
    return '<span class="cuenta" data-v="' + v + '" data-d="' + (dec || 0) + '" data-s="' + esc(suf || '') + '">' + D.fmt(v, dec || 0) + esc(suf || '') + '</span>';
  }
  function cntPct(r) { return r == null || isNaN(r) ? '—' : cnt(Math.round(r * 100), 0, '%'); }
  const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animarCifras(raiz) {
    if (sinMovimiento()) return;
    const els = Array.from(raiz.querySelectorAll('.cuenta'));
    if (!els.length) return;
    const t0 = performance.now(), dur = 1300;
    els.forEach((el, k) => { el._ret = Math.min(k * 35, 500); el._fin = el.textContent; el.textContent = D.fmt(0, +el.dataset.d) + el.dataset.s; });
    (function paso(t) {
      let vivos = false;
      els.forEach(el => {
        const x = Math.min(1, Math.max(0, (t - t0 - el._ret) / dur));
        const e = 1 - Math.pow(1 - x, 3);
        el.textContent = x >= 1 ? el._fin : D.fmt(+el.dataset.v * e, +el.dataset.d) + el.dataset.s;
        if (x < 1) vivos = true;
      });
      if (vivos) requestAnimationFrame(paso);
    })(t0);
  }

  /* ---------- piezas visuales ---------- */
  function estadoHTML(est, pct) {
    return '<span class="estado ' + est.clave + '"><i aria-hidden="true">' + est.icono + '</i>' +
      (pct != null ? pct + ' · ' : '') + esc(est.etiqueta) + '</span>';
  }
  function barraHTML(r) {
    const w = r.avanceTope == null ? 0 : r.avanceTope * 100;
    const marca = r.esperado == null || r.esPorcentaje ? '' :
      '<span class="marca" style="left:calc(' + (r.esperado * 100) + '% - 1.5px)" title="Programado a la fecha: ' + D.fmt(r.progFecha) + '"></span>';
    return '<div class="barra" role="img" aria-label="Avance ' + D.fmtPct(r.avance) + ' de la meta anual">' +
      '<span class="relleno ' + r.estado.clave + '" style="--w:' + w + '%"></span>' + marca + '</div>';
  }
  /* Gráfico mensual en HTML (columnas flexibles): las barras se escalan, el texto nunca se deforma. */
  function mensualSVG(r, grande) {
    const corte = datos.corte || 12;
    const u = r.esPorcentaje ? '%' : '';
    const max = r.esPorcentaje ? 100 : Math.max(1, ...r.prog, ...r.ejec.map(v => v || 0));
    const alto = v => v == null || v <= 0 ? 0 : Math.max(3, Math.min(100, v / max * 100));
    let s = '<div class="mensual' + (grande ? ' grande' : '') + '" role="img" aria-label="Programado y ejecutado por mes">';
    for (let m = 0; m < 12; m++) {
      const p = r.prog[m], e = r.ejec[m];
      s += '<div class="mes' + (m + 1 > corte ? ' futuro' : '') + '" style="--i:' + m + '" title="' + D.MESES[m] + ' · Programado ' + D.fmt(p) + u +
        ' · Ejecutado ' + (e == null ? 'sin dato' : D.fmt(e) + u) + '">' +
        '<div class="col"><span class="p" style="height:' + alto(p) + '%"></span><span class="e" style="height:' + alto(e) + '%"></span></div>' +
        '<span class="m">' + D.MESES_CORTOS[m] + '</span></div>';
    }
    return s + '</div>';
  }
  function nombreCorto(ind) { return ind.corto || ind.nombre; }
  function codCorto(ind) { return 'AOI ' + ind.codigo.slice(-3); }
  function equipoNombre(id) { const e = (datos.equipos || []).find(x => x.id === id); return e ? e.nombre : id; }

  function tarjetaIndicador(r, equipoActual) {
    const ind = r.ind;
    const unidad = (ind.unidad || '').toLowerCase();
    const otros = (ind.equipos || []).filter(e => e !== equipoActual);
    const ejecTxt = r.esPorcentaje ? cnt(r.ejecutado, 1) + '<small>%</small>' : cnt(r.ejecutado, 0);
    const metaTxt = r.esPorcentaje ? 'meta ' + D.fmt(r.metaAnual) + '% · promedio mensual' : 'de ' + D.fmt(r.metaAnual, 0) + ' (meta anual)';
    let chips = '<span class="chip unidad">' + esc(unidad) + '</span>';
    if (otros.length) chips += '<span class="chip">Compartida con ' + esc(otros.map(equipoNombre).join(', ')) + '</span>';
    const aviso = r.sinReporte.length ? '<span class="chip aviso">Sin reporte: ' + r.sinReporte.map(m => D.MESES_CORTOS[m - 1]).join(', ') + '</span>' : '';
    return '<article class="tarjeta ind" data-cod="' + esc(ind.codigo) + '" tabindex="0">' +
      '<div class="arriba"><span class="codigo">' + codCorto(ind) + ' · Meta ' + Number(ind.meta) + '</span><span class="der">' + aviso + estadoHTML(r.estado) + '</span></div>' +
      '<h3>' + esc(nombreCorto(ind)) + '</h3>' +
      '<div class="cifras"><div class="ejecutado num">' + ejecTxt + '</div>' +
      '<div class="pct"><b class="num">' + cntPct(r.avance) + '</b><span class="barra-pie">' + metaTxt + '</span></div></div>' +
      barraHTML(r) +
      (r.esPorcentaje ? '' : '<div class="barra-pie"><span>Programado a la fecha: <b class="num">' + D.fmt(r.progFecha, 0) + '</b></span><span>Faltan <b class="num">' + D.fmt(Math.max(0, r.metaAnual - r.ejecutado), 0) + '</b></span></div>') +
      mensualSVG(r) +
      '<div class="chips">' + chips + '</div>' +
      '</article>';
  }

  /* ---------- pantallas ---------- */
  function pResumen() {
    const g = D.resumenGeneral(datos);
    const est = g.estados;
    let h = '<div class="pantalla-titulo"><h2>Resumen general · POI ' + datos.anio + '</h2>' +
      '<span class="sub">' + (datos.indicadores || []).length + ' actividades operativas · avance contra la meta anual</span></div>';
    h += '<div class="resumen"><section class="tarjeta hero">' +
      '<span class="etq">Avance promedio de la DSI</span>' +
      '<span class="grande num">' + cntPct(g.avance) + '</span>' + estadoHTML(g.estado) +
      '<span class="nota">Promedio del avance de cada actividad (cada una con tope de 100%).</span>' +
      '<div class="conteo-estados">' +
      '<div class="estado-c" style="background:var(--ok-fondo);color:var(--ok-tinta)"><b class="num">' + cnt(est.verde) + '</b><span>✓ Meta cumplida</span></div>' +
      '<div style="background:var(--alerta-fondo);color:var(--alerta-tinta)"><b class="num">' + cnt(est.ambar) + '</b><span>! Cerca (80–99%)</span></div>' +
      '<div style="background:var(--mal-fondo);color:var(--mal-tinta)"><b class="num">' + cnt(est.rojo) + '</b><span>✕ Por debajo</span></div>' +
      '</div></section>';
    h += '<section class="equipos-grid">';
    g.equipos.forEach(e => {
      const n = e.resumenes.length;
      h += '<article class="tarjeta eq-tile" data-ir="eq:' + esc(e.equipo.id) + '" tabindex="0">' +
        '<h3>' + esc(e.equipo.nombre) + '</h3>' +
        '<span class="pct num">' + (n ? cntPct(e.avance) : '—') + '</span>' +
        (n ? estadoHTML(e.estado) : '<span class="det">Sin actividades asignadas</span>') +
        '<span class="det">' + n + ' actividad' + (n === 1 ? '' : 'es') + '</span>' +
        '<div class="puntos">' + e.resumenes.map(r => '<span class="punto ' + r.estado.clave + '" title="' + esc(codCorto(r.ind) + ' · ' + nombreCorto(r.ind) + ' · ' + D.fmtPct(r.avance)) + '">' + r.estado.icono + '</span>').join('') + '</div>' +
        '</article>';
    });
    h += '</section></div>';
    return h;
  }
  function pEquipo(eqId, desde, hasta, pag, totalPags) {
    const e = D.resumenEquipo(datos, (datos.equipos || []).find(x => x.id === eqId));
    const rs = e.resumenes.slice(desde, hasta);
    let h = '<div class="pantalla-titulo"><h2>' + esc(e.equipo.nombre) + '</h2>' +
      '<span class="sub">' + (e.resumenes.length ? 'Avance promedio <b>' + D.fmtPct(e.avance) + '</b> · ' + e.resumenes.length + ' actividades' : 'Sin actividades asignadas') +
      (totalPags > 1 ? ' · página ' + pag + ' de ' + totalPags : '') + '</span>' +
      (e.resumenes.length ? estadoHTML(e.estado) : '') + '</div>';
    if (!rs.length) return h + '<div class="tarjeta vacio">Este equipo aún no tiene actividades asignadas. Se asignan en Administración → Equipos.</div>';
    h += '<section class="indicadores">' + rs.map(r => tarjetaIndicador(r, eqId)).join('') + '</section>';
    return h;
  }
  function indicadoresConMatriz(eqId) {
    return (datos.indicadores || []).filter(i => i.fuente && i.fuente.registro && (!eqId || (i.equipos || []).includes(eqId)));
  }
  function bloqueResponsables(ind, soloPersona) {
    let filas = D.porResponsable(datos, ind);
    if (soloPersona) filas = filas.filter(f => f.persona.id === soloPersona);
    const esPct = ind.fuente.medida === 'porcentaje';
    const max = Math.max(1, ...filas.map(f => esPct ? 100 : (f.valor || 0)));
    let h = '<section class="tarjeta resp-bloque"><h3>' + esc(nombreCorto(ind)) + '</h3>' +
      '<div class="sub">' + codCorto(ind) + ' · según matrices hasta ' + D.MESES[(datos.corte || 12) - 1].toLowerCase() +
      (esPct ? ' · % en plazo (n.° de expedientes)' : '') + '</div>';
    if (!filas.length) return h + '<div class="vacio">Sin registros en las matrices.</div></section>';
    filas.slice(0, 10).forEach(f => {
      const v = f.valor || 0;
      h += '<div class="resp-fila"><span class="n" title="' + esc(f.persona.nombre) + '">' + esc(f.persona.nombre) +
        (f.persona.enCatalogo ? '' : ' <small>(sin catálogo)</small>') + '</span>' +
        '<span class="hbar"><span style="--w:' + (v / max * 100) + '%"></span></span>' +
        '<span class="v num">' + (esPct ? cnt(v, 1, '%') + ' <small>(' + f.registros + ')</small>' : cnt(v, 0)) + '</span></div>';
    });
    if (filas.length > 10) h += '<div class="sub">… y ' + (filas.length - 10) + ' más</div>';
    return h + '</section>';
  }
  function pResponsables(eqId) {
    const inds = indicadoresConMatriz(eqId);
    const titulo = eqId ? 'Aporte por responsable · ' + esc(equipoNombre(eqId)) : 'Aporte por responsable';
    let h = '<div class="pantalla-titulo"><h2>' + titulo + '</h2><span class="sub">Actividades que se calculan desde las matrices. Un registro con varios responsables suma para cada uno.</span></div>';
    if (!modoTV) {
      const personas = new Map();
      inds.forEach(i => D.porResponsable(datos, i).forEach(f => personas.set(f.persona.id, f.persona.nombre)));
      h += '<div class="filtro-resp"><label for="selResp">Responsable:</label><select id="selResp"><option value="">Todos</option>' +
        Array.from(personas.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => '<option value="' + esc(id) + '"' + (id === filtroResp ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
        '</select></div>';
    }
    if (!inds.length) return h + '<div class="tarjeta vacio">Ninguna actividad se calcula desde matrices todavía.</div>';
    h += '<div class="resp-grid">' + inds.map(i => bloqueResponsables(i, filtroResp)).join('') + '</div>';
    return h;
  }

  function construirPantallas() {
    const porPagina = 6;
    pantallas = [{ id: 'resumen', nombre: 'Resumen', html: pResumen }];
    (datos.equipos || []).forEach(eq => {
      const n = D.indicadoresDeEquipo(datos, eq.id).length;
      if (modoTV) {
        const pags = Math.max(1, Math.ceil(n / porPagina));
        for (let p = 0; p < pags; p++) pantallas.push({ id: 'eq:' + eq.id, nombre: eq.nombre, html: () => pEquipo(eq.id, p * porPagina, (p + 1) * porPagina, p + 1, pags) });
        if (indicadoresConMatriz(eq.id).length) pantallas.push({ id: 'resp:' + eq.id, nombre: 'Responsables ' + eq.nombre, html: () => pResponsables(eq.id) });
      } else {
        pantallas.push({ id: 'eq:' + eq.id, nombre: eq.nombre, html: () => pEquipo(eq.id, 0, 999, 1, 1) });
      }
    });
    if (!modoTV) pantallas.push({ id: 'resp', nombre: 'Responsables', html: () => pResponsables(null) });
  }

  /* TV: reduce la escala (--k) hasta que ninguna ficha ni bloque se desborde. Se mide con las cifras finales. */
  function ajustarTV() {
    const main = $("#main");
    if (!modoTV) { main.style.removeProperty("--k"); return; }
    const cajas = () => [main].concat(Array.from(main.querySelectorAll(".tarjeta, .indicadores, .equipos-grid, .resp-grid")));
    const desborda = () => cajas().some(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    main.classList.add("midiendo");
    let k = 1;
    main.style.setProperty("--k", k);
    while (desborda() && k > 0.55) { k = Math.round((k - 0.03) * 100) / 100; main.style.setProperty("--k", k); }
    main.classList.remove("midiendo");
  }

  function mostrar(i) {
    actual = (i + pantallas.length) % pantallas.length;
    const p = pantallas[actual];
    const main = $('#main');
    main.innerHTML = p.html();
    main.querySelectorAll('.tarjeta').forEach((t, k) => t.style.setProperty('--d', (k * 70) + 'ms'));
    ajustarTV();
    animarCifras(main);
    $('#tabs').innerHTML = pantallas.map((x, k) => '<button class="tab" role="tab" aria-selected="' + (k === actual) + '" data-k="' + k + '">' + esc(x.nombre) + '</button>').join('');
    $('#pags').innerHTML = modoTV ? pantallas.map((x, k) => '<span class="' + (k === actual ? 'act' : '') + '"></span>').join('') : '';
    try { if (!modoTV) history.replaceState(null, '', '#' + p.id); } catch (e) {}
    const sel = $('#selResp');
    if (sel) sel.onchange = () => { filtroResp = sel.value; mostrar(actual); };
  }

  /* ---------- detalle de un indicador ---------- */
  function abrirDetalle(cod) {
    const ind = datos.indicadores.find(i => i.codigo === cod);
    if (!ind) return;
    const r = D.resumenIndicador(datos, ind);
    const calc = D.ejecucionCalculada(datos, ind);
    const meta = (datos.metas || []).find(m => m.id === ind.meta) || {};
    let h = '<button class="btn chico cerrar" id="cerrarDet">✕ Cerrar</button>' +
      '<div class="chips"><span class="chip">' + esc(ind.codigo) + '</span><span class="chip">Meta ' + Number(ind.meta) + ' · ' + esc(meta.actividad || '') + '</span>' +
      (ind.equipos || []).map(e => '<span class="chip">' + esc(equipoNombre(e)) + '</span>').join('') + '</div>' +
      '<h2>' + esc(nombreCorto(ind)) + '</h2><p class="def">' + esc(ind.nombre) + '<br><small>' + esc(ind.definicion || '') + '</small></p>' +
      '<div style="display:flex;gap:1.5em;align-items:center;flex-wrap:wrap;margin-bottom:1em">' +
      '<div class="ejecutado num" style="font-size:2.6em;font-weight:700">' + (r.esPorcentaje ? D.fmt(r.ejecutado) + '%' : D.fmt(r.ejecutado, 0)) + '</div>' +
      '<div>' + (r.esPorcentaje ? 'promedio · meta ' + D.fmt(r.metaAnual) + '%' : 'ejecutado de ' + D.fmt(r.metaAnual, 0) + ' (meta anual)') + '<br>' + estadoHTML(r.estado, D.fmtPct(r.avance)) + '</div></div>' +
      barraHTML(r) + '<div style="margin:1em 0">' + mensualSVG(r, true) + '</div>' +
      '<div class="leyenda" style="margin-bottom:1em"><span><span class="sw e"></span>Ejecutado</span><span><span class="sw p"></span>Programado</span></div>';
    h += '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Mes</th><th>Programado</th><th>Ejecutado</th>' + (calc ? '<th>Según matrices</th>' : '') + '</tr></thead><tbody>';
    for (let m = 0; m < 12; m++) {
      const u = r.esPorcentaje ? '%' : '';
      h += '<tr><td>' + D.MESES[m] + '</td><td class="num">' + D.fmt(r.prog[m]) + u + '</td><td class="num">' + (r.ejec[m] == null ? '—' : D.fmt(r.ejec[m]) + u) + '</td>' +
        (calc ? '<td class="num">' + (calc[m] == null ? '—' : D.fmt(calc[m]) + u) + '</td>' : '') + '</tr>';
    }
    h += '<tr class="total"><td>' + (r.esPorcentaje ? 'Promedio' : 'Total') + '</td><td class="num">' + D.fmt(r.metaAnual) + '</td><td class="num">' + D.fmt(r.ejecutado) + '</td>' + (calc ? '<td></td>' : '') + '</tr>';
    h += '</tbody></table></div>';
    if (ind.fuente && ind.fuente.registro) h += '<div style="margin-top:1.2em">' + bloqueResponsables(ind) + '</div>';
    $('#detalleCuerpo').innerHTML = h;
    const dlg = $('#detalle');
    dlg.showModal();
    $('#cerrarDet').onclick = () => dlg.close();
  }

  /* ---------- modo TV ---------- */
  function segundos() { return Number(q.get('seg')) || (config && config.monitor && config.monitor.segundosPorPantalla) || 20; }
  function animarProgreso() {
    const bar = $('#progresoRot');
    if (!modoTV) { bar.style.width = 0; return; }
    const t = (Date.now() - inicioRot) / (segundos() * 1000);
    bar.style.width = Math.min(100, t * 100) + '%';
    requestAnimationFrame(animarProgreso);
  }
  function iniciarRotacion() {
    clearInterval(timerRot);
    if (!modoTV) return;
    inicioRot = Date.now();
    timerRot = setInterval(() => { inicioRot = Date.now(); mostrar(actual + 1); }, segundos() * 1000);
    requestAnimationFrame(animarProgreso);
  }
  function aplicarModo() {
    document.body.classList.toggle('tv', modoTV);
    construirPantallas();
    const hash = location.hash.slice(1);
    const k = pantallas.findIndex(p => p.id === hash);
    mostrar(modoTV ? 0 : (k >= 0 ? k : 0));
    iniciarRotacion();
  }
  function entrarTV() {
    modoTV = true; aplicarModo();
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }
  function salirTV() {
    if (q.get('modo') === 'tv') return; // en un TV configurado con ?modo=tv no se sale
    modoTV = false; aplicarModo();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /* ---------- datos ---------- */
  function pintarCabecera() {
    const mes = D.MESES[(datos.corte || 12) - 1];
    $('#corte').innerHTML = 'Ejecución reportada a<b>' + mes + ' ' + datos.anio + '</b>' +
      (datos.actualizado ? 'Actualizado: ' + new Date(datos.actualizado).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    $('#subtitulo').textContent = 'Seguimiento del Plan Operativo Institucional ' + datos.anio;
    document.title = 'Seguimiento POI ' + datos.anio + ' · DSI';
  }
  async function cargar(anio) {
    datos = await D.cargarAnio(anio);
    pintarCabecera();
  }
  async function recargar() {
    try {
      const antes = JSON.stringify(datos);
      await cargar(datos.anio);
      if (JSON.stringify(datos) !== antes) { construirPantallas(); mostrar(Math.min(actual, pantallas.length - 1)); }
    } catch (e) { /* sin conexión: se mantiene lo último cargado */ }
  }

  async function iniciar() {
    try {
      config = await D.cargarConfig();
      const anios = config.anios || [new Date().getFullYear()];
      const anio = Number(q.get('anio')) || config.anioMonitor || anios[anios.length - 1];
      $('#selAnio').innerHTML = anios.map(a => '<option' + (a === anio ? ' selected' : '') + '>' + a + '</option>').join('');
      $('#selAnio').onchange = async e => { await cargar(Number(e.target.value)); aplicarModo(); };
      await cargar(anio);
      aplicarModo();
      const min = (config.monitor && config.monitor.minutosRecarga) || 5;
      timerRecarga = setInterval(recargar, min * 60 * 1000);
    } catch (e) {
      $('#main').innerHTML = '<div class="tarjeta vacio">No se pudieron cargar los datos.<br><small>' + esc(e.message) + '</small></div>';
    }
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-k]');
    if (tab) { mostrar(Number(tab.dataset.k)); return; }
    if (modoTV) { if (!e.target.closest('dialog')) salirTV(); return; }
    const ir = e.target.closest('[data-ir]');
    if (ir) { const k = pantallas.findIndex(p => p.id === ir.dataset.ir); if (k >= 0) mostrar(k); return; }
    const card = e.target.closest('.ind[data-cod]');
    if (card) abrirDetalle(card.dataset.cod);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const card = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-cod],[data-ir]'); if (card) card.click(); }
    if (modoTV && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { inicioRot = Date.now(); mostrar(actual + (e.key === 'ArrowRight' ? 1 : -1)); iniciarRotacion(); }
    if (modoTV && e.key === 'Escape') salirTV();
  });
  $('#btnTV').onclick = e => { e.stopPropagation(); entrarTV(); };
  let timerAjuste = null;
  window.addEventListener('resize', () => { clearTimeout(timerAjuste); timerAjuste = setTimeout(ajustarTV, 200); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ajustarTV());
  $('#btnTema').onclick = () => {
    const r = document.documentElement;
    r.setAttribute('data-tema', r.getAttribute('data-tema') === 'oscuro' ? 'claro' : 'oscuro');
  };
  iniciar();
})();
