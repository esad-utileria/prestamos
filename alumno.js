// Pantallas del alumnado: solicitudes (crear, editar, cancelar), mis préstamos y perfil con QR.

const sol = { cesta: [], editando: null, borrador: [], motivoOtro: false, lista: null, respondiendo: null, fechas: null };
const isoDia = d => { const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; };
const ESTADO_SOL = {
  Pendiente: '<span class="badge b-warn">Pendiente de revisión</span>',
  Citada: '<span class="badge b-violet">Cita para recoger</span>',
  Entregada: '<span class="badge b-ok">Entregada</span>',
  Rechazada: '<span class="badge b-danger">Rechazada</span>'
};
// Respuesta del alumno a una cita (la ven los dos lados)
const RESP_CITA = {
  '': '<span class="badge b-violet">Cita sin responder</span>',
  Aceptada: '<span class="badge b-ok">Cita aceptada</span>',
  Rechazada: '<span class="badge b-danger">No puede ir</span>',
  Propuesta: '<span class="badge b-warn">Propone otra fecha</span>'
};
const necesitaAtencion = s => s.estado === 'Citada' && (s.respuestaCita === 'Rechazada' || s.respuestaCita === 'Propuesta');
// Cita a la que el alumno no ha ido (sigue citada y ya pasó la hora): «retraso» el mismo día, «noAcudio» desde el
// día siguiente. Si el alumno ya respondió que no puede o propuso otra fecha, manda esa respuesta.
const citaVencida = s => s.estado !== 'Citada' || !s.cita || necesitaAtencion(s) || new Date(s.cita) > new Date() ? ''
  : new Date(s.cita).toDateString() === new Date().toDateString() ? 'retraso' : 'noAcudio';
const badgeCita = s => ({ retraso: '<span class="badge b-warn">Cita con retraso</span>', noAcudio: '<span class="badge b-warn">No acudió a la cita</span>' })[citaVencida(s)] || RESP_CITA[s.respuestaCita || ''];
const badgeCitaAlumno = s => ({ retraso: '<span class="badge b-warn">Cita con retraso</span>', noAcudio: '<span class="badge b-warn">Cita pasada</span>' })[citaVencida(s)] || RESP_CITA[s.respuestaCita || ''];
const fmtCita = iso => { const d = new Date(iso); return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };
const miniatura = a => `<div class="thumb ph azulejo" ${a && a.foto ? `data-foto="${esc(a.id)}"` : ''} style="aspect-ratio:auto"></div>`;
const artPorId = id => state.articulos.find(a => a.id === id);

// ---------- Cesta de la solicitud ----------
function toggleCesta(id) {
  sol.cesta = sol.cesta.includes(id) ? sol.cesta.filter(x => x !== id) : [...sol.cesta, id];
  toast(sol.cesta.includes(id) ? avisoAlAnadir(artPorId(id)) : 'Quitado de tu solicitud');
  render();
}
// Al añadir un artículo ya solicitado: aviso de lo que pasará (las fechas se eligen después)
function avisoAlAnadir(a) {
  const rs = reservasDe(a).filter(r => r.id !== sol.editando);
  const mia = rs.find(r => r.mia), otra = rs.find(r => !r.mia);
  if (mia) return `Ojo: ya lo pediste en otra solicitud (${periodo(mia)}). Solo podrás enviarlo para fechas que no se solapen.`;
  if (otra) return `Añadido. Otra persona lo ha pedido ${periodo(otra)}: si tus fechas se solapan, irás en cola.`;
  return 'Añadido a tu solicitud';
}

