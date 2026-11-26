/* ============================================================
   Exportación a Excel (SheetJS): reporte para áreas que no usan el dashboard,
   y plantillas estándar de las matrices.
   ============================================================ */
(function (global) {
  'use strict';
  const D = global.DSI;

  function hoja(aoa, anchos, merges) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w }));
    if (merges) ws['!merges'] = merges;
    return ws;
  }
  function nombreEquipos(datos, ids) {
    return (ids || []).map(id => ((datos.equipos || []).find(e => e.id === id) || { nombre: id }).nombre).join(', ');
  }
  function pct(r) { return r == null ? '' : Math.round(r * 1000) / 10; }

  function hojaPOI(datos) {
    const corte = datos.corte || 12;
    const aoa = [
      ['PLAN OPERATIVO INSTITUCIONAL ' + datos.anio + ' · DIRECCIÓN DE SERVICIOS AL INVERSIONISTA'],
      ['Ejecución reportada a ' + D.MESES[corte - 1] + ' ' + datos.anio + ' · generado ' + new Date().toLocaleString('es-PE')],
      ['Semáforo contra la meta anual: Meta cumplida ≥ 100% · Cerca 80–99% · Por debajo < 80%'],
      []
    ];
    const cab1 = ['Meta', 'Código', 'Actividad operativa', 'Nombre corto', 'Unidad de medida', 'Equipo(s)'];
    const cab2 = ['', '', '', '', '', ''];
    D.MESES_CORTOS.forEach(m => { cab1.push(m.toUpperCase(), ''); cab2.push('PROG', 'EJEC'); });
    cab1.push('TOTAL PROG / META', 'TOTAL EJEC', '% AVANCE', 'ESTADO', 'Prog. a la fecha');
    cab2.push('', '', '', '', '');
    aoa.push(cab1, cab2);
    const merges = [];
    for (let m = 0; m < 12; m++) merges.push({ s: { r: 4, c: 6 + m * 2 }, e: { r: 4, c: 7 + m * 2 } });
    (datos.metas || []).forEach(meta => {
      (datos.indicadores || []).filter(i => i.meta === meta.id).forEach(ind => {
        const r = D.resumenIndicador(datos, ind);
        const fila = ['Meta ' + Number(meta.id), ind.codigo, ind.nombre, ind.corto || '', ind.unidad, nombreEquipos(datos, ind.equipos)];
        for (let m = 0; m < 12; m++) fila.push(r.prog[m], r.ejec[m] == null ? '' : r.ejec[m]);
        fila.push(r.metaAnual == null ? '' : D.redondear(r.metaAnual, 1), r.ejecutado == null ? '' : r.ejecutado, pct(r.avance), r.estado.etiqueta,
          r.esPorcentaje ? '' : r.progFecha);
        aoa.push(fila);
      });
    });
    return hoja(aoa, [8, 17, 60, 34, 16, 22].concat(Array(24).fill(6)).concat([12, 10, 9, 16, 10]), merges);
  }

  function hojaEquipos(datos) {
    const aoa = [['RESUMEN POR EQUIPO · POI ' + datos.anio + ' (a ' + D.MESES[(datos.corte || 12) - 1].toLowerCase() + ')'], [],
      ['Equipo', 'Código', 'Actividad (nombre corto)', 'Meta anual', 'Ejecutado', '% avance', 'Estado']];
    (datos.equipos || []).forEach(eq => {
      const e = D.resumenEquipo(datos, eq);
      aoa.push([eq.nombre, '', 'PROMEDIO DEL EQUIPO', '', '', pct(e.avance), e.resumenes.length ? e.estado.etiqueta : 'Sin actividades']);
      e.resumenes.forEach(r => aoa.push(['', r.ind.codigo, r.ind.corto || r.ind.nombre,
        r.metaAnual == null ? '' : D.redondear(r.metaAnual, 1), r.ejecutado == null ? '' : r.ejecutado, pct(r.avance), r.estado.etiqueta]));
      aoa.push([]);
    });
    return hoja(aoa, [22, 17, 48, 11, 11, 10, 18]);
  }

  function hojaResponsables(datos) {
    const aoa = [['DETALLE POR RESPONSABLE (según matrices) · POI ' + datos.anio], ['Un registro con varios responsables suma para cada uno.'], []];
    const cab = ['Código', 'Actividad', 'Responsable', 'Equipo del responsable'].concat(D.MESES_CORTOS).concat(['Total', 'N° registros']);
    aoa.push(cab);
    (datos.indicadores || []).filter(i => i.fuente && i.fuente.registro).forEach(ind => {
      D.porResponsable(datos, ind).forEach(f => {
        aoa.push([ind.codigo, ind.corto || ind.nombre, f.persona.nombre, nombreEquipos(datos, f.persona.equipo ? [f.persona.equipo] : [])]
          .concat(f.meses.map(v => v == null ? '' : v)).concat([f.valor, f.registros]));
      });
    });
    return hoja(aoa, [17, 40, 26, 18].concat(Array(12).fill(6)).concat([8, 10]));
  }

  function hojaConciliacion(datos) {
    const aoa = [['CONCILIACIÓN: ejecución oficial del POI vs. conteo de las matrices'], [],
      ['Código', 'Actividad', 'Mes', 'Oficial POI', 'Según matrices', 'Diferencia']];
    (datos.indicadores || []).filter(i => i.fuente && i.fuente.registro).forEach(ind => {
      const calc = D.ejecucionCalculada(datos, ind);
      for (let m = 0; m < (datos.corte || 12); m++) {
        const o = (ind.ejec || [])[m], c = calc[m];
        aoa.push([ind.codigo, ind.corto || ind.nombre, D.MESES[m], o == null ? '' : o, c == null ? '' : c,
          o == null || c == null ? '' : D.redondear(c - o, 1)]);
      }
    });
    return hoja(aoa, [17, 40, 11, 11, 14, 11]);
  }

  function hojaRegistros(datos, tipo) {
    const def = D.TIPOS_REGISTRO[tipo];
    const campos = def.campos;
    const aoa = [['Mes'].concat(campos.map(c => c[1])).concat(['Origen'])];
    ((datos.registros || {})[tipo] || []).slice().sort((a, b) => (a.mes - b.mes) || String(a.fecha).localeCompare(String(b.fecha)))
      .forEach(r => aoa.push([D.MESES[r.mes - 1]].concat(campos.map(c => r[c[0]] == null ? '' : r[c[0]])).concat([r.origen || ''])));
    return hoja(aoa, [11].concat(campos.map(c => c[2] === 'texto' ? 34 : 14)).concat([10]));
  }

  function nombreArchivo(base, datos) {
    return base + ' ' + datos.anio + ' - ' + D.MESES[(datos.corte || 12) - 1] + '.xlsx';
  }

  function exportarReporte(datos, opciones) {
    const o = Object.assign({ poi: true, equipos: true, responsables: true, conciliacion: true, registros: true }, opciones || {});
    const wb = XLSX.utils.book_new();
    if (o.poi) XLSX.utils.book_append_sheet(wb, hojaPOI(datos), 'POI ' + datos.anio);
    if (o.equipos) XLSX.utils.book_append_sheet(wb, hojaEquipos(datos), 'Por equipo');
    if (o.responsables) XLSX.utils.book_append_sheet(wb, hojaResponsables(datos), 'Por responsable');
    if (o.conciliacion) XLSX.utils.book_append_sheet(wb, hojaConciliacion(datos), 'Conciliación');
    if (o.registros) Object.keys(D.TIPOS_REGISTRO).forEach(t => {
      if (((datos.registros || {})[t] || []).length) XLSX.utils.book_append_sheet(wb, hojaRegistros(datos, t), D.TIPOS_REGISTRO[t].nombre.slice(0, 31));
    });
    XLSX.writeFile(wb, nombreArchivo('Reporte POI DSI', datos));
  }

  /* Plantilla estándar de matrices: una hoja por tipo, con cabecera y una fila de ejemplo. */
  function descargarPlantilla(tipos) {
    const wb = XLSX.utils.book_new();
    (tipos || Object.keys(D.TIPOS_REGISTRO)).forEach(t => {
      const def = D.TIPOS_REGISTRO[t];
      const cab = def.campos.map(c => c[1]).concat(['Mes']);
      const ejemplo = def.campos.map(c => c[2] === 'fecha' ? '15/03/2027' : c[2] === 'numero' ? 1 : c[2] === 'lista' ? c[3][0] : c[2] === 'personas' ? 'Nombre Apellido' : '(ejemplo)').concat(['']);
      const ws = hoja([cab, ejemplo], cab.map(() => 22));
      XLSX.utils.book_append_sheet(wb, ws, window.DSI_IMPORT.hojaPlantilla(t));
    });
    const notas = [['Instrucciones'], ['• Una fila por registro. Borre la fila de ejemplo.'],
      ['• Fecha en formato dd/mm/aaaa. Si no hay fecha, complete la columna Mes (1–12 o el nombre del mes).'],
      ['• Responsable(s): nombres del personal DSI; varios se separan con "/".'],
      ['• No incluya nombres, correos ni teléfonos de los contactos externos: solo la empresa y el número de personas atendidas.']];
    XLSX.utils.book_append_sheet(wb, hoja(notas, [100]), 'Instrucciones');
    XLSX.writeFile(wb, 'Plantilla matrices DSI.xlsx');
  }

  global.DSI_EXPORT = { exportarReporte, descargarPlantilla };
})(window);
