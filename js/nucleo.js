/* ============================================================
   Dashboard POI · DSI PROINVERSIÓN — núcleo compartido
   Modelo de datos, reglas de conteo y cálculos de avance.
   Lo usan el monitor (index.html) y la administración (admin.html).
   ============================================================ */
(function (global) {
  'use strict';

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

  /* Umbrales del semáforo, medidos contra la META ANUAL. */
  const UMBRALES = { verde: 1.0, ambar: 0.8 };

  /* Tipos de registro (las "matrices"). Ningún tipo guarda nombres, correos ni teléfonos
     de contactos externos: solo empresa, tema, responsable interno y conteos. */
  const TIPOS_REGISTRO = {
    eventos: {
      nombre: 'Eventos de promoción', equipo: 'promocion',
      campos: [
        ['fecha', 'Fecha', 'fecha'], ['titulo', 'Actividad', 'texto'], ['tipo', 'Tipo', 'texto'],
        ['categoria', 'Categoría', 'lista', ['Promoción', 'Acto público', 'Evento de terceros', 'Otro']],
        ['ciudad', 'Ciudad', 'texto'], ['pais', 'País', 'texto'], ['responsables', 'Responsable(s)', 'personas'],
        ['participantes', 'N° participantes', 'numero'], ['costo', 'Costo (S/)', 'numero'], ['estado', 'Estado', 'texto']
      ]
    },
    reuniones: {
      nombre: 'Reuniones bilaterales', equipo: 'promocion',
      campos: [
        ['fecha', 'Fecha', 'fecha'], ['empresa', 'Empresa', 'texto'], ['sector', 'Área de negocio', 'texto'],
        ['tema', 'Tema', 'texto'], ['responsables', 'Responsable(s)', 'personas'], ['personas', 'Personas atendidas', 'numero']
      ]
    },
    atenciones: {
      nombre: 'Atenciones de facilitación', equipo: 'facilitacion',
      campos: [
        ['fecha', 'Fecha', 'fecha'], ['empresa', 'Empresa / entidad', 'texto'], ['tema', 'Tema', 'texto'],
        ['canal', 'Canal', 'lista', ['Atención', 'Reunión']], ['responsables', 'Responsable(s)', 'personas'],
        ['personas', 'Personas atendidas', 'numero']
      ]
    },
    eventosFacilitacion: {
      nombre: 'Eventos de facilitación', equipo: 'facilitacion',
      campos: [
        ['fecha', 'Fecha', 'fecha'], ['titulo', 'Evento / concepto', 'texto'], ['ciudad', 'Lugar', 'texto'],
        ['responsables', 'Responsable(s)', 'personas']
      ]
    },
    expedientes: {
      nombre: 'Expedientes de mecanismos', equipo: 'facilitacion',
      campos: [
        ['fecha', 'Fecha de informe', 'fecha'], ['tramite', 'Trámite', 'texto'], ['sector', 'Sector', 'texto'],
        ['tipoInforme', 'Tipo de informe', 'texto'], ['numero', 'N° de informe', 'texto'], ['asunto', 'Asunto', 'texto'],
        ['responsables', 'Responsable(s)', 'personas'], ['dias', 'Días hábiles', 'numero']
      ]
    }
  };

  /* Medidas posibles de una regla de conteo. */
  const MEDIDAS = {
    conteo: 'Cantidad de registros',
    personas: 'Suma de personas atendidas',
    porcentaje: '% de expedientes en plazo'
  };

  /* ---------- utilidades ---------- */
  function normalizar(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function num(v) { return v == null || v === '' || isNaN(v) ? null : Number(v); }
  function suma(arr) { return arr.reduce((a, v) => a + (v == null ? 0 : Number(v)), 0); }
  function redondear(v, d) { const f = Math.pow(10, d || 0); return Math.round(v * f) / f; }
  function fmt(v, dec) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString('es-PE', { maximumFractionDigits: dec == null ? 1 : dec });
  }
  function fmtPct(r, dec) { return r == null || isNaN(r) ? '—' : fmt(r * 100, dec == null ? 0 : dec) + '%'; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function mesDeFecha(f) { if (!f) return null; const m = /^(\d{4})-(\d{2})/.exec(f); return m ? Number(m[2]) : null; }

  function estadoDe(avance) {
    if (avance == null || isNaN(avance)) return { clave: 'nd', etiqueta: 'Sin meta', icono: '·' };
    if (avance >= UMBRALES.verde) return { clave: 'verde', etiqueta: 'Meta cumplida', icono: '✓' };
    if (avance >= UMBRALES.ambar) return { clave: 'ambar', etiqueta: 'Cerca de la meta', icono: '!' };
    return { clave: 'rojo', etiqueta: 'Por debajo', icono: '✕' };
  }

  /* ---------- personas / responsables ---------- */
  function indicePersonas(datos) {
    const idx = new Map();
    (datos.personas || []).forEach(p => {
      idx.set(normalizar(p.nombre), p);
      (p.alias || []).forEach(a => idx.set(normalizar(a), p));
    });
    return idx;
  }
  /* Separa "Solange / Giovanni", "Ana y Juan", "A, B" en nombres individuales. */
  function separarNombres(txt) {
    if (Array.isArray(txt)) return txt.map(s => String(s).trim()).filter(Boolean);
    return String(txt || '').split(/\s*(?:\/|,|;|\+|\by\b|&)\s*/i).map(s => s.trim()).filter(Boolean);
  }
  /* Devuelve [{id, nombre, equipo, enCatalogo}] para los responsables de un registro. */
  function resolverResponsables(reg, idx) {
    return separarNombres(reg.responsables).map(n => {
      const p = idx.get(normalizar(n));
      return p ? { id: p.id, nombre: p.nombre, equipo: p.equipo, enCatalogo: true }
               : { id: 'x:' + normalizar(n), nombre: n, equipo: null, enCatalogo: false };
    });
  }

  /* ---------- reglas de conteo ---------- */
  function cumpleFiltro(reg, filtro) {
    if (!filtro) return true;
    return Object.keys(filtro).every(campo => {
      const vals = filtro[campo];
      if (!vals || !vals.length) return true;
      const v = normalizar(reg[campo]);
      return vals.some(x => normalizar(x) === v);
    });
  }
  function registrosDe(datos, fuente) {
    if (!fuente || !fuente.registro) return [];
    return ((datos.registros || {})[fuente.registro] || []).filter(r => cumpleFiltro(r, fuente.filtro));
  }
  function enPlazo(reg, fuente) {
    const lim = (fuente && fuente.limiteDias) || 18;
    return reg.dias != null && reg.dias !== '' && Number(reg.dias) <= lim;
  }
  /* Valor de una lista de registros según la medida de la regla. */
  function medir(regs, fuente) {
    const med = (fuente && fuente.medida) || 'conteo';
    if (med === 'personas') return suma(regs.map(r => r.personas == null ? 1 : r.personas));
    if (med === 'porcentaje') {
      if (!regs.length) return null;
      return redondear(100 * regs.filter(r => enPlazo(r, fuente)).length / regs.length, 1);
    }
    return regs.length;
  }
  /* Ejecución calculada desde las matrices, por mes (12 valores; null si no hay registros y la medida es %). */
  function ejecucionCalculada(datos, ind) {
    const f = ind.fuente;
    if (!f || !f.registro) return null;
    const regs = registrosDe(datos, f);
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const delMes = regs.filter(r => r.mes === m);
      out.push(f.medida === 'porcentaje' ? medir(delMes, f) : (m <= (datos.corte || 12) || delMes.length ? medir(delMes, f) : null));
    }
    return out;
  }

  /* Ejecución vigente: la oficial del POI; desde fuente.desdeMes en adelante, la calculada de las matrices. */
  function ejecucionVigente(datos, ind) {
    const ofi = (ind.ejec || []).slice(0, 12);
    while (ofi.length < 12) ofi.push(null);
    const calc = ejecucionCalculada(datos, ind);
    const desde = ind.fuente && ind.fuente.desdeMes;
    if (!calc || !desde || desde > 12) return ofi;
    return ofi.map((v, i) => (i + 1 >= desde && i + 1 <= (datos.corte || 12)) ? calc[i] : v);
  }

  /* ---------- resumen de un indicador ---------- */
  function resumenIndicador(datos, ind) {
    const corte = datos.corte || 12;
    const prog = (ind.prog || []).map(v => v == null ? 0 : Number(v));
    while (prog.length < 12) prog.push(0);
    const ejec = ejecucionVigente(datos, ind);
    let metaAnual, ejecutado, progFecha;
    if (ind.agregacion === 'promedio') {
      const p = prog.filter(v => v > 0);
      metaAnual = p.length ? suma(p) / p.length : null;
      const e = ejec.slice(0, corte).filter(v => v != null);
      ejecutado = e.length ? redondear(suma(e) / e.length, 1) : null;
      progFecha = metaAnual;
    } else {
      metaAnual = suma(prog);
      ejecutado = suma(ejec.slice(0, corte));
      progFecha = suma(prog.slice(0, corte));
    }
    const avance = metaAnual ? (ejecutado == null ? 0 : ejecutado / metaAnual) : null;
    const sinReporte = [];
    for (let m = 1; m <= corte; m++) if (ejec[m - 1] == null && prog[m - 1] > 0) sinReporte.push(m);
    return {
      ind, prog, ejec, metaAnual, ejecutado, progFecha, avance,
      avanceTope: avance == null ? null : Math.min(avance, 1),
      esperado: metaAnual ? Math.min(progFecha / metaAnual, 1) : null,
      estado: estadoDe(avance), sinReporte,
      esPorcentaje: ind.agregacion === 'promedio'
    };
  }

  function indicadoresDeEquipo(datos, equipoId) {
    return (datos.indicadores || []).filter(i => (i.equipos || []).includes(equipoId));
  }
  function promedioAvance(resumenes) {
    const v = resumenes.map(r => r.avanceTope).filter(x => x != null);
    return v.length ? suma(v) / v.length : null;
  }
  function conteoEstados(resumenes) {
    const c = { verde: 0, ambar: 0, rojo: 0, nd: 0 };
    resumenes.forEach(r => c[r.estado.clave]++);
    return c;
  }
  function resumenEquipo(datos, eq) {
    const rs = indicadoresDeEquipo(datos, eq.id).map(i => resumenIndicador(datos, i));
    const av = promedioAvance(rs);
    return { equipo: eq, resumenes: rs, avance: av, estado: estadoDe(av), estados: conteoEstados(rs) };
  }
  function resumenGeneral(datos) {
    const rs = (datos.indicadores || []).map(i => resumenIndicador(datos, i));
    const av = promedioAvance(rs);
    return {
      resumenes: rs, avance: av, estado: estadoDe(av), estados: conteoEstados(rs),
      equipos: (datos.equipos || []).map(e => resumenEquipo(datos, e))
    };
  }

  /* ---------- segregación por responsable ----------
     Un registro con varios responsables suma para cada uno (participación),
     por eso la suma por persona puede superar el total del indicador. */
  function porResponsable(datos, ind, hastaMes) {
    const f = ind.fuente;
    if (!f || !f.registro) return [];
    const idx = indicePersonas(datos);
    const corte = hastaMes || datos.corte || 12;
    const mapa = new Map();
    registrosDe(datos, f).filter(r => r.mes && r.mes <= corte).forEach(r => {
      const resp = resolverResponsables(r, idx);
      (resp.length ? resp : [{ id: 'x:sin', nombre: 'Sin responsable', equipo: null, enCatalogo: false }]).forEach(p => {
        if (!mapa.has(p.id)) mapa.set(p.id, { persona: p, regs: [], meses: Array(12).fill(null).map(() => []) });
        const e = mapa.get(p.id); e.regs.push(r); e.meses[r.mes - 1].push(r);
      });
    });
    return Array.from(mapa.values()).map(e => ({
      persona: e.persona,
      valor: medir(e.regs, f),
      registros: e.regs.length,
      meses: e.meses.map(ms => ms.length ? medir(ms, f) : null)
    })).sort((a, b) => (b.valor || 0) - (a.valor || 0));
  }

  /* Nombres de responsables que aparecen en las matrices y no están en el catálogo. */
  function responsablesSinCatalogo(datos) {
    const idx = indicePersonas(datos);
    const vistos = new Map();
    Object.keys(datos.registros || {}).forEach(tipo => (datos.registros[tipo] || []).forEach(r => {
      resolverResponsables(r, idx).filter(p => !p.enCatalogo).forEach(p => {
        const k = normalizar(p.nombre);
        if (!vistos.has(k)) vistos.set(k, { nombre: p.nombre, tipos: new Set(), n: 0 });
        const v = vistos.get(k); v.tipos.add(tipo); v.n++;
      });
    }));
    return Array.from(vistos.values()).map(v => ({ nombre: v.nombre, tipos: Array.from(v.tipos), n: v.n }));
  }

  /* ---------- carga de datos ---------- */
  async function cargarJSON(url) {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo leer ' + url + ' (' + r.status + ')');
    return r.json();
  }
  async function cargarConfig() { return cargarJSON('datos/config.json'); }
  async function cargarAnio(anio) { return cargarJSON('datos/poi-' + anio + '.json'); }

  global.DSI = {
    MESES, MESES_CORTOS, UMBRALES, TIPOS_REGISTRO, MEDIDAS,
    normalizar, num, suma, redondear, fmt, fmtPct, uid, mesDeFecha, estadoDe,
    indicePersonas, separarNombres, resolverResponsables,
    cumpleFiltro, registrosDe, enPlazo, medir, ejecucionCalculada, ejecucionVigente,
    resumenIndicador, indicadoresDeEquipo, resumenEquipo, resumenGeneral,
    porResponsable, responsablesSinCatalogo,
    cargarJSON, cargarConfig, cargarAnio
  };
})(window);