// Qué pasa con cada artículo de la cesta en las fechas elegidas: lo pedí yo en otra solicitud (no se
// puede enviar), lo pidió otra persona (cola) o está prestado hasta después del inicio
function conflictos(a, desde, hasta) {
  // Al editar, solo cuentan las de otras personas que llegaron antes (las reservas vienen por orden de llegada)
  const pos = sol.editando ? reservasDe(a).findIndex(r => r.id === sol.editando) : -1;
  const rs = reservasDe(a).filter((r, i) => r.id !== sol.editando && (r.mia || pos < 0 || i < pos) && desde && hasta && new Date(r.desde) <= hasta && desde <= new Date(r.hasta));
  const libre = libreDesde(a);
  return {
    mia: rs.find(r => r.mia),
    antes: rs.filter(r => !r.mia),
    prestado: libre && desde && desde < libre ? a.prestamo.fin : null
  };
}
// Un artículo prestado a otra persona se puede pedir a partir del día siguiente a su devolución prevista
const libreDesde = a => a && a.prestamo && !a.prestamo.mio ? diaSiguiente(a.prestamo.fin) : null;
const inicioDia = d => { const z = new Date(d); z.setHours(0, 0, 0, 0); return z; };
// Primer día que se puede pedir todo lo de la cesta (nunca antes de hoy)
const minimoCesta = () => sol.cesta.map(artPorId).map(libreDesde).filter(Boolean).reduce((m, d) => d > m ? d : m, inicioDia(new Date()));
// Primeras fechas, con la misma duración, en las que nada de la cesta está prestado ni pedido por otra solicitud
function primerHueco(desde, hasta) {
  const dur = hasta - desde, arts = sol.cesta.map(artPorId).filter(Boolean);
  let ini = new Date(Math.max(desde, minimoCesta().getTime() + 9 * 36e5));
  for (let n = 0; n < 100; n++) {
    const fin = new Date(ini.getTime() + dur);
    const choques = arts.flatMap(a => reservasDe(a).filter(r => r.id !== sol.editando && new Date(r.desde) <= fin && ini <= new Date(r.hasta)));
    if (!choques.length) return [ini, fin];
    ini = diaSiguiente(Math.max(...choques.map(r => new Date(r.hasta).getTime()))); ini.setHours(9);
  }
  return null;
}
const fechasElegidas = () => {
  const d = $('#sDesde'), h = $('#sHasta');
  return d && h && d.value && h.value ? [new Date(d.value + 'T09:00'), new Date(h.value + 'T20:00')] : [null, null];
};
function avisoConflicto(a) {
  const [desde, hasta] = fechasElegidas();
  if (!desde) return '';
  const c = conflictos(a, desde, hasta);
  const rojo = t => `<div class="small" style="color:var(--danger);font-weight:600">${t}</div>`;
  if (c.mia) return rojo(`Ya lo pediste en otra solicitud ${periodo(c.mia)}: quítalo o cambia las fechas`);
  if (c.prestado) return rojo(`Prestado hasta el ${fmt(c.prestado)}: solo se puede pedir a partir del ${fmt(diaSiguiente(c.prestado))}`);
  if (!c.antes.length) return '';
  return `<div class="small" style="color:var(--warn);font-weight:600">En cola: ${c.antes.length === 1 ? 'otra persona lo pidió' : c.antes.length + ' personas lo pidieron'} antes para fechas que se solapan (${c.antes.map(periodo).join('; ')})${c.antes.some(r => r.estado === 'Citada') ? ' y ya está citado' : ''}. Irías detrás: queda libre a partir del ${fmt(diaSiguiente(Math.max(...c.antes.map(r => new Date(r.hasta).getTime()))))}.</div>`;
}
function pintarAvisosCesta() {
  const el = $('#cestaSol'); if (!el) return;
  el.innerHTML = listaCesta(); observarFotos();
  const d = $('#sDesde'), h = $('#sHasta'), caja = $('#sHueco');
  d.min = isoDia(minimoCesta()); h.min = d.value || d.min;
  // Si algo choca, se ofrecen las primeras fechas libres para todo lo de la cesta
  const [desde, hasta] = fechasElegidas();
  const choca = desde && sol.cesta.some(id => { const c = conflictos(artPorId(id) || {}, desde, hasta); return c.mia || c.prestado || c.antes.length; });
  const hueco = choca && hasta >= desde ? primerHueco(desde, hasta) : null;
  caja.innerHTML = hueco ? `<div class="callout warn small stack"><div>Con estas fechas, algo de tu solicitud está prestado o ya lo ha pedido otra persona antes que tú. Primeras fechas libres para todo: <b>del ${fmt(hueco[0])} al ${fmt(hueco[1])}</b>.</div>
    <button class="btn sm" style="justify-self:start" onclick="usarFechas('${isoDia(hueco[0])}', '${isoDia(hueco[1])}')">Usar esas fechas</button></div>` : '';
}
// Las fechas elegidas se recuerdan al volver a pintar la pantalla (p. ej. al quitar un artículo)
function guardarFechas() { sol.fechas = { para: sol.editando, desde: $('#sDesde').value, hasta: $('#sHasta').value }; pintarAvisosCesta(); }
function usarFechas(desde, hasta) { $('#sDesde').value = desde; $('#sHasta').value = hasta; guardarFechas(); toast('Fechas cambiadas'); }
function salirEdicion() { sol.fechas = null; if (sol.editando) { sol.cesta = sol.borrador; sol.borrador = []; sol.editando = null; sol.motivoOtro = false; } }
const enlaceSolicitud = () => sol.editando ? '#solicitud/' + encodeURIComponent(sol.editando) : '#solicitar';
function barraCesta() {
  if (esDocente() || (!sol.cesta.length && !sol.editando)) return '';
  return `<div class="sticky-bar"><a class="btn block" href="${enlaceSolicitud()}">${sol.editando ? 'Volver a mi solicitud' : 'Ver mi solicitud'} (${nArt(sol.cesta.length)})</a></div>`;
}
// Al salir de las pantallas relacionadas, una edición sin guardar se descarta
window.addEventListener('hashchange', () => {
  const r = ruta()[0];
  if (sol.editando && !['solicitud', 'solicitar', 'catalogo', 'articulo', 'escanear'].includes(r)) salirEdicion();
});

