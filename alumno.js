// Pantallas del alumnado: solicitudes (crear, editar, cancelar), mis préstamos y perfil con QR.

const sol = { cesta: [], editando: null, borrador: [], motivoOtro: false, lista: null, respondiendo: null };
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
const fmtCita = iso => { const d = new Date(iso); return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };
const miniatura = a => `<div class="thumb ph azulejo" ${a && a.foto ? `data-foto="${esc(a.id)}"` : ''} style="aspect-ratio:auto"></div>`;
const artPorId = id => state.articulos.find(a => a.id === id);

// ---------- Cesta de la solicitud ----------
function toggleCesta(id) {
  sol.cesta = sol.cesta.includes(id) ? sol.cesta.filter(x => x !== id) : [...sol.cesta, id];
  toast(sol.cesta.includes(id) ? 'Añadido a tu solicitud' : 'Quitado de tu solicitud');
  render();
}
function salirEdicion() { if (sol.editando) { sol.cesta = sol.borrador; sol.borrador = []; sol.editando = null; sol.motivoOtro = false; } }
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
  return `<div class="list">${items.map((a, i) => `<div class="li ${i === items.length - 1 ? 'flash' : ''}">${miniatura(a)}<div class="grow"><div class="title">${esc(a.desc)}</div><div class="small muted">${esc(a.id)}${a.estado === 'prest' ? ' · ahora prestado' : ''}</div></div>
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
  const hoy = new Date(), semana = new Date(Date.now() + 7 * 864e5);
  return `<div class="stack">
    ${s ? '<a href="#solicitudes" class="small" style="color:var(--primary);text-decoration:none">← Mis solicitudes</a>' : ''}
    <div class="row"><h1>${s ? 'Editar solicitud' : 'Nueva solicitud'}</h1><span class="spacer"></span><a class="btn ghost sm" href="#escanear">Escanear</a></div>
    ${s ? `<div class="row wrap">${ESTADO_SOL[s.estado]}<span class="hint" style="margin:0">Puedes cambiarla mientras ningún docente la haya revisado.</span></div>` : ''}
    ${listaCesta()}
    <a href="#catalogo" class="small" style="color:var(--primary)">+ Añadir desde el catálogo</a>
    <div class="card stack">
      <div class="two"><div><label class="f">Lo necesito desde</label><input class="input" type="date" id="sDesde" value="${isoDia(s ? s.desde : hoy)}"></div>
        <div><label class="f">Hasta</label><input class="input" type="date" id="sHasta" value="${isoDia(s ? s.hasta : semana)}"></div></div>
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
    if (sol.editando) { await api('editarSolicitud', { ...datos, id: sol.editando }); salirEdicion(); toast('Cambios guardados'); }
    else { await api('crearSolicitud', datos); sol.cesta = []; sol.motivoOtro = false; toast('Solicitud enviada. Un docente la revisará.'); }
    sol.lista = null;
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
  try { await api('cancelarSolicitud', { id }); salirEdicion(); sol.lista = null; sol.respondiendo = null; toast('Solicitud cancelada'); ir('solicitudes'); } catch (e) { fallo(e); }
}

// ---------- Mis solicitudes ----------
async function misSolicitudes() { if (!sol.lista) sol.lista = await api('solicitudes', { mias: true }); return sol.lista; }

function vSolicitudesAlumno() {
  alMontar = () => datosAlDia('misSolicitudes', () => api('solicitudes', { mias: true }), ls => {
      sol.lista = ls;
      $('#listaSol').innerHTML = ls.map(s => `<a class="card stack" href="#solicitud/${encodeURIComponent(s.id)}" style="display:block;text-decoration:none;color:inherit">
        <div class="row"><div class="grow"><b>${esc(s.motivo)}</b></div>${ESTADO_SOL[s.estado] || ''}</div>
        <div class="small muted">${fmt(s.desde)} – ${fmt(s.hasta)} · ${nArt(s.articulos.length)}</div>
        ${s.estado === 'Citada' ? `<div class="callout violet">Cita: <b>${fmtCita(s.cita)}</b> ${RESP_CITA[s.respuestaCita || '']}</div>` : ''}
        <div class="small" style="color:var(--primary);font-weight:600">${s.estado === 'Pendiente' ? 'Ver y editar ›' : s.estado === 'Citada' && !s.respuestaCita ? 'Responder a la cita ›' : 'Ver detalle ›'}</div></a>`).join('')
        || '<p class="muted">Todavía no has hecho ninguna solicitud.</p>';
    }).catch(e => { $('#listaSol').innerHTML = `<p>${esc(e.message)}</p>`; });
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
  const estado = {
    '': `<b>Te han citado el ${fmtCita(s.cita)}</b> para recoger el material en el almacén. ¿Puedes ir?`,
    Aceptada: `Has confirmado la cita del <b>${fmtCita(s.cita)}</b>. Te esperamos en el almacén.`,
    Rechazada: `Has indicado que no puedes ir a la cita del ${fmtCita(s.cita)}. El docente te propondrá otra fecha.`,
    Propuesta: `Has propuesto el <b>${fmtCita(s.citaPropuesta)}</b> en lugar del ${fmtCita(s.cita)}. Falta que el docente lo confirme.`
  }[r];
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
      ${r !== 'Aceptada' ? `<button class="btn sm" onclick="responderCita('${id}', 'Aceptada')">Acepto la cita</button>` : ''}
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

// ---------- Mis préstamos ----------
function vMis() {
  alMontar = () => datosAlDia('mis', () => Promise.all([api('prestamos', { todos: true }), api('solicitudes', { mias: true })]), ([ps, ls]) => {
      sol.lista = ls;
      const activos = ps.filter(p => p.lineas.some(l => !l.devuelto)), hist = ps.filter(p => !p.lineas.some(l => !l.devuelto));
      const citas = ls.filter(s => s.estado === 'Citada');
      $('#misCont').innerHTML = `
        ${citas.map(s => `<a class="callout violet" style="display:block;text-decoration:none;color:inherit" href="#solicitud/${encodeURIComponent(s.id)}">Cita para recoger tu material: <b>${fmtCita(s.cita)}</b> ${RESP_CITA[s.respuestaCita || '']}<div class="small" style="color:var(--primary);font-weight:600;margin-top:4px">${s.respuestaCita ? 'Ver o cambiar respuesta ›' : 'Responder a la cita ›'}</div></a>`).join('')}
        ${activos.map(p => `<div class="card stack">
          <div class="row"><b class="grow">${esc(p.asignatura)}</b>${new Date(p.fin) < new Date() ? '<span class="badge b-danger">Con retraso</span>' : '<span class="badge b-ok">En curso</span>'}</div>
          <div class="small muted">Devolver antes del <b style="color:var(--ink)">${fmt(p.fin)}</b> · ${nArt(p.lineas.filter(l => !l.devuelto).length)} pendientes</div>
          <div class="list small">${p.lineas.map(l => `<a class="li" href="#articulo/${encodeURIComponent(l.id)}">${miniatura(artPorId(l.id))}<div class="grow"><div class="title">${esc(l.desc)}</div><div class="muted">${esc(l.id)}</div></div>${l.devuelto ? '<span class="badge b-info">Devuelto</span>' : ''}</a>`).join('')}</div></div>`).join('')
          || '<p class="muted">No tienes préstamos en curso.</p>'}
        ${hist.length ? `<h2>Historial</h2><div class="list">${hist.map(p => `<div class="li"><div class="grow"><div class="title">${esc(p.asignatura)}</div><div class="small muted">${fmt(p.inicio)} – ${fmt(p.fin)} · ${nArt(p.lineas.length)}</div></div><span class="badge b-info">Devuelto</span></div>`).join('')}</div>` : ''}`;
      observarFotos();
    }).catch(e => { $('#misCont').innerHTML = `<p>${esc(e.message)}</p>`; });
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
    <button class="btn ghost block" onclick="cerrarSesion()">Cerrar sesión</button></div>`;
}
async function guardarPerfil() {
  const datos = { especialidad: $('#pEsp').value, curso: $('#pCurso').value, avisos: $('#pAvisos').checked };
  try { await api('guardarPerfil', datos); Object.assign(state.usuario, { especialidad: datos.especialidad, curso: datos.curso }); toast('Perfil guardado'); } catch (e) { toast(e.message); }
}

Object.assign(VISTAS, {
  mis: () => vMis(), solicitar: () => vSolicitar(null), solicitud: id => vSolicitud(id), escanear: () => vEscanear(), perfil: () => vPerfilCompleto()
});
