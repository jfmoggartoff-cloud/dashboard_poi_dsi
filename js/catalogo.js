/* ============================================================
   Valores por defecto que se aplican al importar un POI nuevo.
   Todo es editable después desde Administración (equipos, asignación,
   nombres cortos, reglas de conteo, personas).
   ============================================================ */
(function (global) {
  'use strict';
  const EQUIPOS = [
    { id: 'promocion', nombre: 'Promoción' },
    { id: 'facilitacion', nombre: 'Facilitación' },
    { id: 'internacional', nombre: 'Internacional' },
    { id: 'postinversion', nombre: 'Post Inversión' },
    { id: 'estudios', nombre: 'Estudios Económicos' }
  ];

  /* Por código AOI (últimos 3 dígitos): nombre corto y equipos PRELIMINARES (por confirmar). */
  const POR_CODIGO = {
    '081': { corto: 'Eventos de promoción organizados', equipos: ['promocion'], fuente: { registro: 'eventos', filtro: { categoria: ['Promoción', 'Acto público'] }, medida: 'conteo' } },
    '082': { corto: 'Planes iniciales de promoción', equipos: ['promocion'] },
    '083': { corto: 'Personas atendidas en reuniones bilaterales', equipos: ['promocion'], fuente: { registro: 'reuniones', medida: 'personas' } },
    '151': { corto: 'Documentos de análisis económico', equipos: ['estudios'] },
    '188': { corto: 'Reportes de ejes y corredores', equipos: ['estudios'] },
    '169': { corto: 'Informes del boletín informativo', equipos: ['promocion'] },
    '116': { corto: 'Informes de experiencia web', equipos: ['promocion'] },
    '089': { corto: 'Eventos de difusión de mecanismos', equipos: ['facilitacion'], fuente: { registro: 'eventosFacilitacion', medida: 'conteo' } },
    '090': { corto: 'Reportes de acuerdos internacionales', equipos: ['internacional'] },
    '091': { corto: 'Informes Comisión Especial de Controversias', equipos: ['internacional'] },
    '170': { corto: 'Reportes OCDE y conducta empresarial', equipos: ['internacional'] },
    '093': { corto: 'Reportes de participación en APEC', equipos: ['internacional'] },
    '108': { corto: 'Expedientes atendidos en 18 días o menos', equipos: ['facilitacion'], fuente: { registro: 'expedientes', medida: 'porcentaje', limiteDias: 18 } },
    '204': { corto: 'Eventos de facilitación de la inversión', equipos: ['facilitacion'], fuente: { registro: 'eventosFacilitacion', medida: 'conteo' } },
    '205': { corto: 'Atenciones de facilitación', equipos: ['facilitacion'], fuente: { registro: 'atenciones', medida: 'personas' } },
    '095': { corto: 'Reportes de compromisos de inversión', equipos: ['postinversion'] },
    '109': { corto: 'Resoluciones de distribución de recursos', equipos: ['postinversion'] },
    '117': { corto: 'Informes de obligaciones D. Leg. 674', equipos: ['postinversion'] }
  };

  /* Responsables internos que aparecen en las matrices 2026 (alias = como se escriben allí). */
  const PERSONAS = [
    { nombre: 'Solange Moscoso', equipo: 'promocion', alias: ['Solange', 'Solange Moscoso / PE'] },
    { nombre: 'Milagros Rasmussen', equipo: 'promocion', alias: ['Milagros'] },
    { nombre: 'Jorge Valverde', equipo: 'promocion', alias: ['Jorge', 'Jorge Valvede'] },
    { nombre: 'Jean Franco', equipo: 'promocion', alias: ['Jean Franco M.'] },
    { nombre: 'Juan Francisco', equipo: 'promocion', alias: ['Juan Francisco V.'] },
    { nombre: 'Giovanni', equipo: 'promocion', alias: [] },
    { nombre: 'Luis Felipe Córdova', equipo: 'facilitacion', alias: ['Felipe', 'Luis Felipe Cordova Chumacero'] },
    { nombre: 'Juan Manuel Calderón', equipo: 'facilitacion', alias: ['JMC', 'Juan Manuel', 'JuanManuel', 'Juan Manuel Calderon Izquierdo'] },
    { nombre: 'Ana María Araujo', equipo: 'facilitacion', alias: ['Ana María', 'Ana', 'Ana María Araujo Huerta'] },
    { nombre: 'Heidi Maguiña', equipo: 'facilitacion', alias: ['Heidi'] },
    { nombre: 'Lisbeth Loja', equipo: '', alias: [] },
    { nombre: 'Franck', equipo: '', alias: ['Frank'] },
    { nombre: 'Michelle', equipo: '', alias: [] },
    { nombre: 'Alexander', equipo: '', alias: [] },
    { nombre: 'Elba Roo', equipo: '', alias: ['Elba'] },
    { nombre: 'Herbert', equipo: '', alias: [] },
    { nombre: 'Grethell', equipo: '', alias: [] },
    { nombre: 'Daniela', equipo: '', alias: [] },
    { nombre: 'Richard', equipo: '', alias: [] },
    { nombre: 'Axel', equipo: '', alias: [] }
  ];

  function fuenteVacia() { return { registro: null, medida: 'conteo', filtro: {}, desdeMes: null }; }

  /* Completa un indicador importado con los valores por defecto. */
  function completarIndicador(ind) {
    const base = POR_CODIGO[ind.codigo.slice(-3)] || {};
    ind.corto = ind.corto || base.corto || '';
    ind.equipos = ind.equipos || (base.equipos ? base.equipos.slice() : []);
    ind.fuente = ind.fuente || Object.assign(fuenteVacia(), JSON.parse(JSON.stringify(base.fuente || {})));
    return ind;
  }

  global.DSI_CATALOGO = { EQUIPOS, POR_CODIGO, PERSONAS, completarIndicador, fuenteVacia };
})(window);