function accionesAlumno(a) {
  const enCesta = sol.cesta.includes(a.id);
  if (a.prestamo && a.prestamo.mio) return `<a class="btn ghost block" href="#mis">Ver mis préstamos</a>`;
  if (a.estado === 'mant' || a.estado === 'baja') return '';
  const texto = enCesta ? '✓ Añadido a tu solicitud' : a.estado === 'disp' ? 'Añadir a mi solicitud' : 'Solicitar para otra fecha';
  return `<button class="btn ${a.estado === 'disp' ? '' : 'ghost'} block" onclick="toggleCesta('${esc(a.id)}')">${texto}</button>
    ${sol.cesta.length ? `<a class="btn ghost block" href="${enlaceSolicitud()}">Ver mi solicitud (${sol.cesta.length})</a>` : ''}`;
}

function listaCesta() {
  const items = sol.cesta.map(artPorId).filter(Boolean);
  return `<div class="list">${items.map((a, i) => `<div class="li ${i === items.length - 1 ? 'flash' : ''}">${miniatura(a)}<div class="grow"><div class="title">${esc(a.desc)}</div><div class="small muted">${esc(a.id)}${a.estado === 'prest' ? ' · ahora prestado' : ''}</div>${avisoConflicto(a)}</div>
    <button class="chip" onclick="toggleCesta('${esc(a.id)}')">Quitar</button></div>`).join('') || '<div class="li muted small">Aún no hay artículos</div>'}</div>`;
}

// ---------- Escanear en el almacén ----------
function vEscanear() {
  alMontar = () => { Escaner.montar(codigo => {
    const a = artPorId(codigo);
    if (!a) return toast(`Código ${codigo} desconocido`);
    if (a.estado === 'mant' || a.estado === 'baja') return toast(`${a.desc} no se puede solicitar ahora`);
    if (a.prestamo && a.prestamo.mio) return toast(`${a.desc} ya lo tienes tú`);
    if (sol.cesta.includes(a.id)) return toast(`${a.desc} ya está en tu solicitud`);
    sol.cesta.push(a.id); $('#cestaEsc').innerHTML = listaCesta(); $('#cuentaEsc').textContent = sol.cesta.length; observarFotos();
  }); };
  return `<div class="stack"><h1>Escanear en el almacén</h1>
    <p class="muted small">Pasa la cámara por las etiquetas de los artículos que quieres: se irán añadiendo a tu solicitud.</p>
    ${Escaner.html('Apunta a la etiqueta del artículo')}
    <div class="row"><b><span id="cuentaEsc">${sol.cesta.length}</span> artículos en tu solicitud</b></div>
    <div id="cestaEsc">${listaCesta()}</div>
    <a class="btn block" href="${enlaceSolicitud()}">Revisar y enviar</a></div>`;
}

// ---------- Nueva solicitud / editar ----------
function selectorMotivo(valor, nuevo) {
  const asig = state.maestros.Asignatura || [];
  const otro = sol.motivoOtro || nuevo;
  return `<select class="input" id="sMotivo" onchange="sol.motivoOtro=this.value==='__otro';$('#sMotivoOtro').style.display=sol.motivoOtro?'block':'none';$('#sMotivoAviso').style.display=sol.motivoOtro?'block':'none'">
      ${asig.map(a => `<option ${!otro && a === valor ? 'selected' : ''}>${esc(a)}</option>`).join('')}
      <option value="__otro" ${otro ? 'selected' : ''}>✎ Otra: escribir a mano…</option></select>
    <input class="input" id="sMotivoOtro" style="margin-top:8px;display:${otro ? 'block' : 'none'}" placeholder="Escribe la asignatura o el motivo" value="${nuevo ? esc(valor) : ''}">
    <div class="hint" id="sMotivoAviso" style="display:${otro ? 'block' : 'none'}">Un docente la revisará y podrá corregirla antes de aprobar el préstamo.</div>`;
}

