/* ============================================================
   Administración del dashboard POI · DSI
   - Acceso con usuario y contraseña general (hash SHA-256 en datos/config.json).
     OJO: en un sitio estático esto solo evita ediciones casuales; no es seguridad real.
   - Los cambios se guardan como BORRADOR en este navegador y se publican con:
       · "Guardar en carpeta local" (solo con herramientas/servidor.ps1),
       · "Publicar en GitHub" (API de GitHub con un token personal guardado solo en este navegador),
       · o descargando los JSON para subirlos a mano.
   ============================================================ */
(function () {
  'use strict';
  const D = window.DSI, I = window.DSI_IMPORT, X = window.DSI_EXPORT, C = window.DSI_CATALOGO;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clon = o => JSON.parse(JSON.stringify(o));
  const ES_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  let config = null, datos = null, publicado = null, seccion = 'inicio', tipoMatriz = 'eventos', indSel = null;

  /* ---------------- utilidades ---------------- */
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('ver'), ms || 3200);
  }
  async function sha256(txt) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function leerArchivo(file) {
    return new Promise((ok, mal) => {
      const r = new FileReader();
      r.onload = () => { try { ok(XLSX.read(new Uint8Array(r.result), { type: 'array' })); } catch (e) { mal(e); } };
      r.onerror = () => mal(r.error);
      r.readAsArrayBuffer(file);
    });
  }
  function descargar(nombre, texto, tipo) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: tipo || 'application/json' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function equipoNombre(id) { const e = (datos.equipos || []).find(x => x.id === id); return e ? e.nombre : id; }
  function cod3(ind) { return ind.codigo.slice(-3); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  /* ---------------- borrador ---------------- */
  const claveBorrador = () => 'dsi-poi-borrador-' + datos.anio;
  function cambio(sinRepintar) {
    datos.actualizado = new Date().toISOString();
    lsSet(claveBorrador(), JSON.stringify(datos));
    lsSet('dsi-poi-config-borrador', JSON.stringify(config));
    pintarEstado();
    if (!sinRepintar) pintar();
  }
  function hayCambios() { return publicado == null || JSON.stringify(publicado) !== JSON.stringify(datos); }
  function pintarEstado() {
    $('#estadoGuardado').innerHTML = 'POI ' + datos.anio + ' · corte ' + D.MESES[(datos.corte || 12) - 1].toLowerCase() +
      '<b>' + (hayCambios() ? '● Cambios sin publicar' : '✓ Publicado') + '</b>';
    const av = $('#aviso');
    if (hayCambios()) {
      av.classList.remove('oculto');
      av.innerHTML = '<span>Hay cambios guardados solo en este navegador. El monitor no los verá hasta que los publique.</span>' +
        '<span class="acciones">' + (ES_LOCAL ? '<button class="btn chico prim" data-acc="guardarLocal">Guardar en carpeta local</button>' : '') +
        '<button class="btn chico' + (ES_LOCAL ? '' : ' prim') + '" data-acc="publicarGH">Publicar en GitHub</button>' +
        '<button class="btn chico" data-acc="descargarJSON">Descargar archivos</button>' +
        '<button class="btn chico" data-acc="descartar">Descartar cambios</button></span>';
    } else av.classList.add('oculto');
  }

  /* ---------------- publicación ---------------- */
  function jsonDatos() { return JSON.stringify(datos, null, 1); }
  function jsonConfig() { return JSON.stringify(config, null, 2); }
  async function guardarLocal() {
    for (const [arch, txt] of [['datos/poi-' + datos.anio + '.json', jsonDatos()], ['datos/config.json', jsonConfig()]]) {
      const r = await fetch('__local/guardar?archivo=' + encodeURIComponent(arch), { method: 'POST', body: txt });
      if (!r.ok) throw new Error('No se pudo guardar ' + arch + ': ' + (await r.text()));
    }
    publicado = clon(datos); lsSet(claveBorrador(), null);
    toast('Guardado en la carpeta app/datos. Súbalo a GitHub para que lo vean las jefaturas.');
    pintarEstado();
  }
  function descargarJSON() {
    descargar('poi-' + datos.anio + '.json', jsonDatos());
    setTimeout(() => descargar('config.json', jsonConfig()), 400);
    toast('Suba ambos archivos a la carpeta "datos" del repositorio.');
  }
  async function publicarGH() {
    const gh = config.github || {};
    const token = lsGet('dsi-poi-gh-token');
    if (!gh.propietario || !gh.repositorio || !token) {
      seccion = 'ajustes'; pintar();
      toast('Configure primero el repositorio y el token de GitHub en Ajustes.', 5000); return;
    }
    const base = 'https://api.github.com/repos/' + encodeURIComponent(gh.propietario) + '/' + encodeURIComponent(gh.repositorio) + '/contents/';
    const rama = gh.rama || 'main';
    const pref = (gh.carpeta || '').replace(/^\/|\/$/g, '');
    const h = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    const b64 = s => btoa(unescape(encodeURIComponent(s)));
    for (const [arch, txt] of [['datos/poi-' + datos.anio + '.json', jsonDatos()], ['datos/config.json', jsonConfig()]]) {
      const ruta = (pref ? pref + '/' : '') + arch;
      let sha;
      const g = await fetch(base + ruta + '?ref=' + encodeURIComponent(rama), { headers: h });
      if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error('GitHub respondió ' + g.status + ' al leer ' + ruta);
      const p = await fetch(base + ruta, {
        method: 'PUT', headers: h,
        body: JSON.stringify({ message: 'Actualiza ' + arch + ' (dashboard POI DSI)', content: b64(txt), branch: rama, sha })
      });
      if (!p.ok) throw new Error('GitHub respondió ' + p.status + ' al publicar ' + ruta + ': ' + (await p.text()).slice(0, 200));
    }
    publicado = clon(datos); lsSet(claveBorrador(), null);
    toast('Publicado en GitHub. El monitor lo mostrará en unos minutos.', 5000);
    pintarEstado();
  }
  async function accion(nombre, fn) {
    try { await fn(); } catch (e) { console.error(e); toast('Error: ' + e.message, 7000); }
  }

  /* ---------------- secciones ---------------- */
  function sInicio() {
    const g = D.resumenGeneral(datos);
    const sinEquipo = datos.indicadores.filter(i => !(i.equipos || []).length);
    const sinCat = D.responsablesSinCatalogo(datos);
    const sinRep = g.resumenes.filter(r => r.sinReporte.length);
    const nReg = Object.keys(datos.registros || {}).reduce((a, k) => a + datos.registros[k].length, 0);
    let h = '<h2>Inicio · POI ' + datos.anio + '</h2><p class="ayuda">Resumen del estado de los datos. Lo que se publique aquí es lo que ven las jefaturas en el monitor.</p>';
    h += '<div class="kpis">' +
      '<div class="kpi"><b>' + D.fmtPct(g.avance) + '</b><span>Avance promedio DSI</span></div>' +
      '<div class="kpi"><b>' + datos.indicadores.length + '</b><span>Actividades operativas</span></div>' +
      '<div class="kpi"><b>' + g.estados.verde + ' · ' + g.estados.ambar + ' · ' + g.estados.rojo + '</b><span>✓ cumplidas · ! cerca · ✕ por debajo</span></div>' +
      '<div class="kpi"><b>' + nReg + '</b><span>Registros en matrices</span></div></div>';
    h += '<div class="grid2"><section class="tarjeta"><h3>Mes de corte</h3><p class="ayuda">Último mes con ejecución reportada. El avance y el "programado a la fecha" se calculan hasta este mes.</p>' +
      '<select id="selCorte">' + D.MESES.map((m, k) => '<option value="' + (k + 1) + '"' + (k + 1 === datos.corte ? ' selected' : '') + '>' + m + ' ' + datos.anio + '</option>').join('') + '</select></section>';
    h += '<section class="tarjeta"><h3>Pendientes</h3><ul class="lista-avisos">';
    if (!sinEquipo.length && !sinCat.length && !sinRep.length) h += '<li>Nada pendiente.</li>';
    if (sinEquipo.length) h += '<li><b>' + sinEquipo.length + '</b> actividad(es) sin equipo: ' + sinEquipo.map(i => 'AOI ' + cod3(i)).join(', ') + ' → <a href="#" data-ir="equipos">asignar</a></li>';
    if (sinCat.length) h += '<li><b>' + sinCat.length + '</b> nombre(s) de responsables en las matrices que no están en el catálogo → <a href="#" data-ir="equipos">revisar</a></li>';
    sinRep.forEach(r => h += '<li>AOI ' + cod3(r.ind) + ' sin ejecución reportada en ' + r.sinReporte.map(m => D.MESES_CORTOS[m - 1]).join(', ') + '</li>');
    h += '</ul></section></div>';
    h += '<section class="tarjeta"><h3>Avance por equipo</h3><table class="tabla admin-t"><thead><tr><th>Equipo</th><th class="n">Actividades</th><th class="n">Avance</th><th>Estado</th></tr></thead><tbody>' +
      g.equipos.map(e => '<tr><td>' + esc(e.equipo.nombre) + '</td><td class="n">' + e.resumenes.length + '</td><td class="n">' + D.fmtPct(e.avance) + '</td><td>' + (e.resumenes.length ? e.estado.icono + ' ' + e.estado.etiqueta : '—') + '</td></tr>').join('') +
      '</tbody></table></section>';
    return h;
  }

  function sActividades() {
    let h = '<h2>Actividades POI ' + datos.anio + '</h2><p class="ayuda">Haga clic en una actividad para editar su nombre corto, programación, ejecución oficial, comentarios de sustento y la regla con la que se calcula desde las matrices.</p>';
    h += '<section class="tarjeta"><div class="tabla-scroll"><table class="tabla admin-t"><thead><tr><th>Meta</th><th>Código</th><th>Nombre corto</th><th>Equipo(s)</th><th>Fuente</th><th class="n">Meta anual</th><th class="n">Ejecutado</th><th class="n">Avance</th></tr></thead><tbody>';
    datos.indicadores.forEach(ind => {
      const r = D.resumenIndicador(datos, ind);
      const f = ind.fuente || {};
      h += '<tr style="cursor:pointer" data-editar="' + esc(ind.codigo) + '"><td>' + Number(ind.meta) + '</td><td>' + esc(ind.codigo) + '</td><td><b>' + esc(ind.corto || '(sin nombre corto)') + '</b><br><small>' + esc(ind.nombre.slice(0, 110)) + '</small></td>' +
        '<td>' + (ind.equipos || []).map(e => '<span class="pill">' + esc(equipoNombre(e)) + '</span>').join('') + '</td>' +
        '<td>' + (f.registro ? '<span class="pill calc">' + esc(D.TIPOS_REGISTRO[f.registro].nombre) + '</span>' + (f.desdeMes ? '<br><small>usa matrices desde ' + D.MESES[f.desdeMes - 1].toLowerCase() + '</small>' : '<br><small>oficial manual</small>') : '<span class="pill">Manual</span>') + '</td>' +
        '<td class="n">' + D.fmt(r.metaAnual) + '</td><td class="n">' + D.fmt(r.ejecutado) + '</td><td class="n">' + r.estado.icono + ' ' + D.fmtPct(r.avance) + '</td></tr>';
    });
    h += '</tbody></table></div></section>';
    return h;
  }

  function editorIndicador(cod) {
    const ind = datos.indicadores.find(i => i.codigo === cod);
    const f = ind.fuente = ind.fuente || C.fuenteVacia();
    const calc = D.ejecucionCalculada(datos, ind);
    const campos = f.registro ? D.TIPOS_REGISTRO[f.registro].campos.filter(c => c[2] === 'texto' || c[2] === 'lista') : [];
    const campoFiltro = Object.keys(f.filtro || {})[0] || '';
    let h = '<button class="btn chico cerrar" data-cerrar>✕ Cerrar</button>' +
      '<p class="chips"><span class="chip">' + esc(ind.codigo) + '</span><span class="chip">Meta ' + Number(ind.meta) + '</span><span class="chip">Hoja ' + esc(ind.hoja || '') + '</span></p>' +
      '<h2>' + esc(ind.corto || ind.nombre) + '</h2>' +
      '<div class="fila"><label>Nombre corto (lo que ve el monitor) <input id="eCorto" value="' + esc(ind.corto) + '" maxlength="70"></label>' +
      '<label class="fijo">Unidad <input id="eUnidad" value="' + esc(ind.unidad) + '"></label>' +
      '<label class="fijo">Agregación <select id="eAgr"><option value="suma"' + (ind.agregacion !== 'promedio' ? ' selected' : '') + '>Suma (cantidad)</option><option value="promedio"' + (ind.agregacion === 'promedio' ? ' selected' : '') + '>Promedio (porcentaje)</option></select></label></div>' +
      '<label style="margin-top:10px">Actividad operativa (nombre oficial) <textarea id="eNombre">' + esc(ind.nombre) + '</textarea></label>' +
      '<details><summary>Definición</summary><textarea id="eDef">' + esc(ind.definicion) + '</textarea></details>';
    h += '<h3 style="margin-top:16px">Programación y ejecución oficial</h3><div class="meses-grid"><span></span>' + D.MESES_CORTOS.map(m => '<span class="h">' + m + '</span>').join('') +
      '<span>Programado</span>' + ind.prog.map((v, k) => '<input type="number" step="any" data-prog="' + k + '" value="' + (v == null ? '' : v) + '">').join('') +
      '<span>Ejecutado oficial</span>' + ind.ejec.map((v, k) => '<input type="number" step="any" data-ejec="' + k + '" value="' + (v == null ? '' : v) + '" placeholder="—">').join('') +
      (calc ? '<span>Según matrices</span>' + calc.map((v, k) => '<span class="h' + (v != null && ind.ejec[k] != null && Math.abs(v - ind.ejec[k]) > 0.05 ? ' dif' : '') + '">' + (v == null ? '—' : D.fmt(v)) + '</span>').join('') : '') +
      '</div><p class="ayuda" style="margin-top:6px">Deje vacío el ejecutado de un mes sin reporte (se mostrará como "sin reporte"). Escriba 0 si el resultado fue cero.</p>';
    h += '<h3 style="margin-top:16px">Regla de cálculo desde matrices</h3><div class="fila">' +
      '<label>Matriz fuente <select id="eReg"><option value="">Ninguna (solo carga manual)</option>' + Object.keys(D.TIPOS_REGISTRO).map(t => '<option value="' + t + '"' + (f.registro === t ? ' selected' : '') + '>' + esc(D.TIPOS_REGISTRO[t].nombre) + '</option>').join('') + '</select></label>' +
      (f.registro ? '<label>Medida <select id="eMed">' + Object.keys(D.MEDIDAS).map(m => '<option value="' + m + '"' + (f.medida === m ? ' selected' : '') + '>' + D.MEDIDAS[m] + '</option>').join('') + '</select></label>' +
        '<label>Filtrar por campo <select id="eFCampo"><option value="">Sin filtro</option>' + campos.map(c => '<option value="' + c[0] + '"' + (campoFiltro === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>').join('') + '</select></label>' +
        '<label>Valores que cuentan (separados por ;) <input id="eFVal" value="' + esc(campoFiltro ? (f.filtro[campoFiltro] || []).join('; ') : '') + '"' + (campoFiltro ? '' : ' disabled') + '></label>' +
        (f.medida === 'porcentaje' ? '<label class="fijo">Plazo (días hábiles) <input id="eLim" type="number" value="' + (f.limiteDias || 18) + '"></label>' : '') +
        '<label>Usar matrices como ejecución desde <select id="eDesde"><option value="">Nunca (mostrar solo lo oficial)</option>' + D.MESES.map((m, k) => '<option value="' + (k + 1) + '"' + (f.desdeMes === k + 1 ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label>' : '') +
      '</div>';
    h += '<h3 style="margin-top:16px">Comentarios de sustento</h3><p class="ayuda">Quedan en el reporte interno; el monitor no los muestra.</p><div class="grid2">' +
      D.MESES.map((m, k) => (ind.sustento || {})[k + 1] || k + 1 <= (datos.corte || 12) ? '<label>' + m + '<textarea data-sust="' + (k + 1) + '">' + esc((ind.sustento || {})[k + 1] || '') + '</textarea></label>' : '').join('') + '</div>';
    h += '<p class="acciones" style="margin-top:16px"><button class="btn prim" data-guardar-ind="' + esc(cod) + '">Guardar actividad</button><button class="btn" data-cerrar>Cancelar</button></p>';
    $('#dlgCuerpo').innerHTML = h;
    if (!$('#dlg').open) $('#dlg').showModal();
    const rerender = () => { leerEditor(ind, true); editorIndicador(cod); };
    $('#eReg').onchange = () => {
      ind.fuente = Object.assign(C.fuenteVacia(), { registro: $('#eReg').value || null, medida: $('#eReg').value === 'expedientes' ? 'porcentaje' : 'conteo' });
      editorIndicador(cod);
    };
    if ($('#eMed')) $('#eMed').onchange = rerender;
    if ($('#eFCampo')) $('#eFCampo').onchange = () => { const k = $('#eFCampo').value; leerEditor(ind, true); ind.fuente.filtro = k ? { [k]: [] } : {}; editorIndicador(cod); };
  }
  function leerEditor(ind, parcial) {
    ind.corto = $('#eCorto').value.trim();
    ind.unidad = $('#eUnidad').value.trim();
    ind.agregacion = $('#eAgr').value;
    ind.nombre = $('#eNombre').value.trim();
    ind.definicion = $('#eDef').value.trim();
    $$('[data-prog]').forEach(i => ind.prog[+i.dataset.prog] = i.value === '' ? 0 : Number(i.value));
    $$('[data-ejec]').forEach(i => ind.ejec[+i.dataset.ejec] = i.value === '' ? null : Number(i.value));
    ind.sustento = ind.sustento || {};
    $$('[data-sust]').forEach(t => { const v = t.value.trim(); if (v) ind.sustento[t.dataset.sust] = v; else delete ind.sustento[t.dataset.sust]; });
    const f = ind.fuente;
    if (f.registro && $('#eMed')) {
      f.medida = $('#eMed').value;
      const k = $('#eFCampo').value;
      f.filtro = k ? { [k]: $('#eFVal').value.split(';').map(s => s.trim()).filter(Boolean) } : {};
      if ($('#eLim')) f.limiteDias = Number($('#eLim').value) || 18;
      f.desdeMes = $('#eDesde').value ? Number($('#eDesde').value) : null;
    }
    if (!parcial) cambio();
  }

  function sEquipos() {
    let h = '<h2>Equipos y responsables</h2><p class="ayuda">La asignación de actividades a equipos es <b>preliminar</b> y se puede cambiar en cualquier momento. Una actividad puede pertenecer a varios equipos (metas compartidas).</p>';
    // equipos
    h += '<section class="tarjeta"><h3>Equipos</h3><table class="tabla admin-t"><thead><tr><th>Nombre</th><th>Identificador</th><th class="n">Actividades</th><th></th></tr></thead><tbody>' +
      datos.equipos.map((e, k) => '<tr><td><input data-eq-nombre="' + k + '" value="' + esc(e.nombre) + '"></td><td><code>' + esc(e.id) + '</code></td><td class="n">' + D.indicadoresDeEquipo(datos, e.id).length + '</td>' +
        '<td><button class="btn chico" data-eq-subir="' + k + '"' + (k ? '' : ' disabled') + ' title="Subir">↑</button> <button class="btn chico" data-eq-borrar="' + k + '">Eliminar</button></td></tr>').join('') +
      '</tbody></table><p class="acciones" style="margin-top:10px"><input id="nuevoEquipo" placeholder="Nombre del nuevo equipo" style="max-width:300px"><button class="btn" data-acc="agregarEquipo">Agregar equipo</button></p></section>';
    // matriz de asignación
    h += '<section class="tarjeta"><h3>Matriz de responsabilidad: actividad × equipo</h3><div class="tabla-scroll"><table class="tabla admin-t"><thead><tr><th>Actividad</th>' +
      datos.equipos.map(e => '<th class="n">' + esc(e.nombre) + '</th>').join('') + '</tr></thead><tbody>' +
      datos.indicadores.map(ind => '<tr><td><b>AOI ' + cod3(ind) + '</b> · ' + esc(ind.corto || ind.nombre) + '</td>' +
        datos.equipos.map(e => '<td class="n"><input type="checkbox" data-asig="' + esc(ind.codigo) + '|' + esc(e.id) + '"' + ((ind.equipos || []).includes(e.id) ? ' checked' : '') + ' aria-label="' + esc(e.nombre + ' – AOI ' + cod3(ind)) + '"></td>').join('') + '</tr>').join('') +
      '</tbody></table></div></section>';
    // personas
    h += '<section class="tarjeta"><h3>Responsables (personal DSI)</h3><p class="ayuda">Los "alias" son las formas en que el nombre aparece en las matrices (p. ej. "JMC", "Felipe"). Sirven para segregar la información por responsable.</p>' +
      '<table class="tabla admin-t"><thead><tr><th>Nombre</th><th>Equipo</th><th>Alias (separados por ;)</th><th></th></tr></thead><tbody>' +
      datos.personas.map((p, k) => '<tr><td><input data-p-nombre="' + k + '" value="' + esc(p.nombre) + '"></td><td><select data-p-equipo="' + k + '"><option value="">—</option>' +
        datos.equipos.map(e => '<option value="' + esc(e.id) + '"' + (p.equipo === e.id ? ' selected' : '') + '>' + esc(e.nombre) + '</option>').join('') + '</select></td>' +
        '<td><input data-p-alias="' + k + '" value="' + esc((p.alias || []).join('; ')) + '"></td><td><button class="btn chico" data-p-borrar="' + k + '">Eliminar</button></td></tr>').join('') +
      '</tbody></table><p class="acciones" style="margin-top:10px"><input id="nuevaPersona" placeholder="Nombre y apellido" style="max-width:300px"><button class="btn" data-acc="agregarPersona">Agregar responsable</button></p>';
    const sin = D.responsablesSinCatalogo(datos);
    if (sin.length) {
      h += '<h3 style="margin-top:14px">Nombres en las matrices que no están en el catálogo</h3><table class="tabla admin-t"><thead><tr><th>Nombre tal como aparece</th><th>Matrices</th><th class="n">Registros</th><th>Asignar</th></tr></thead><tbody>' +
        sin.map((s, k) => '<tr><td>' + esc(s.nombre) + '</td><td>' + s.tipos.map(t => '<span class="pill">' + esc(D.TIPOS_REGISTRO[t].nombre) + '</span>').join('') + '</td><td class="n">' + s.n + '</td>' +
          '<td class="acciones"><select data-sin-sel="' + k + '"><option value="__nueva">Crear como nuevo responsable</option>' + datos.personas.map(p => '<option value="' + esc(p.id) + '">Alias de ' + esc(p.nombre) + '</option>').join('') + '</select>' +
          '<button class="btn chico" data-sin-ok="' + k + '" data-nombre="' + esc(s.nombre) + '">Aplicar</button></td></tr>').join('') + '</tbody></table>';
    }
    return h + '</section>';
  }

  function sMatrices() {
    const def = D.TIPOS_REGISTRO[tipoMatriz];
    const regs = (datos.registros[tipoMatriz] || []).slice().sort((a, b) => (a.mes - b.mes) || String(a.fecha || '').localeCompare(String(b.fecha || '')));
    const usan = datos.indicadores.filter(i => i.fuente && i.fuente.registro === tipoMatriz);
    let h = '<h2>Matrices de reporte</h2><p class="ayuda">Aquí se cargan las matrices (eventos, reuniones, atenciones, expedientes). Las actividades con regla de cálculo las cuentan automáticamente. <b>No se guardan nombres, correos ni teléfonos de contactos externos</b>: solo empresa, tema, responsable interno y número de personas.</p>';
    h += '<p class="acciones">' + Object.keys(D.TIPOS_REGISTRO).map(t => '<button class="tab btn" data-tipo="' + t + '" aria-selected="' + (t === tipoMatriz) + '">' + esc(D.TIPOS_REGISTRO[t].nombre) + ' <span class="pill">' + (datos.registros[t] || []).length + '</span></button>').join('') + '</p>';
    // resumen por mes
    h += '<section class="tarjeta"><h3>' + esc(def.nombre) + '</h3><p class="ayuda">La usan: ' + (usan.length ? usan.map(i => 'AOI ' + cod3(i) + ' (' + esc(i.corto) + ')').join(', ') : 'ninguna actividad todavía') + '.</p>' +
      '<div class="meses-grid"><span></span>' + D.MESES_CORTOS.map(m => '<span class="h">' + m + '</span>').join('') +
      '<span>Registros</span>' + D.MESES_CORTOS.map((m, k) => '<span class="h">' + regs.filter(r => r.mes === k + 1).length + '</span>').join('') +
      (def.campos.some(c => c[0] === 'personas') ? '<span>Personas</span>' + D.MESES_CORTOS.map((m, k) => '<span class="h">' + D.suma(regs.filter(r => r.mes === k + 1).map(r => r.personas == null ? 1 : r.personas)) + '</span>').join('') : '') +
      '</div></section>';
    // importar
    const formatos = I.FORMATOS[tipoMatriz] || [];
    h += '<section class="tarjeta"><h3>Importar desde Excel</h3><div class="fila">' +
      '<label>Formato <select id="mFormato">' + formatos.map(f => '<option value="' + f.id + '">' + esc(f.nombre) + '</option>').join('') + '<option value="plantilla">Plantilla estándar del dashboard</option></select></label>' +
      '<label>Al importar <select id="mModo"><option value="meses">Reemplazar los meses que trae el archivo</option><option value="todo">Reemplazar toda la matriz</option><option value="agregar">Agregar a lo existente</option></select></label>' +
      '<label>Archivo <input type="file" id="mArchivo" accept=".xlsx,.xls,.xlsm"></label></div>' +
      '<p class="acciones" style="margin-top:10px"><button class="btn prim" data-acc="importarMatriz">Importar</button><button class="btn" data-acc="plantilla">Descargar plantilla estándar</button></p><div id="mResultado"></div></section>';
    // tabla de registros
    const cols = def.campos.filter(c => c[0] !== 'asunto');
    h += '<section class="tarjeta"><div class="acciones" style="justify-content:space-between"><h3>Registros (' + regs.length + ')</h3><span class="acciones"><select id="mFiltroMes"><option value="">Todos los meses</option>' + D.MESES.map((m, k) => '<option value="' + (k + 1) + '">' + m + '</option>').join('') + '</select><button class="btn" data-acc="nuevoRegistro">+ Nuevo registro</button></span></div>' +
      '<div class="tabla-scroll"><table class="tabla admin-t" id="tRegs"><thead><tr><th>Mes</th>' + cols.map(c => '<th>' + esc(c[1]) + '</th>').join('') + '<th>Origen</th><th></th></tr></thead><tbody>' +
      regs.map(r => '<tr data-mes="' + r.mes + '"><td>' + D.MESES_CORTOS[r.mes - 1] + '</td>' + cols.map(c => '<td>' + esc(c[2] === 'numero' ? D.fmt(r[c[0]]) : String(r[c[0]] == null ? '' : r[c[0]]).slice(0, 90)) + '</td>').join('') +
        '<td><span class="pill">' + esc(r.origen || '') + '</span></td><td class="acciones"><button class="btn chico" data-reg-edit="' + r.id + '">Editar</button><button class="btn chico" data-reg-del="' + r.id + '">✕</button></td></tr>').join('') +
      '</tbody></table></div></section>';
    return h;
  }
  function editorRegistro(id) {
    const def = D.TIPOS_REGISTRO[tipoMatriz];
    const reg = id ? datos.registros[tipoMatriz].find(r => r.id === id) : { id: D.uid(), origen: 'manual', mes: datos.corte || 1 };
    let h = '<button class="btn chico cerrar" data-cerrar>✕ Cerrar</button><h2>' + (id ? 'Editar' : 'Nuevo') + ' registro · ' + esc(def.nombre) + '</h2><div class="grid2">' +
      '<label>Mes POI <select id="rMes">' + D.MESES.map((m, k) => '<option value="' + (k + 1) + '"' + (reg.mes === k + 1 ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label>' +
      def.campos.map(([k, et, t, ops]) => '<label>' + esc(et) + (t === 'lista' ? '<select data-campo="' + k + '"><option value=""></option>' + ops.map(o => '<option' + (reg[k] === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>'
        : '<input data-campo="' + k + '" type="' + (t === 'fecha' ? 'date' : t === 'numero' ? 'number' : 'text') + '" value="' + esc(reg[k] == null ? '' : reg[k]) + '"' + (t === 'personas' ? ' list="dlPersonas"' : '') + '>') + '</label>').join('') +
      '</div><datalist id="dlPersonas">' + datos.personas.map(p => '<option value="' + esc(p.nombre) + '">').join('') + '</datalist>' +
      '<p class="acciones" style="margin-top:14px"><button class="btn prim" id="rGuardar">Guardar</button><button class="btn" data-cerrar>Cancelar</button></p>';
    $('#dlgCuerpo').innerHTML = h;
    $('#dlg').showModal();
    $('#rGuardar').onclick = () => {
      reg.mes = Number($('#rMes').value);
      $$('[data-campo]').forEach(i => {
        const t = def.campos.find(c => c[0] === i.dataset.campo)[2];
        reg[i.dataset.campo] = t === 'numero' ? (i.value === '' ? null : Number(i.value)) : i.value.trim();
      });
      if (!id) datos.registros[tipoMatriz].push(reg);
      $('#dlg').close(); cambio(); toast('Registro guardado.');
    };
  }
  async function importarMatriz() {
    const file = $('#mArchivo').files[0];
    if (!file) { toast('Seleccione un archivo Excel.'); return; }
    const wb = await leerArchivo(file);
    const fmt = $('#mFormato').value;
    const res = fmt === 'plantilla' ? I.importarPlantilla(wb, tipoMatriz) : (I.FORMATOS[tipoMatriz].find(f => f.id === fmt)).fn(wb, datos.anio);
    const modo = $('#mModo').value;
    const meses = new Set(res.registros.map(r => r.mes));
    let lista = datos.registros[tipoMatriz] || [];
    if (modo === 'todo') lista = [];
    else if (modo === 'meses') lista = lista.filter(r => !meses.has(r.mes));
    datos.registros[tipoMatriz] = lista.concat(res.registros);
    cambio();
    $('#mResultado').innerHTML = '<p class="ayuda" style="margin-top:10px">✓ ' + res.registros.length + ' registros importados de: ' + esc(res.hojas.join(', ')) +
      ' · meses: ' + Array.from(meses).sort((a, b) => a - b).map(m => D.MESES_CORTOS[m - 1]).join(', ') + '</p>' +
      (res.avisos.length ? '<details><summary>' + res.avisos.length + ' aviso(s)</summary><ul class="lista-avisos">' + res.avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '');
  }

  function sConciliacion() {
    const inds = datos.indicadores.filter(i => i.fuente && i.fuente.registro);
    const corte = datos.corte || 12;
    let h = '<h2>Conciliación: POI oficial vs. matrices</h2><p class="ayuda">Compara lo reportado oficialmente en el POI con lo que cuentan las matrices. Las celdas resaltadas tienen diferencia. ' +
      'Puede copiar el valor de las matrices al oficial mes a mes, o indicar desde qué mes la actividad usa las matrices automáticamente (Actividades → regla de cálculo).</p>';
    if (!inds.length) return h + '<div class="tarjeta vacio">Ninguna actividad tiene regla de cálculo.</div>';
    inds.forEach(ind => {
      const calc = D.ejecucionCalculada(datos, ind);
      const u = ind.fuente.medida === 'porcentaje' ? '%' : '';
      h += '<section class="tarjeta"><div class="acciones" style="justify-content:space-between"><h3>AOI ' + cod3(ind) + ' · ' + esc(ind.corto) + '</h3><span class="pill calc">' + esc(D.TIPOS_REGISTRO[ind.fuente.registro].nombre) +
        (ind.fuente.desdeMes ? ' · automático desde ' + D.MESES[ind.fuente.desdeMes - 1].toLowerCase() : '') + '</span></div>' +
        '<div class="tabla-scroll"><table class="tabla"><thead><tr><th></th>' + D.MESES_CORTOS.slice(0, corte).map(m => '<th>' + m + '</th>').join('') + '</tr></thead><tbody>' +
        '<tr><td>Oficial POI</td>' + calc.slice(0, corte).map((c, k) => '<td>' + (ind.ejec[k] == null ? '—' : D.fmt(ind.ejec[k]) + u) + '</td>').join('') + '</tr>' +
        '<tr><td>Según matrices</td>' + calc.slice(0, corte).map((c, k) => { const o = ind.ejec[k]; const dif = c != null && o != null && Math.abs(c - o) > 0.05; return '<td class="' + (dif ? 'dif' : (c != null && o != null ? 'ok' : '')) + '">' + (c == null ? '—' : D.fmt(c) + u) + '</td>'; }).join('') + '</tr>' +
        '<tr><td></td>' + calc.slice(0, corte).map((c, k) => '<td>' + (c != null && c !== ind.ejec[k] ? '<button class="btn chico" data-copiar="' + esc(ind.codigo) + '|' + k + '" title="Copiar ' + D.fmt(c) + ' al oficial de ' + D.MESES[k] + '">← usar</button>' : '') + '</td>').join('') + '</tr>' +
        '</tbody></table></div></section>';
    });
    return h;
  }

  function sReportes() {
    return '<h2>Reportes en Excel</h2><p class="ayuda">Para compartir con áreas que todavía no usan el dashboard. El reporte usa la ejecución vigente (oficial, o de matrices donde se haya activado) hasta ' + D.MESES[(datos.corte || 12) - 1].toLowerCase() + ' ' + datos.anio + '.</p>' +
      '<section class="tarjeta"><h3>Reporte POI DSI</h3><div class="grid2">' +
      [['poi', 'POI en formato oficial (PROG/EJEC por mes, % de avance y estado)'], ['equipos', 'Resumen por equipo'], ['responsables', 'Detalle por responsable'], ['conciliacion', 'Conciliación oficial vs. matrices'], ['registros', 'Registros de las matrices (sin datos personales)']]
        .map(([k, t]) => '<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" data-rep="' + k + '" checked style="width:auto"> ' + t + '</label>').join('') +
      '</div><p class="acciones" style="margin-top:12px"><button class="btn prim" data-acc="exportar">Descargar reporte .xlsx</button></p></section>' +
      '<section class="tarjeta"><h3>Plantilla de matrices</h3><p class="ayuda">Formato estándar recomendado para el reporte de 2027: una hoja por matriz, sin datos personales de contactos.</p><button class="btn" data-acc="plantilla">Descargar plantilla .xlsx</button></section>';
  }

  function sAnios() {
    return '<h2>Años del POI</h2><p class="ayuda">El dashboard guarda un archivo por año (<code>datos/poi-AAAA.json</code>). Para 2027: cree el año copiando el catálogo (equipos, asignaciones, reglas y responsables) y luego importe el Excel del POI 2027 con su programación.</p>' +
      '<section class="tarjeta"><h3>Años disponibles</h3><p>' + config.anios.map(a => '<span class="pill">' + a + (a === config.anioMonitor ? ' · se muestra en el monitor' : '') + '</span>').join(' ') + '</p>' +
      '<div class="fila"><label>Año que muestra el monitor <select id="aMonitor">' + config.anios.map(a => '<option' + (a === config.anioMonitor ? ' selected' : '') + '>' + a + '</option>').join('') + '</select></label></div></section>' +
      '<section class="tarjeta"><h3>Importar Excel del POI (formato oficial)</h3><p class="ayuda">Lee las hojas por meta (006, 007, 008, 22…), con su programación, ejecución y comentarios de sustento. Conserva los equipos, nombres cortos y reglas que ya existan para cada código AOI.</p>' +
      '<div class="fila"><label>Archivo <input type="file" id="aArchivo" accept=".xlsx"></label><label class="fijo">Ejecución <select id="aEjec"><option value="si">Importar programación y ejecución</option><option value="no">Solo programación (año nuevo)</option></select></label></div>' +
      '<p class="acciones" style="margin-top:10px"><button class="btn prim" data-acc="importarPOI">Importar en ' + datos.anio + '</button></p><div id="aResultado"></div></section>' +
      '<section class="tarjeta"><h3>Crear un año nuevo</h3><div class="fila"><label class="fijo">Año <input id="aNuevo" type="number" value="' + (Math.max.apply(null, config.anios) + 1) + '"></label></div>' +
      '<p class="acciones" style="margin-top:10px"><button class="btn" data-acc="crearAnio">Crear copiando el catálogo de ' + datos.anio + '</button></p>' +
      '<p class="ayuda">En el año nuevo las reglas de cálculo quedan activas desde enero: la ejecución saldrá de las matrices, que deberán coincidir con lo que se reporte en el POI.</p></section>';
  }

  function sAjustes() {
    const gh = config.github || {};
    return '<h2>Ajustes</h2><div class="grid2">' +
      '<section class="tarjeta"><h3>Monitor</h3><div class="fila"><label>Segundos por pantalla (TV) <input id="cSeg" type="number" min="5" value="' + ((config.monitor || {}).segundosPorPantalla || 20) + '"></label>' +
      '<label>Recargar datos cada (min) <input id="cRec" type="number" min="1" value="' + ((config.monitor || {}).minutosRecarga || 5) + '"></label></div>' +
      '<p class="ayuda" style="margin-top:8px">Enlaces para los televisores: <code>monitor.html?modo=tv</code> (tema claro) o <code>monitor.html?modo=tv&amp;tema=oscuro</code>.</p>' +
      '<button class="btn" data-acc="guardarMonitor">Aplicar</button></section>' +
      '<section class="tarjeta"><h3>Acceso de administración</h3><p class="ayuda">Usuario y contraseña generales. Se guardan cifrados (hash) en <code>datos/config.json</code>. Como el sitio es estático, esto solo evita ediciones casuales: no proteja aquí información reservada.</p>' +
      '<div class="fila"><label>Usuario <input id="cUsr" value="' + esc((config.admin || {}).usuario || 'admin') + '"></label><label>Nueva contraseña <input id="cClave" type="password" autocomplete="new-password"></label></div>' +
      '<p class="acciones" style="margin-top:10px"><button class="btn" data-acc="cambiarClave">Cambiar acceso</button></p></section>' +
      '<section class="tarjeta"><h3>Publicación en GitHub</h3><p class="ayuda">Permite publicar desde este panel. El token (fine-grained, con permiso <b>Contents: Read and write</b> solo sobre este repositorio) se guarda únicamente en este navegador, nunca en el repositorio.</p>' +
      '<div class="fila"><label>Usuario u organización <input id="gProp" value="' + esc(gh.propietario || '') + '"></label><label>Repositorio <input id="gRepo" value="' + esc(gh.repositorio || '') + '"></label></div>' +
      '<div class="fila"><label>Rama <input id="gRama" value="' + esc(gh.rama || 'main') + '"></label><label>Carpeta de la app en el repo (vacío si es la raíz) <input id="gCarp" value="' + esc(gh.carpeta || '') + '"></label></div>' +
      '<label style="margin-top:8px">Token personal <input id="gTok" type="password" placeholder="' + (lsGet('dsi-poi-gh-token') ? '(guardado en este navegador)' : 'github_pat_…') + '" autocomplete="off"></label>' +
      '<p class="acciones" style="margin-top:10px"><button class="btn" data-acc="guardarGH">Guardar</button><button class="btn" data-acc="olvidarToken">Olvidar token</button></p></section>' +
      '<section class="tarjeta"><h3>HubSpot (próxima fase)</h3><p class="ayuda">Las reuniones bilaterales tienen el campo <code>origen</code> y quedan listas para recibir registros desde HubSpot (y enviar los de la matriz). Ver README, sección "Integración con HubSpot".</p></section>' +
      '</div>';
  }

  const SECCIONES = { inicio: sInicio, actividades: sActividades, equipos: sEquipos, matrices: sMatrices, conciliacion: sConciliacion, reportes: sReportes, anios: sAnios, ajustes: sAjustes };
  function pintar() {
    $$('#navAdmin .tab').forEach(b => b.setAttribute('aria-selected', b.dataset.sec === seccion));
    const y = window.scrollY;
    $('#sec').innerHTML = SECCIONES[seccion]();
    window.scrollTo(0, y);
    enlazarSeccion();
  }
  function enlazarSeccion() {
    const sc = $('#selCorte'); if (sc) sc.onchange = () => { datos.corte = Number(sc.value); cambio(); };
    const fm = $('#mFiltroMes'); if (fm) fm.onchange = () => $$('#tRegs tbody tr').forEach(tr => tr.classList.toggle('oculto', !!fm.value && tr.dataset.mes !== fm.value));
    const am = $('#aMonitor'); if (am) am.onchange = () => { config.anioMonitor = Number(am.value); cambio(); };
  }

  /* ---------------- acciones de la interfaz ---------------- */
  const ACC = {
    guardarLocal, descargarJSON, publicarGH,
    descartar: async () => { if (!confirm('¿Descartar los cambios no publicados?')) return; lsSet(claveBorrador(), null); lsSet('dsi-poi-config-borrador', null); await cargarAnio(datos.anio, true); },
    agregarEquipo: () => {
      const n = $('#nuevoEquipo').value.trim(); if (!n) return;
      let id = D.normalizar(n).replace(/[^a-z0-9]+/g, ''); while (datos.equipos.some(e => e.id === id)) id += '2';
      datos.equipos.push({ id, nombre: n }); cambio();
    },
    agregarPersona: () => {
      const n = $('#nuevaPersona').value.trim(); if (!n) return;
      datos.personas.push({ id: D.uid(), nombre: n, equipo: '', alias: [] }); cambio();
    },
    importarMatriz: () => accion('importar', importarMatriz),
    nuevoRegistro: () => editorRegistro(null),
    plantilla: () => X.descargarPlantilla(),
    exportar: () => { const o = {}; $$('[data-rep]').forEach(c => o[c.dataset.rep] = c.checked); X.exportarReporte(datos, o); },
    importarPOI: () => accion('poi', async () => {
      const f = $('#aArchivo').files[0]; if (!f) { toast('Seleccione el Excel del POI.'); return; }
      const res = I.importarPOI(await leerArchivo(f));
      aplicarPOI(res, $('#aEjec').value === 'si');
      cambio();
      $('#aResultado').innerHTML = '<p class="ayuda">✓ ' + res.indicadores.length + ' actividades de ' + res.metas.length + ' metas. Corte detectado: ' + (res.corte ? D.MESES[res.corte - 1] : '—') + '.</p>' +
        (res.avisos.length ? '<ul class="lista-avisos">' + res.avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '');
    }),
    crearAnio: () => accion('anio', async () => {
      const a = Number($('#aNuevo').value);
      if (!a || config.anios.includes(a)) { toast('Ese año ya existe o no es válido.'); return; }
      const nuevo = clon(datos);
      nuevo.anio = a; nuevo.corte = 1; nuevo.actualizado = new Date().toISOString();
      nuevo.indicadores.forEach(i => { i.ejec = Array(12).fill(null); i.sustento = {}; if (i.fuente && i.fuente.registro) i.fuente.desdeMes = 1; });
      Object.keys(nuevo.registros).forEach(k => nuevo.registros[k] = []);
      config.anios.push(a); config.anios.sort();
      datos = nuevo; publicado = null;
      $('#selAnioAdmin').innerHTML = config.anios.map(x => '<option' + (x === a ? ' selected' : '') + '>' + x + '</option>').join('');
      cambio(); toast('Año ' + a + ' creado. Importe ahora el Excel del POI ' + a + ' (solo programación).', 6000);
    }),
    guardarMonitor: () => { config.monitor = { segundosPorPantalla: Number($('#cSeg').value) || 20, minutosRecarga: Number($('#cRec').value) || 5 }; cambio(); toast('Ajustes del monitor actualizados.'); },
    cambiarClave: () => accion('clave', async () => {
      const u = $('#cUsr').value.trim(), c = $('#cClave').value;
      if (!u || c.length < 8) { toast('La contraseña debe tener al menos 8 caracteres.'); return; }
      const sal = D.uid();
      config.admin = { usuario: u, sal, hash: await sha256(sal + ':' + c) };
      cambio(); toast('Acceso cambiado. Publique para que rija en el sitio.', 5000);
    }),
    guardarGH: () => {
      config.github = { propietario: $('#gProp').value.trim(), repositorio: $('#gRepo').value.trim(), rama: $('#gRama').value.trim() || 'main', carpeta: $('#gCarp').value.trim() };
      if ($('#gTok').value.trim()) lsSet('dsi-poi-gh-token', $('#gTok').value.trim());
      cambio(); toast('Configuración de GitHub guardada.');
    },
    olvidarToken: () => { lsSet('dsi-poi-gh-token', null); pintar(); toast('Token eliminado de este navegador.'); }
  };

  function aplicarPOI(res, conEjec) {
    res.metas.forEach(m => { const e = datos.metas.find(x => x.id === m.id); if (e) Object.assign(e, m); else datos.metas.push(m); });
    datos.metas.sort((a, b) => a.id.localeCompare(b.id));
    res.indicadores.forEach(n => {
      const e = datos.indicadores.find(x => x.codigo === n.codigo);
      if (e) {
        Object.assign(e, { nombre: n.nombre, definicion: n.definicion, unidad: n.unidad, meta: n.meta, hoja: n.hoja, aei: n.aei, prog: n.prog });
        if (conEjec) { e.ejec = n.ejec; e.sustento = Object.assign({}, e.sustento, n.sustento); }
      } else {
        if (!conEjec) { n.ejec = Array(12).fill(null); n.sustento = {}; }
        datos.indicadores.push(C.completarIndicador(n));
      }
    });
    if (conEjec && res.corte) datos.corte = res.corte;
  }

  document.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('#navAdmin .tab'); if (tab) { seccion = tab.dataset.sec; pintar(); return; }
    const ir = t.closest('[data-ir]'); if (ir) { e.preventDefault(); seccion = ir.dataset.ir; pintar(); return; }
    const acc = t.closest('[data-acc]'); if (acc && ACC[acc.dataset.acc]) { accion(acc.dataset.acc, ACC[acc.dataset.acc]); return; }
    if (t.closest('[data-cerrar]')) { $('#dlg').close(); return; }
    const ed = t.closest('[data-editar]'); if (ed) { indSel = ed.dataset.editar; editorIndicador(indSel); return; }
    const gi = t.closest('[data-guardar-ind]'); if (gi) { leerEditor(datos.indicadores.find(i => i.codigo === gi.dataset.guardarInd)); $('#dlg').close(); toast('Actividad guardada.'); return; }
    const tp = t.closest('[data-tipo]'); if (tp) { tipoMatriz = tp.dataset.tipo; pintar(); return; }
    const re = t.closest('[data-reg-edit]'); if (re) { editorRegistro(re.dataset.regEdit); return; }
    const rd = t.closest('[data-reg-del]'); if (rd) { if (confirm('¿Eliminar este registro?')) { datos.registros[tipoMatriz] = datos.registros[tipoMatriz].filter(r => r.id !== rd.dataset.regDel); cambio(); } return; }
    const cp = t.closest('[data-copiar]'); if (cp) {
      const [cod, k] = cp.dataset.copiar.split('|'); const ind = datos.indicadores.find(i => i.codigo === cod);
      ind.ejec[+k] = D.ejecucionCalculada(datos, ind)[+k]; cambio(); toast('Valor copiado al oficial.'); return;
    }
    const eb = t.closest('[data-eq-borrar]'); if (eb) {
      const eq = datos.equipos[+eb.dataset.eqBorrar];
      if (!confirm('¿Eliminar el equipo "' + eq.nombre + '"? Sus actividades quedarán sin este equipo.')) return;
      datos.equipos.splice(+eb.dataset.eqBorrar, 1);
      datos.indicadores.forEach(i => i.equipos = (i.equipos || []).filter(x => x !== eq.id)); cambio(); return;
    }
    const es = t.closest('[data-eq-subir]'); if (es) { const k = +es.dataset.eqSubir; const a = datos.equipos; [a[k - 1], a[k]] = [a[k], a[k - 1]]; cambio(); return; }
    const pb = t.closest('[data-p-borrar]'); if (pb) { datos.personas.splice(+pb.dataset.pBorrar, 1); cambio(); return; }
    const so = t.closest('[data-sin-ok]'); if (so) {
      const sel = $('[data-sin-sel="' + so.dataset.sinOk + '"]').value, nombre = so.dataset.nombre;
      if (sel === '__nueva') datos.personas.push({ id: D.uid(), nombre, equipo: '', alias: [] });
      else { const p = datos.personas.find(x => x.id === sel); p.alias = (p.alias || []).concat([nombre]); }
      cambio(); return;
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.asig) {
      const [cod, eq] = t.dataset.asig.split('|'); const ind = datos.indicadores.find(i => i.codigo === cod);
      ind.equipos = (ind.equipos || []).filter(x => x !== eq); if (t.checked) ind.equipos.push(eq);
      ind.equipos.sort((a, b) => datos.equipos.findIndex(x => x.id === a) - datos.equipos.findIndex(x => x.id === b));
      cambio(true); return;
    }
    if (t.dataset.eqNombre) { datos.equipos[+t.dataset.eqNombre].nombre = t.value.trim(); cambio(); return; }
    if (t.dataset.pNombre) { datos.personas[+t.dataset.pNombre].nombre = t.value.trim(); cambio(true); return; }
    if (t.dataset.pEquipo != null && t.matches('[data-p-equipo]')) { datos.personas[+t.dataset.pEquipo].equipo = t.value; cambio(true); return; }
    if (t.dataset.pAlias) { datos.personas[+t.dataset.pAlias].alias = t.value.split(';').map(s => s.trim()).filter(Boolean); cambio(true); return; }
  });

  /* ---------------- arranque ---------------- */
  function normalizarDatos(d) {
    d.metas = d.metas || []; d.indicadores = d.indicadores || []; d.equipos = d.equipos || clon(C.EQUIPOS);
    d.personas = (d.personas || []).map(p => Object.assign({ id: D.uid(), alias: [] }, p));
    d.registros = d.registros || {};
    Object.keys(D.TIPOS_REGISTRO).forEach(t => d.registros[t] = d.registros[t] || []);
    d.indicadores.forEach(i => { C.completarIndicador(i); while (i.prog.length < 12) i.prog.push(0); while (i.ejec.length < 12) i.ejec.push(null); i.sustento = i.sustento || {}; });
    return d;
  }
  async function cargarAnio(anio, ignorarBorrador) {
    try { publicado = normalizarDatos(await D.cargarAnio(anio)); }
    catch (e) { publicado = null; }
    const b = !ignorarBorrador && lsGet('dsi-poi-borrador-' + anio);
    datos = b ? normalizarDatos(JSON.parse(b)) : (publicado ? clon(publicado) : normalizarDatos({ anio, corte: 1 }));
    if (publicado && !b) publicado = clon(datos);
    $('#selAnioAdmin').innerHTML = config.anios.map(a => '<option' + (a === anio ? ' selected' : '') + '>' + a + '</option>').join('');
    pintarEstado(); pintar();
  }
  async function entrar() {
    $('#login').classList.add('oculto'); $('#app').classList.remove('oculto');
    const cb = lsGet('dsi-poi-config-borrador');
    if (cb) { try { const c = JSON.parse(cb); if (c && c.anios) config = c; } catch (e) {} }
    await cargarAnio(config.anioMonitor || config.anios[config.anios.length - 1]);
    $('#selAnioAdmin').onchange = e => cargarAnio(Number(e.target.value));
  }
  $('#formLogin').onsubmit = async e => {
    e.preventDefault();
    const a = config.admin || {};
    const ok = $('#lUsuario').value.trim() === a.usuario && await sha256(a.sal + ':' + $('#lClave').value) === a.hash;
    if (!ok) { $('#lError').textContent = 'Usuario o contraseña incorrectos.'; return; }
    try { sessionStorage.setItem('dsi-poi-sesion', a.hash); } catch (x) {}
    entrar();
  };
  $('#btnSalir').onclick = () => { try { sessionStorage.removeItem('dsi-poi-sesion'); } catch (x) {} location.reload(); };
  $('#dlg').addEventListener('close', () => { if (seccion === 'actividades') pintar(); });
  window.addEventListener('beforeunload', e => { if (datos && hayCambios()) { e.preventDefault(); e.returnValue = ''; } });

  (async function () {
    try { config = await D.cargarConfig(); }
    catch (e) { $('#lError').textContent = 'No se pudo leer datos/config.json.'; return; }
    let ses = null; try { ses = sessionStorage.getItem('dsi-poi-sesion'); } catch (x) {}
    if (ses && config.admin && ses === config.admin.hash) entrar();
  })();
  window.DSI_ADMIN = { get datos() { return datos; }, set datos(v) { datos = v; }, get config() { return config; }, aplicarPOI, normalizarDatos, cambio, guardarLocal };
})();
