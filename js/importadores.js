/* ============================================================
   Importadores de Excel (usan SheetJS, cargado en admin.html).
   - POI oficial (formato "POI 20XX DSI seguimiento").
   - Matrices actuales: Eventos (hoja TODO 20XX), Reuniones bilaterales (hojas por mes),
     Cálculo POI mecanismos (hojas "POI <MES>"), Atenciones y Eventos de Facilitación.
   - Plantilla estándar del dashboard (una hoja por tipo de registro).
   Regla de privacidad: los importadores NUNCA guardan nombres, cargos, correos ni teléfonos
   de los contactos; solo cuentan personas.
   ============================================================ */
(function (global) {
  'use strict';
  const D = global.DSI;
  const N = D.normalizar;

  const MES_TXT = {
    ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marz: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
    jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, set: 9, sep: 9, setiembre: 9, septiembre: 9,
    oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12
  };
  function mesDeTexto(t) { const k = N(t).replace(/[^a-z]/g, ''); return MES_TXT[k] || null; }

  function filas(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }); }
  function texto(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }

  /* Fecha Excel (serial) o texto "dd/mm/aaaa" / "10 al 12/06/2026" → "aaaa-mm-dd". */
  function fecha(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 864e5));
      return d.toISOString().slice(0, 10);
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(String(v));
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  }
  /* "19,725,68" / "1 539.60" / 424.8 → número. */
  function numero(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/[^\d.,]/g, '');
    if (!s) return null;
    const m = /^(.*)[.,](\d{1,2})$/.exec(s);
    s = m ? m[1].replace(/[.,]/g, '') + '.' + m[2] : s.replace(/[.,]/g, '');
    const n = Number(s); return isNaN(n) ? null : n;
  }
  /* Busca la fila de cabecera que contiene todas las etiquetas dadas; devuelve {fila, col(etiqueta)}. */
  function buscarCabecera(rows, etiquetas, maxFila) {
    for (let i = 0; i < Math.min(rows.length, maxFila || 40); i++) {
      const r = rows[i] || [];
      const propia = r.map(c => N(c));
      if (!etiquetas.every(e => propia.some(c => c === N(e) || c.startsWith(N(e))))) continue;
      // cabeceras en dos filas (celdas combinadas): si la celda está vacía, usar la de la fila anterior
      const ant = rows[i - 1] || [];
      const largo = Math.max(r.length, ant.length);
      const norm = [];
      for (let j = 0; j < largo; j++) norm.push(N(r[j]) || N(ant[j]));
      {
        const col = (e, exacta) => {
          const ne = N(e);
          let j = norm.findIndex(c => c === ne);
          if (j < 0 && !exacta) j = norm.findIndex(c => c.startsWith(ne));
          return j;
        };
        return { fila: i, col, norm };
      }
    }
    return null;
  }

  /* ---------------- POI oficial ---------------- */
  function importarPOI(wb) {
    const metas = [], indicadores = [], avisos = [];
    wb.SheetNames.forEach(nombreHoja => {
      const rows = filas(wb.Sheets[nombreHoja]);
      let metaId = null, actividad = '', aei = '';
      rows.slice(0, 20).forEach(r => (r || []).forEach((c, j) => {
        const t = texto(c);
        const mm = /actividad\s*\(meta\s*(\d+)\)/i.exec(t);
        if (mm) { metaId = mm[1].padStart(3, '0'); actividad = texto(r[j + 1]); }
        if (/^AEI\./i.test(t)) aei = t;
      }));
      const cab = buscarCabecera(rows, ['Código', 'Actividad Operativa'], 30);
      if (!cab || !metaId) { avisos.push('Hoja "' + nombreHoja + '" omitida (no tiene el formato POI).'); return; }
      const hdr = rows[cab.fila];
      const cCod = cab.col('codigo'), cAct = cab.col('actividad operativa'), cDef = cab.col('definicion'), cUni = cab.col('unidad de medida');
      const colMes = {};
      hdr.forEach((c, j) => { const m = mesDeTexto(c); if (m && !colMes[m]) colMes[m] = j; });
      if (Object.keys(colMes).length < 12) avisos.push('Hoja "' + nombreHoja + '": se encontraron ' + Object.keys(colMes).length + ' meses.');
      if (!metas.find(m => m.id === metaId)) metas.push({ id: metaId, titulo: 'Meta ' + Number(metaId), actividad, aei });
      // filas de indicadores
      let finTabla = rows.length;
      for (let i = cab.fila + 2; i < rows.length; i++) {
        const r = rows[i] || [];
        if (r.some(c => /comentarios\s+sustento/i.test(texto(c)))) { finTabla = i; break; }
        const cod = texto(r[cCod]);
        if (!/^AOI\d+/i.test(cod)) continue;
        const prog = [], ejec = [];
        for (let m = 1; m <= 12; m++) {
          const j = colMes[m];
          prog.push(j == null ? 0 : (D.num(r[j]) == null ? 0 : Number(r[j])));
          ejec.push(j == null ? null : D.num(r[j + 1]));
        }
        const unidad = texto(r[cUni]);
        indicadores.push({
          codigo: cod.toUpperCase(), hoja: nombreHoja, meta: metaId, aei,
          nombre: texto(r[cAct]), definicion: texto(r[cDef]), unidad,
          agregacion: /porcentaje/i.test(unidad) ? 'promedio' : 'suma',
          prog, ejec, sustento: {}
        });
      }
      // comentarios de sustento: bloques por mes con códigos AOI y texto
      let mesActual = null;
      for (let i = finTabla; i < rows.length; i++) {
        const r = rows[i] || [];
        const celdas = r.map(texto).filter(Boolean);
        if (!celdas.length) continue;
        if (celdas.length === 1 && mesDeTexto(celdas[0])) { mesActual = mesDeTexto(celdas[0]); continue; }
        const iCod = r.findIndex(c => /^AOI\d+/i.test(texto(c)));
        if (iCod >= 0 && mesActual) {
          const comentario = r.slice(iCod + 1).map(texto).filter(Boolean).join(' ');
          const ind = indicadores.find(x => x.codigo === texto(r[iCod]).toUpperCase() && x.hoja === nombreHoja);
          if (ind && comentario) ind.sustento[mesActual] = comentario;
        }
      }
    });
    let corte = 0;
    indicadores.forEach(i => i.ejec.forEach((v, k) => { if (v != null && k + 1 > corte) corte = k + 1; }));
    return { metas, indicadores, corte, avisos };
  }

  /* ---------------- Matriz de eventos (Promoción) ---------------- */
  function importarEventos(wb, anio) {
    const avisos = [], registros = [];
    const hoja = wb.SheetNames.find(n => /^todo\s*\d{4}/i.test(n.trim())) ||
      wb.SheetNames.find(n => buscarCabecera(filas(wb.Sheets[n]), ['Actividad', 'Categoría'], 5));
    if (!hoja) throw new Error('No se encontró la hoja de eventos (p. ej. "TODO ' + anio + '").');
    const rows = filas(wb.Sheets[hoja]);
    const cab = buscarCabecera(rows, ['Actividad', 'Categoría'], 10);
    const c = {
      fecha: cab.col('fecha 1'), mes: cab.col('mes', true), anio: cab.col('ano', true), titulo: cab.col('actividad', true),
      tipo: cab.col('tipo', true), categoria: cab.col('categoria'), ciudad: cab.col('ciudad'), pais: cab.col('pais'),
      resp: Math.max(cab.col('responsable'), cab.col('respondable')), estado: cab.col('status'),
      part: cab.col('numero de participantes'), costo: cab.col('costo')
    };
    for (let i = cab.fila + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const titulo = texto(r[c.titulo]);
      if (!titulo) continue;
      const f = fecha(r[c.fecha]);
      const a = D.num(r[c.anio]) || (f ? Number(f.slice(0, 4)) : null);
      if (anio && a && a !== anio) continue;
      const mes = mesDeTexto(r[c.mes]) || D.mesDeFecha(f);
      if (!mes) { avisos.push('Fila ' + (i + 1) + ': sin mes, omitida ("' + titulo.slice(0, 50) + '").'); continue; }
      let cat = texto(r[c.categoria]);
      registros.push({
        id: D.uid(), origen: 'matriz', mes, fecha: f, titulo, tipo: texto(r[c.tipo]), categoria: cat,
        ciudad: texto(r[c.ciudad]), pais: texto(r[c.pais]), responsables: texto(r[c.resp]),
        participantes: numero(r[c.part]), costo: numero(r[c.costo]), estado: texto(r[c.estado])
      });
    }
    return { registros, avisos, hojas: [hoja] };
  }

  /* ---------------- Matriz de reuniones bilaterales (Promoción) ----------------
     Una hoja por mes; cada fila es una persona atendida. Se agrupan por
     fecha + empresa + tema + responsable y se guarda solo el número de personas. */
  function importarReuniones(wb) {
    const avisos = [], grupos = new Map(), hojas = [];
    wb.SheetNames.forEach(n => {
      const mes = mesDeTexto(n);
      if (!mes) return;
      const rows = filas(wb.Sheets[n]);
      const cab = buscarCabecera(rows, ['Fecha', 'Empresa'], 12);
      if (!cab) { avisos.push('Hoja ' + n + ': sin cabecera FECHA/EMPRESA.'); return; }
      hojas.push(n);
      const c = {
        fecha: cab.col('fecha', true), empresa: cab.col('empresa', true), sector: cab.col('area del negocio de la empresa', true),
        tema: cab.col('tema', true), resp: cab.col('persona que ingresa')
      };
      // la fila siguiente a la cabecera trae Nombre/Apellido/Cargo…: localizar "Nombre"
      const sub = (rows[cab.fila + 1] || []).map(N);
      let cNombre = cab.norm.indexOf('nombre'); if (cNombre < 0) cNombre = sub.indexOf('nombre');
      let prev = {};
      for (let i = cab.fila + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const emp = texto(r[c.empresa]);
        const nom = cNombre >= 0 ? texto(r[cNombre]) : '';
        if (N(emp) === 'empresa' || N(nom) === 'nombre') continue;
        if (!emp && !nom) continue;
        const reg = {
          fecha: fecha(r[c.fecha]) || (emp ? null : prev.fecha),
          empresa: emp || prev.empresa || '',
          sector: texto(r[c.sector]) || (emp ? '' : prev.sector || ''),
          tema: texto(r[c.tema]) || (emp ? '' : prev.tema || ''),
          responsables: texto(r[c.resp]) || (emp ? '' : prev.responsables || '')
        };
        prev = reg;
        const k = [mes, reg.fecha, N(reg.empresa), N(reg.tema), N(reg.responsables)].join('|');
        if (!grupos.has(k)) grupos.set(k, Object.assign({ id: D.uid(), origen: 'matriz', mes, personas: 0 }, reg));
        grupos.get(k).personas++;
      }
    });
    return { registros: Array.from(grupos.values()), avisos, hojas };
  }

  /* ---------------- Cálculo POI mecanismos (AOI 108) ---------------- */
  function importarExpedientes(wb) {
    const avisos = [], registros = [], hojas = [];
    wb.SheetNames.forEach(n => {
      const m = /^poi\s+([a-zñ]+)/i.exec(n.trim());
      if (!m || !mesDeTexto(m[1])) return;
      const mes = mesDeTexto(m[1]);
      const rows = filas(wb.Sheets[n]);
      const cab = buscarCabecera(rows, ['Trámite', 'Días hábiles'], 15);
      if (!cab) { avisos.push('Hoja ' + n + ': sin cabecera Trámite/Días hábiles.'); return; }
      hojas.push(n);
      const hdr = rows[cab.fila].map(N);
      const c = {
        tramite: cab.col('tramite'), sector: cab.col('sector'), tipo: cab.col('tipo de informe'),
        numero: hdr.indexOf('n°') >= 0 ? hdr.indexOf('n°', 1) : -1, fecha: hdr.indexOf('fecha'),
        asunto: cab.col('asunto'), resp: cab.col('responsable'), dias: cab.col('dias habiles')
      };
      for (let i = cab.fila + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const tr = texto(r[c.tramite]);
        if (!tr) continue;
        if (/^reporte de|^se llego|^evidencia|^actividad/i.test(N(r[0]))) break;
        registros.push({
          id: D.uid(), origen: 'matriz', mes, fecha: fecha(r[c.fecha]), tramite: tr, sector: texto(r[c.sector]),
          tipoInforme: texto(r[c.tipo]), numero: c.numero >= 0 ? texto(r[c.numero]) : '',
          asunto: texto(r[c.asunto]), responsables: texto(r[c.resp]), dias: D.num(r[c.dias])
        });
      }
    });
    if (!hojas.length) throw new Error('No se encontró ninguna hoja "POI <MES>".');
    return { registros, avisos, hojas };
  }

  /* ---------------- Atenciones y Eventos (Facilitación) ---------------- */
  function importarEventosFacilitacion(wb) {
    const hoja = wb.SheetNames.find(n => N(n) === 'eventos');
    if (!hoja) throw new Error('No se encontró la hoja "Eventos".');
    const rows = filas(wb.Sheets[hoja]);
    const cab = buscarCabecera(rows, ['Mes', 'Concepto'], 10);
    const c = { mes: cab.col('mes', true), fecha: cab.col('fecha', true), titulo: cab.col('concepto') };
    const registros = [], avisos = [];
    let mes = null;
    for (let i = cab.fila + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      mes = mesDeTexto(r[c.mes]) || mes;
      const titulo = texto(r[c.titulo]);
      if (!titulo) continue;
      const f = fecha(r[c.fecha]);
      registros.push({ id: D.uid(), origen: 'matriz', mes: mes || D.mesDeFecha(f), fecha: f, titulo, ciudad: '', responsables: '' });
    }
    return { registros, avisos, hojas: [hoja] };
  }
  /* Hojas con secciones por mes (fila con el nombre del mes) y una fila por persona. */
  function importarAtenciones(wb, filtroHojas) {
    const avisos = [], grupos = new Map(), hojas = [];
    const re = filtroHojas || /^atenciones/i;
    wb.SheetNames.filter(n => re.test(n.trim())).forEach(n => {
      const rows = filas(wb.Sheets[n]);
      const cab = buscarCabecera(rows, ['Fecha', 'Empresa'], 12);
      if (!cab) { avisos.push('Hoja ' + n + ': sin cabecera FECHA/EMPRESA.'); return; }
      hojas.push(n);
      const canal = /reunion/i.test(N(n)) && !/atencion/i.test(N(n)) ? 'Reunión' : 'Atención';
      const c = { fecha: cab.col('fecha', true), empresa: cab.col('empresa', true), contacto: cab.col('contacto'), tema: cab.col('tema', true), resp: cab.col('reportado por') };
      let mes = null, prev = {};
      for (let i = cab.fila + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const prim = texto(r[0]);
        if (prim && mesDeTexto(prim) && r.slice(1).every(x => x == null || x === '')) { mes = mesDeTexto(prim); prev = {}; continue; }
        const emp = texto(r[c.empresa]), nom = texto(r[c.contacto]);
        if (!emp && !nom) continue;
        if (N(nom) === 'nombre') continue;
        const f = fecha(r[c.fecha]) || prev.fecha || null;
        const reg = {
          fecha: f, empresa: emp || prev.empresa || '', tema: texto(r[c.tema]) || prev.tema || '',
          responsables: texto(r[c.resp]) || prev.responsables || ''
        };
        const m = mes || D.mesDeFecha(f);
        if (!m) continue;
        prev = reg;
        const k = [m, reg.fecha, N(reg.empresa), N(reg.tema), N(reg.responsables), canal].join('|');
        if (!grupos.has(k)) grupos.set(k, Object.assign({ id: D.uid(), origen: 'matriz', mes: m, canal, personas: 0 }, reg));
        grupos.get(k).personas++;
      }
    });
    return { registros: Array.from(grupos.values()), avisos, hojas };
  }

  /* ---------------- Plantilla estándar ---------------- */
  function hojaPlantilla(tipo) { return D.TIPOS_REGISTRO[tipo].nombre.slice(0, 31); }
  function importarPlantilla(wb, tipo) {
    const def = D.TIPOS_REGISTRO[tipo];
    const hoja = wb.SheetNames.find(n => N(n) === N(hojaPlantilla(tipo))) || wb.SheetNames[0];
    const rows = filas(wb.Sheets[hoja]);
    const cab = buscarCabecera(rows, [def.campos[0][1]], 5);
    if (!cab) throw new Error('La hoja "' + hoja + '" no tiene la cabecera de la plantilla.');
    const registros = [], avisos = [];
    const cMes = cab.col('mes', true);
    for (let i = cab.fila + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (r.every(x => x == null || x === '')) continue;
      const reg = { id: D.uid(), origen: 'plantilla' };
      def.campos.forEach(([k, et, tipoC]) => {
        const j = cab.col(et, true);
        const v = j >= 0 ? r[j] : null;
        reg[k] = tipoC === 'fecha' ? fecha(v) : tipoC === 'numero' ? numero(v) : texto(v);
      });
      reg.mes = (cMes >= 0 ? (D.num(r[cMes]) || mesDeTexto(r[cMes])) : null) || D.mesDeFecha(reg.fecha);
      if (!reg.mes) { avisos.push('Fila ' + (i + 1) + ': sin fecha ni mes, omitida.'); continue; }
      registros.push(reg);
    }
    return { registros, avisos, hojas: [hoja] };
  }

  /* Formatos disponibles por tipo de registro. */
  const FORMATOS = {
    eventos: [{ id: 'eventos', nombre: 'Matriz de eventos (hoja "TODO 20XX")', fn: (wb, a) => importarEventos(wb, a) }],
    reuniones: [{ id: 'reuniones', nombre: 'Matriz de reuniones bilaterales (hojas por mes)', fn: wb => importarReuniones(wb) }],
    expedientes: [{ id: 'expedientes', nombre: 'Cálculo POI mecanismos (hojas "POI <MES>")', fn: wb => importarExpedientes(wb) }],
    eventosFacilitacion: [{ id: 'evfac', nombre: 'Atenciones y Eventos (hoja "Eventos")', fn: wb => importarEventosFacilitacion(wb) }],
    atenciones: [{ id: 'aten', nombre: 'Atenciones y Eventos (hojas "Atenciones…")', fn: wb => importarAtenciones(wb) }]
  };

  global.DSI_IMPORT = {
    importarPOI, importarEventos, importarReuniones, importarExpedientes,
    importarEventosFacilitacion, importarAtenciones, importarPlantilla, hojaPlantilla,
    FORMATOS, fecha, numero, mesDeTexto
  };
})(window);