function vSolicitar(s) {
  // Fechas por defecto: las ya elegidas, las de la solicitud que se edita o una semana desde el primer día libre
  const f = sol.fechas && sol.fechas.para === sol.editando ? sol.fechas : null;
  const minimo = minimoCesta();
  const desdeDef = f ? f.desde : isoDia(s ? s.desde : minimo);
  const hastaDef = f ? f.hasta : isoDia(s ? s.hasta : new Date(minimo.getTime() + 7 * 864e5));
  // La lista se pinta cuando ya están las fechas en pantalla: sus avisos dependen de ellas
  alMontar = () => { pintarAvisosCesta(); revalidarCatalogo().then(cambio => { if (cambio) pintarAvisosCesta(); }).catch(() => {}); };
  return `<div class="stack">
    ${s ? '<a href="#solicitudes" class="small" style="color:var(--primary);text-decoration:none">← Mis solicitudes</a>' : ''}
    <div class="row"><h1>${s ? 'Editar solicitud' : 'Nueva solicitud'}</h1><span class="spacer"></span><a class="btn ghost sm" href="#escanear">Escanear</a></div>
    ${s ? `<div class="row wrap">${ESTADO_SOL[s.estado]}<span class="hint" style="margin:0">Puedes cambiarla mientras ningún docente la haya revisado.</span></div>` : ''}
    <div id="cestaSol"></div>
    <a href="#catalogo" class="small" style="color:var(--primary)">+ Añadir desde el catálogo</a>
    <div class="card stack">
      <div class="two"><div><label class="f">Lo necesito desde</label><input class="input" type="date" id="sDesde" value="${desdeDef}" min="${isoDia(minimo)}" onchange="guardarFechas()"></div>
        <div><label class="f">Hasta</label><input class="input" type="date" id="sHasta" value="${hastaDef}" min="${desdeDef}" onchange="guardarFechas()"></div></div>
      <div id="sHueco"></div>
      <div><label class="f">Asignatura o motivo</label>${selectorMotivo(s ? s.motivo : '', s ? s.motivoNuevo : false)}</div>
      <div><label class="f">Comentario</label><textarea class="input" id="sComentario" rows="2">${s ? esc(s.comentario) : ''}</textarea></div>
    </div>
    <button class="btn block" id="btnSol" ${!sol.cesta.length ? 'disabled' : ''} onclick="enviarSolicitud()">${s ? 'Guardar cambios' : 'Enviar solicitud'}</button>
    ${s ? `<button class="btn danger block" onclick="cancelarSolicitud('${esc(s.id)}')">Cancelar solicitud</button>` : ''}
    <p class="hint">Solo un docente puede aprobar la solicitud. Te avisaremos por correo.</p></div>`;
}

async function enviarSolicitud() {
  const btn = $('#btnSol'); btn.disabled = true;
  const motivo = sol.motivoOtro ? $('#sMotivoOtro').value.trim() : $('#sMotivo').value;
  const datos = { articulos: sol.cesta, desde: new Date($('#sDesde').value + 'T09:00').toISOString(), hasta: new Date($('#sHasta').value + 'T20:00').toISOString(), motivo, comentario: $('#sComentario').value };
  try {
    if (!motivo) throw new Error('Escribe la asignatura o el motivo');
    if (datos.hasta < datos.desde) throw new Error('La fecha «hasta» es anterior a «desde»');
    const [desde, hasta] = fechasElegidas();
    const repes = sol.cesta.filter(id => conflictos(artPorId(id) || {}, desde, hasta).mia);
    if (repes.length) throw new Error(`Ya pediste ${repes.join(', ')} en otra solicitud para fechas que se solapan. Quítalos o cambia las fechas.`);
    if (!sol.editando && desde < inicioDia(new Date())) throw new Error('La fecha «desde» ya ha pasado');
    const prestados = sol.cesta.filter(id => conflictos(artPorId(id) || {}, desde, hasta).prestado);
    if (prestados.length) throw new Error(`${prestados.join(', ')} está prestado en esas fechas. Elige fechas a partir del ${fmt(minimoCesta())}.`);
    const enCola = sol.cesta.map(artPorId).filter(a => a && conflictos(a, desde, hasta).antes.length);
    if (enCola.length && !confirm(`Otra persona pidió antes ${enCola.map(a => a.desc).join(', ')} para fechas que se solapan. Si lo envías así, irás detrás en la cola y solo te lo darán si queda libre.\n\n¿Enviar igualmente? (Cancelar para elegir otras fechas)`)) { btn.disabled = false; return; }
    if (sol.editando) { await api('editarSolicitud', { ...datos, id: sol.editando }); salirEdicion(); toast('Cambios guardados'); }
    else {
      const r = await api('crearSolicitud', datos); sol.cesta = []; sol.motivoOtro = false; sol.fechas = null;
      // Si mientras tanto otra persona pidió lo mismo, el servidor dice que va en cola
      toast(r.cola && r.cola.length ? `Solicitud enviada, pero en cola: otra persona pidió antes ${r.cola.map(c => c.articulo).join(', ')}. Puedes cambiar las fechas en Mis solicitudes.` : 'Solicitud enviada. Un docente la revisará.');
    }
    sol.lista = null;
    revalidarCatalogo(true).catch(() => {}); // para que el catálogo la muestre como solicitada
    ir('solicitudes');
  } catch (e) {
    btn.disabled = false;
    // Algún artículo ha dejado de estar disponible desde que se cargó el catálogo: se actualiza y se quita
    if (e.codigo === 409 && /No se pueden solicitar/.test(e.message)) {
      try { state.articulos = await api('catalogo'); } catch (e2) { /* se mantiene el catálogo anterior */ }
      const fuera = sol.cesta.filter(id => { const a = artPorId(id); return !a || a.estado === 'mant' || a.estado === 'baja'; });
      sol.cesta = sol.cesta.filter(id => !fuera.includes(id));
      render();
      toast(`Ya no se pueden solicitar (mantenimiento o baja): ${fuera.join(', ')}. Los he quitado de tu solicitud.`);
    } else { if (e.codigo === 409) salirEdicion(); fallo(e); }
  }
}
async function cancelarSolicitud(id) {
  if (!confirm('¿Cancelar esta solicitud?')) return;
  try {
    await api('cancelarSolicitud', { id }); salirEdicion(); sol.lista = null; sol.respondiendo = null; toast('Solicitud cancelada');
    revalidarCatalogo(true).catch(() => {}); // sus artículos dejan de figurar como solicitados
    ir('solicitudes');
  } catch (e) { fallo(e); }
}

// ---------- Mis solicitudes ----------
// Artículos de una solicitud mía que otra persona pidió antes para fechas que se solapan
function enCola(s) {
  return s.articulos.map(artPorId).filter(Boolean).filter(a => {
    const rs = reservasDe(a), pos = rs.findIndex(r => r.id === s.id);
    return pos > 0 && rs.slice(0, pos).some(r => !r.mia && new Date(r.desde) <= new Date(s.hasta) && new Date(s.desde) <= new Date(r.hasta));
  });
}
async function misSolicitudes() { if (!sol.lista) sol.lista = await api('solicitudes', { mias: true }); return sol.lista; }

function vSolicitudesAlumno() {
  alMontar = () => datosAlDia('misSolicitudes', () => api('solicitudes', { mias: true }), ls => {
      sol.lista = ls;
      $('#listaSol').innerHTML = ls.map(s => `<a class="card stack" href="#solicitud/${encodeURIComponent(s.id)}" style="display:block;text-decoration:none;color:inherit">
        <div class="row"><div class="grow"><b>${esc(s.motivo)}</b></div>${ESTADO_SOL[s.estado] || ''}</div>
        <div class="small muted">${fmt(s.desde)} – ${fmt(s.hasta)} · ${nArt(s.articulos.length)}</div>
        ${s.estado === 'Pendiente' && enCola(s).length ? `<div class="callout warn small">En cola: otra persona pidió antes ${enCola(s).map(a => esc(a.desc)).join(', ')} para fechas que se solapan. Ábrela para elegir otras fechas.</div>` : ''}
        ${s.estado === 'Citada' ? `<div class="callout violet">Cita: <b>${fmtCita(s.cita)}</b> ${badgeCitaAlumno(s)}</div>` : ''}
        <div class="small" style="color:var(--primary);font-weight:600">${s.estado === 'Pendiente' ? 'Ver y editar ›' : s.estado === 'Citada' && !s.respuestaCita ? 'Responder a la cita ›' : 'Ver detalle ›'}</div></a>`).join('')
        || '<p class="muted">Todavía no has hecho ninguna solicitud.</p>';
    }).catch(e => errorEn('#listaSol', e));
  return `<div class="stack"><div class="row"><h1>Mis solicitudes</h1><span class="spacer"></span><a class="btn ghost sm" href="${sol.cesta.length ? '#solicitar' : '#catalogo'}">${sol.cesta.length ? `Continuar (${sol.cesta.length})` : '+ Nueva'}</a></div>
    <p class="hint">Las solicitudes las revisa y aprueba siempre un docente.</p>
    <div class="stack" id="listaSol">${esqueleto(3)}</div></div>`;
}

function vSolicitud(id) {
  const s = (sol.lista || []).find(x => x.id === id);
  if (!s) { alMontar = async () => { try { await misSolicitudes(); render(); } catch (e) { toast(e.message); } }; return esqueleto(3); }
  if (s.estado === 'Pendiente') {
    if (sol.editando !== id) { sol.borrador = sol.cesta; sol.cesta = s.articulos.slice(); sol.editando = id; sol.motivoOtro = s.motivoNuevo; }
    return vSolicitar(s);
  }
  return `<div class="stack"><a href="#solicitudes" class="small" style="color:var(--primary);text-decoration:none">← Mis solicitudes</a>
    <div class="row"><h1>Solicitud</h1><span class="spacer"></span>${ESTADO_SOL[s.estado] || ''}</div>
    ${s.estado === 'Citada' ? bloqueCitaAlumno(s) : ''}
    ${s.estado === 'Entregada' ? '<div class="callout ok">Material entregado. Lo encontrarás en <a href="#mis">Mis préstamos</a>.</div>' : ''}
    ${s.estado === 'Rechazada' && s.motivoRechazo ? `<div class="callout warn">Motivo: ${esc(s.motivoRechazo)}</div>` : ''}
    <div class="card stack small">
      <div class="two"><div><div class="muted">Desde</div><b>${fmt(s.desde)}</b></div><div><div class="muted">Hasta</div><b>${fmt(s.hasta)}</b></div></div>
      <div><div class="muted">Asignatura o motivo</div><b>${esc(s.motivo)}</b></div>
      ${s.comentario ? `<div><div class="muted">Comentario</div>${esc(s.comentario)}</div>` : ''}</div>
    <div class="list">${s.articulos.map(i => { const a = artPorId(i); return `<a class="li" href="#articulo/${encodeURIComponent(i)}">${miniatura(a)}<div class="grow"><div class="title">${esc(a ? a.desc : i)}</div><div class="small muted">${esc(i)}</div></div></a>`; }).join('')}</div>
    ${s.estado === 'Citada' ? `<button class="btn danger block" onclick="cancelarSolicitud('${esc(s.id)}')">Ya no lo necesito: cancelar solicitud</button>` : ''}</div>`;
}

// ---------- Responder a la cita ----------
function bloqueCitaAlumno(s) {
  const id = esc(s.id), r = s.respuestaCita || '';
  const msg = s.mensajeCita ? `<div class="small">Tu mensaje: «${esc(s.mensajeCita)}»</div>` : '';
  let estado = {
    '': `<b>Te han citado el ${fmtCita(s.cita)}</b> para recoger el material en el almacén. ¿Puedes ir?`,
    Aceptada: `Has confirmado la cita del <b>${fmtCita(s.cita)}</b>. Te esperamos en el almacén.`,
    Rechazada: `Has indicado que no puedes ir a la cita del ${fmtCita(s.cita)}. El docente te propondrá otra fecha.`,
    Propuesta: `Has propuesto el <b>${fmtCita(s.citaPropuesta)}</b> en lugar del ${fmtCita(s.cita)}. Falta que el docente lo confirme.`
  }[r];
  const vencida = citaVencida(s);
  if (vencida) estado = vencida === 'retraso'
    ? `Tu cita era hoy, <b>${fmtCita(s.cita)}</b>, y aún no consta que hayas recogido el material. Si no puedes ir, propón otra fecha.`
    : `<b>No acudiste a la cita del ${fmtCita(s.cita)}.</b> Propón otra fecha o cancela la solicitud; si no, el docente podrá anularla.`;
  if (sol.respondiendo === s.id + ':Propuesta' || sol.respondiendo === s.id + ':Rechazada') {
    const propone = sol.respondiendo.endsWith('Propuesta');
    const man = new Date(Date.now() + 864e5);
    return `<div class="callout violet stack"><div>${estado}</div>
      <b>${propone ? 'Proponer otra fecha' : 'No puedo ir'}</b>
      ${propone ? `<div class="two"><div><label class="f">Día</label><input class="input" type="date" id="rDia" value="${isoDia(man)}" min="${isoDia(new Date())}"></div><div><label class="f">Hora</label><input class="input" type="time" id="rHora" value="10:00"></div></div>` : ''}
      <div><label class="f">Mensaje para el docente${propone ? ' (opcional)' : ''}</label><textarea class="input" id="rMsg" rows="2" placeholder="${propone ? 'Ej.: ese día tengo ensayo' : 'Explica por qué no puedes ir'}"></textarea></div>
      <div class="two"><button class="btn" id="btnResp" onclick="responderCita('${id}', '${propone ? 'Propuesta' : 'Rechazada'}')">Enviar</button><button class="btn ghost" style="background:#fff" onclick="sol.respondiendo=null;render()">Cancelar</button></div></div>`;
  }
  return `<div class="callout violet stack"><div>${estado}</div>${msg}
    <div class="row wrap" style="gap:8px">
      ${r !== 'Aceptada' && !vencida ? `<button class="btn sm" onclick="responderCita('${id}', 'Aceptada')">Acepto la cita</button>` : ''}
      <button class="btn ghost sm" style="background:#fff" onclick="sol.respondiendo='${id}:Propuesta';render()">Proponer otra fecha</button>
      ${r !== 'Rechazada' ? `<button class="btn ghost sm" style="background:#fff" onclick="sol.respondiendo='${id}:Rechazada';render()">No puedo ir</button>` : ''}
    </div></div>`;
}
async function responderCita(id, respuesta) {
  const s = (sol.lista || []).find(x => x.id === id);
  const datos = { id, respuesta, cita: s && s.cita };
  if (respuesta === 'Propuesta') {
    if (!$('#rDia').value || !$('#rHora').value) return toast('Indica el día y la hora');
    datos.propuesta = new Date($('#rDia').value + 'T' + $('#rHora').value).toISOString();
  }
  if (respuesta !== 'Aceptada') datos.mensaje = $('#rMsg').value.trim();
  if (respuesta === 'Rechazada' && !datos.mensaje) return toast('Explica al docente por qué no puedes ir');
  const btn = $('#btnResp'); if (btn) btn.disabled = true;
  try {
    await api('responderCita', datos);
    sol.respondiendo = null; sol.lista = null;
    toast({ Aceptada: 'Cita aceptada. Te esperamos.', Rechazada: 'Hemos avisado al docente', Propuesta: 'Fecha propuesta: el docente la confirmará' }[respuesta]);
    await misSolicitudes(); render();
  } catch (e) { sol.respondiendo = null; if (btn) btn.disabled = false; fallo(e); }
}

// Enlaces de los botones del correo de cita: #cita/<id>/aceptar | proponer | nopuedo.
// Aceptar pide un solo toque más (así un programa que abra los enlaces del correo no responde por nadie);
// proponer y no puedo abren la solicitud con el formulario ya desplegado.
function vCitaCorreo(id, accion) {
  const s = (sol.lista || []).find(x => x.id === id);
  if (!s) { alMontar = async () => { try { sol.lista = null; await misSolicitudes(); if (sol.lista.some(x => x.id === id)) render(); else $('#citaCorreo').innerHTML = '<p>No se encuentra la solicitud. Puede que se haya cancelado.</p><a class="btn block" href="#solicitudes">Mis solicitudes</a>'; } catch (e) { errorEn('#citaCorreo', e); } }; return `<div class="stack" id="citaCorreo">${esqueleto(2)}</div>`; }
  if (s.estado !== 'Citada') return `<div class="stack"><h1>Cita</h1><div class="callout warn">Esta solicitud ya no tiene una cita pendiente (${esc(String(s.estado).toLowerCase())}).</div><a class="btn block" href="#solicitud/${encodeURIComponent(id)}">Ver la solicitud</a></div>`;
  if (accion === 'proponer' || accion === 'nopuedo') {
    sol.respondiendo = id + ':' + (accion === 'proponer' ? 'Propuesta' : 'Rechazada');
    setTimeout(() => ir('solicitud/' + encodeURIComponent(id)));
    return esqueleto(2);
  }
  return `<div class="stack"><h1>Confirmar la cita</h1>
    <div class="callout violet stack"><div>Te han citado el <b>${fmtCita(s.cita)}</b> para recoger el material de <b>${esc(s.motivo)}</b> en el almacén.</div>
      ${s.respuestaCita === 'Aceptada' ? '<div><b>Ya la habías aceptado.</b> Te esperamos.</div>' : `<button class="btn block" id="btnResp" onclick="responderCita('${esc(id)}', 'Aceptada')">Sí, acepto la cita</button>`}
      <a class="btn ghost block" style="background:#fff" href="#solicitud/${encodeURIComponent(id)}">Ver la solicitud u otras opciones</a></div></div>`;
}

// ---------- Mis préstamos ----------
function vMis() {
  alMontar = () => datosAlDia('mis', () => apiVarias([['prestamos', { todos: true }], ['solicitudes', { mias: true }]]), ([ps, ls]) => {
      sol.lista = ls;
      const activos = ps.filter(p => p.lineas.some(l => !l.devuelto)), hist = ps.filter(p => !p.lineas.some(l => !l.devuelto));
      const citas = ls.filter(s => s.estado === 'Citada');
      $('#misCont').innerHTML = `
        ${citas.map(s => `<a class="callout violet" style="display:block;text-decoration:none;color:inherit" href="#solicitud/${encodeURIComponent(s.id)}">Cita para recoger tu material: <b>${fmtCita(s.cita)}</b> ${badgeCitaAlumno(s)}<div class="small" style="color:var(--primary);font-weight:600;margin-top:4px">${s.respuestaCita ? 'Ver o cambiar respuesta ›' : 'Responder a la cita ›'}</div></a>`).join('')}
        ${activos.map(p => `<div class="card stack">
          <div class="row"><b class="grow">${esc(p.asignatura)}</b>${new Date(p.fin) < new Date() ? '<span class="badge b-danger">Devolución con retraso</span>' : '<span class="badge b-ok">En curso</span>'}</div>
          <div class="small muted">Devolver antes del <b style="color:var(--ink)">${fmt(p.fin)}</b> · ${nArt(p.lineas.filter(l => !l.devuelto).length)} pendientes</div>
          <div class="list small">${p.lineas.map(l => `<a class="li" href="#articulo/${encodeURIComponent(l.id)}">${miniatura(artPorId(l.id))}<div class="grow"><div class="title">${esc(l.desc)}</div><div class="muted">${esc(l.id)}</div></div>${l.devuelto ? '<span class="badge b-info">Devuelto</span>' : ''}</a>`).join('')}</div></div>`).join('')
          || '<p class="muted">No tienes préstamos en curso.</p>'}
        ${hist.length ? `<h2>Historial</h2><div class="list">${hist.map(p => `<div class="li"><div class="grow"><div class="title">${esc(p.asignatura)}</div><div class="small muted">${fmt(p.inicio)} – ${fmt(p.fin)} · ${nArt(p.lineas.length)}</div></div><span class="badge b-info">Devuelto</span></div>`).join('')}</div>` : ''}`;
      observarFotos();
    }).catch(e => errorEn('#misCont', e));
  return `<div class="stack"><h1>Mis préstamos</h1><div class="stack" id="misCont">${esqueleto(3)}</div></div>`;
}

// ---------- Perfil ----------
function qrSvg(texto) {
  if (!window.qrcode) return '';
  const qr = qrcode(0, 'M'); qr.addData(texto); qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
function vPerfilCompleto() {
  const u = state.usuario, m = state.maestros;
  const nombre = [u.nombre, u.apellidos].join(' ').trim() || u.email;
  return `<div class="stack"><h1>${esDocente() ? 'Perfil' : 'Mi perfil'}</h1>
    <div class="card stack" style="text-align:center">
      <div><b>${esc(nombre)}</b><div class="small muted">${esc(u.email)}</div><div style="margin-top:6px"><span class="badge b-info">${esc(u.rol)}</span></div></div>
      ${esDocente() ? '' : `<div style="width:220px;max-width:100%;margin:0 auto">${qrSvg(u.email)}</div>
        <p class="small muted">Enseña este código en el almacén para que el docente te seleccione al prestarte material.</p>`}
    </div>
    <div class="card stack">
      <div class="two"><div><label class="f">Especialidad</label><select class="input" id="pEsp"><option value="">—</option>${(m.Especialidad || []).map(e => `<option ${u.especialidad === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
        <div><label class="f">Curso</label><select class="input" id="pCurso"><option value="">—</option>${(m.Curso || []).map(c => `<option ${u.curso === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
      <label class="row small"><input type="checkbox" id="pAvisos" checked> Recibir recordatorios por correo</label>
      <button class="btn" onclick="guardarPerfil()">Guardar</button></div>
    <a class="btn ghost block" href="#ayuda">Ayuda: cómo funciona la aplicación</a>
    <button class="btn ghost block" onclick="cerrarSesion()">Cerrar sesión</button></div>`;
}
async function guardarPerfil() {
  const datos = { especialidad: $('#pEsp').value, curso: $('#pCurso').value, avisos: $('#pAvisos').checked };
  try { await api('guardarPerfil', datos); Object.assign(state.usuario, { especialidad: datos.especialidad, curso: datos.curso }); toast('Perfil guardado'); } catch (e) { toast(e.message); }
}

Object.assign(VISTAS, {
  mis: () => vMis(), solicitar: () => vSolicitar(null), solicitud: id => vSolicitud(id), escanear: () => vEscanear(), perfil: () => vPerfilCompleto(),
  cita: id => vCitaCorreo(id, ruta()[2])
});
