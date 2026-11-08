// Pantallas del profesorado: inicio, prestar, devolver, préstamos, alta de artículos y etiquetas.

const op = { usuarios: null, alumno: null, cesta: [], paso: 1, devueltos: [], danos: {}, prestamos: null, altaCodigo: '', altaFoto: '', nuevaCat: false, asigOtra: false };
const eti = { modo: 'nuevos', hojas: 1, inicio: 1, cortes: true, libres: null, siguiente: null, reimprimir: [] };
const POR_HOJA = 108; // A4: 4 columnas × 27 filas de 50 × 10 mm

const articulo = id => state.articulos.find(a => a.id === id);
const hoy = () => new Date();
const vencido = p => new Date(p.fin) < hoy() && new Date(p.fin).toDateString() !== hoy().toDateString();
const pendientes = p => p.lineas.filter(l => !l.devuelto);
const estadoPrestamo = p => !pendientes(p).length ? '<span class="badge b-info">Devuelto</span>'
  : vencido(p) ? '<span class="badge b-danger">Devolución con retraso</span>'
  : new Date(p.fin).toDateString() === hoy().toDateString() ? '<span class="badge b-warn">Devolver hoy</span>' : '<span class="badge b-ok">En curso</span>';
// Personas que esperan algún artículo de este préstamo (solicitudes pendientes o citadas de otras personas)
const esperando = p => pendientes(p).map(l => ({ l, rs: reservasDe(articulo(l.id)).filter(r => r.usuario !== p.usuario) })).filter(x => x.rs.length);
function avisoEspera(p) {
  const es = esperando(p); if (!es.length) return '';
  const n = new Set(es.flatMap(x => x.rs.map(r => r.usuario))).size;
  return `<div class="small" style="color:var(--violet);font-weight:600">${n === 1 ? 'Hay 1 persona esperando' : `Hay ${n} personas esperando`}: ${es.map(x => `${esc(x.l.desc || x.l.id)} (${x.rs.map(r => esc(r.usuario) + ' desde el ' + fmt(r.desde)).join('; ')})`).join(' · ')}${vencido(p) ? '. <b>Contacta con el alumno para que lo devuelva cuanto antes.</b>' : ''}</div>`;
}
// Cada préstamo enseña los artículos que faltan por devolver, para no tener que abrirlo, y si alguien los espera
const liPrestamo = p => `<a class="li" style="align-items:flex-start" href="#prestamo/${encodeURIComponent(p.id)}"><div class="avatar soft">${initials(p.usuario)}</div>
  <div class="grow stack" style="gap:4px"><div class="row wrap" style="gap:6px;justify-content:space-between"><div class="title">${esc(p.usuario)}</div><span class="row wrap" style="gap:4px">${estadoPrestamo(p)}${esperando(p).length ? '<span class="badge b-violet">Con cola</span>' : ''}</span></div>
    <div class="small muted">${esc(p.asignatura)} · hasta el ${fmt(p.fin)}${pendientes(p).length < p.lineas.length ? ` · ${p.lineas.length - pendientes(p).length} de ${p.lineas.length} devueltos` : ''}</div>
    <div class="small">${pendientes(p).map(l => `<div>· ${esc(l.desc || l.id)} <span class="muted">${esc(l.id)}</span></div>`).join('')}</div>${avisoEspera(p)}</div></a>`;
const thumbArt = a => `<div class="thumb ph azulejo" ${a && a.foto ? `data-foto="${esc(a.id)}"` : ''} style="aspect-ratio:auto"></div>`;
const cargando = esqueleto(3);

async function refrescarCatalogo() {
  try { await revalidarCatalogo(true); } catch (e) { toast(e.message); }
}
// El catálogo de este dispositivo puede estar desfasado: antes de rechazar un artículo, se comprueba con el servidor
async function articuloAlDia(a, valido) {
  if (valido(a)) return a;
  await refrescarCatalogo();
  return articulo(a.id) || a;
}

// ---------- Inicio ----------
function vInicio() {
  // Una sola petición para todo, y lo recibido sirve también para abrir al instante Solicitudes, Préstamos e Incidencias
  alMontar = () => datosAlDia('inicio', async () => {
    const r = await apiVarias([['prestamos'], ['solicitudes'], ['incidencias']]);
    ['prestamos', 'solicitudes', 'incidencias'].forEach((k, i) => guardarDatos(k, r[i]));
    return r;
  }, ([ps, sols, incs]) => {
      op.prestamos = ps; gs.lista = sols;
      const retraso = ps.filter(vencido).sort((a, b) => esperando(b).length - esperando(a).length);
      const pend = sols.filter(s => s.estado === 'Pendiente');
      const citas = sols.filter(s => s.estado === 'Citada').sort((a, b) => String(a.cita).localeCompare(String(b.cita)));
      const respuestas = citas.filter(necesitaAtencion), sinAcudir = citas.filter(citaVencida);
      const citasHoy = citas.filter(s => new Date(s.cita).toDateString() === hoy().toDateString());
      const abiertas = incs.filter(i => i.estado === 'Abierta');
      const venceHoy = ps.filter(p => !vencido(p) && new Date(p.fin).toDateString() === hoy().toDateString());
      $('#statPend').textContent = pend.length;
      $('#statCitas').textContent = citasHoy.length;
      $('#statActivos').textContent = ps.length;
      $('#statRetraso').textContent = retraso.length;
      const seccion = (titulo, html, enlace) => html ? `<div class="row"><h2 class="grow">${titulo}</h2>${enlace ? `<a class="small" href="${enlace}" style="color:var(--primary)">Ver todo</a>` : ''}</div><div class="list">${html}</div>` : '';
      const liSol = s => `<a class="li" href="#solicitudes" onclick="gs.tab='${s.estado}'"><div class="avatar soft">${initials(s.usuario)}</div>
        <div class="grow"><div class="title">${esc(s.usuario)}</div><div class="small muted">${s.estado === 'Citada' ? (s.respuestaCita === 'Propuesta' ? 'Propone: ' + fmtCita(s.citaPropuesta) : fmtCita(s.cita)) : `${nArt(s.articulos.length)} · ${fmt(s.desde)}–${fmt(s.hasta)}`}</div></div>${s.estado === 'Citada' ? badgeCita(s) : ESTADO_SOL[s.estado]}</a>`;
      $('#inicioCont').innerHTML = [
        seccion('Citas a las que no ha acudido el alumno', sinAcudir.map(liSol).join(''), '#solicitudes'),
        seccion('Respuestas a citas por gestionar', respuestas.map(liSol).join(''), '#solicitudes'),
        seccion('Citas próximas', citas.filter(s => !necesitaAtencion(s) && !citaVencida(s)).slice(0, 5).map(liSol).join(''), '#solicitudes'),
        seccion('Solicitudes por revisar', pend.slice(0, 5).map(liSol).join(''), '#solicitudes'),
        seccion('Devoluciones con retraso', retraso.map(liPrestamo).join(''), '#activos'),
        seccion('Se devuelven hoy', venceHoy.map(liPrestamo).join(''), '#activos'),
        abiertas.length ? `<a class="callout warn small" href="#incidencias" style="display:block;text-decoration:none;color:inherit"><b>${abiertas.length} incidencia(s) abierta(s)</b> · Ver incidencias ›</a>` : ''
      ].join('') || '<p class="muted">Todo al día: no hay solicitudes, citas ni retrasos pendientes.</p>';
      observarFotos();
    }).catch(e => errorEn('#inicioCont', e));
  const fecha = hoy().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="stack">
    <div class="hero azulejo"><h1>Hola${state.usuario.nombre ? ', ' + esc(state.usuario.nombre) : ''}</h1><p class="muted" style="margin:4px 0 14px">${esc(fecha[0].toUpperCase() + fecha.slice(1))}</p>
      <div class="two"><a class="btn" href="#prestar" onclick="nuevoPrestamo()">${ICON.send} Prestar</a><a class="btn ghost" style="background:#fff" href="#devolver">${ICON.back} Devolver</a></div></div>
    <div class="stats">
      <a class="stat" href="#solicitudes" onclick="gs.tab='Pendiente'"><b id="statPend" style="color:var(--warn)">…</b><span class="small muted">Solicitudes por revisar</span></a>
      <a class="stat" href="#solicitudes" onclick="gs.tab='Citada'"><b id="statCitas" style="color:var(--violet)">…</b><span class="small muted">Citas hoy</span></a>
      <a class="stat" href="#activos"><b id="statActivos">…</b><span class="small muted">Préstamos activos</span></a>
      <a class="stat" href="#activos" onclick="state.filtroActivos='retraso'"><b id="statRetraso" style="color:var(--danger)">…</b><span class="small muted">Devoluciones con retraso</span></a>
    </div>
    <div class="stack" id="inicioCont">${esqueleto(3)}</div>
  </div>`;
}

// ---------- Prestar ----------
function nuevoPrestamo() { op.alumno = null; op.cesta = []; op.paso = 1; op.asigOtra = false; elegir = null; }
function prestarArticulo(id) { nuevoPrestamo(); op.cesta = [id]; ir('prestar'); }

function vPrestar() {
  const pasos = `<div class="steps">${[1, 2, 3].map(n => `<div class="${n <= op.paso ? 'on' : ''}"></div>`).join('')}</div>`;
  if (op.paso === 1) {
    alMontar = async () => {
      // El QR del perfil del alumno contiene su correo
      Escaner.montar(codigo => {
        const email = codigo.trim().toLowerCase();
        const conocido = (op.usuarios || []).some(u => u.email === email);
        if (!conocido && !esCorreoValido(email)) return toast('Ese código no es el QR de un alumno');
        elegirAlumno((op.usuarios || []).find(u => u.email === email) || { email, nombre: '' });
      }, 'persona');
      if (!op.usuarios) { try { op.usuarios = await api('usuarios'); } catch (e) { toast(e.message); } }
      pintarAlumnos();
    };
    return `<div class="stack"><h1>Nuevo préstamo</h1>${pasos}<h2>1. ¿Para quién?</h2>
      ${op.cesta.length ? `<div class="callout info small">${op.cesta.length} artículo(s) ya preparado(s): ${op.cesta.map(esc).join(', ')}</div>` : ''}
      ${Escaner.html('Escanea el QR del perfil del alumno')}
      <div class="search">${ICON.search}<input id="buscaAlumno" placeholder="Nombre o correo @${esc(C.dominio)}" oninput="pintarAlumnos()" autocomplete="off"></div>
      <div class="list" id="listaAlumnos">${cargando}</div>
      <p class="hint">Si la persona aún no ha entrado nunca en la web, escribe su correo completo.</p></div>`;
  }
  if (op.paso === 2) {
    const modo = modoElegir();
    if (!elegir || elegir.para !== 'prestar') nuevoElegir({ para: 'prestar', tiene: id => op.cesta.includes(id), anadir: anadirACesta, quitar: quitarDeCesta });
    alMontar = () => { if (modo === 'escaner') Escaner.montar(anadirACesta); pintarCesta(); cargarLibres(); };
    return `<div class="stack"><h1>Nuevo préstamo</h1>${pasos}
      <div class="row"><div class="avatar soft">${initials(op.alumno.nombre || op.alumno.email)}</div><div class="grow"><b>${esc(op.alumno.nombre || op.alumno.email)}</b><div class="small muted">${esc(op.alumno.email)}</div></div><button class="chip" onclick="op.paso=1;render()">Cambiar</button></div>
      <h2>2. Añade los artículos</h2>
      <div class="chips">${[['catalogo', 'Elegir del catálogo'], ['escaner', 'Escanear']].map(([k, t]) => `<button class="chip ${modo === k ? 'on' : ''}" onclick="cambiarModoElegir('${k}')">${t}</button>`).join('')}</div>
      ${modo === 'escaner' ? Escaner.html('Escaneo continuo: ve pasando las etiquetas')
        : htmlElegir()}
      <div id="cesta"></div>
      <div class="sticky-bar"><button class="btn block" id="btnContinuar" onclick="op.paso=3;render()">Continuar</button></div></div>`;
  }
  const asig = state.maestros.Asignatura || [];
  return `<div class="stack"><h1>Nuevo préstamo</h1>${pasos}<h2>3. Fechas y motivo</h2>
    <div class="card stack">
      <div><b>${esc(op.alumno.nombre || op.alumno.email)}</b> · ${nArt(op.cesta.length)}</div>
      <div class="two"><div><label class="f">Desde</label><input class="input" type="date" id="pIni" value="${isoDia(new Date())}" onchange="$('#pFin').min=this.value"></div>
        <div><label class="f">Devolución</label><input class="input" type="date" id="pFin" value="${isoDia(sumarDias(new Date(), 7))}" min="${isoDia(new Date())}"></div></div>
      <div class="hint" style="margin:0">Los dos días cuentan enteros. El material vuelve a estar libre al día siguiente de la devolución.</div>
      <div class="chips">${[['Hoy', 0], ['1 semana', 7], ['2 semanas', 14], ['1 mes', 30], ['Fin de curso', 'curso']].map(([t, d]) => `<button class="chip" onclick="plazo('${d}')">${t}</button>`).join('')}</div>
      <div><label class="f">Asignatura o motivo</label>
        <select class="input" id="pAsig" onchange="op.asigOtra=this.value==='__otra';$('#pAsigOtra').style.display=op.asigOtra?'block':'none'">${asig.map(a => `<option>${esc(a)}</option>`).join('')}<option value="__otra">Otra…</option></select>
        <input class="input" id="pAsigOtra" style="margin-top:8px;display:none" placeholder="Nueva asignatura o motivo (se añadirá a la lista)"></div>
      <div><label class="f">Notas</label><textarea class="input" id="pNotas" rows="2"></textarea></div>
    </div>
    <button class="btn block" id="btnPrestar" onclick="confirmarPrestamo()">Confirmar préstamo</button>
    <button class="btn ghost block" onclick="op.paso=2;render()">Atrás</button></div>`;
}

function pintarAlumnos() {
  if (!$('#listaAlumnos')) return; // ya se ha cambiado de pantalla
  const q = ($('#buscaAlumno') || {}).value ? $('#buscaAlumno').value.trim().toLowerCase() : '';
  const lista = (op.usuarios || []).filter(u => !q || (u.nombre + ' ' + u.email).toLowerCase().includes(q)).slice(0, 30);
  const esCorreo = esCorreoValido(q);
  const nuevo = esCorreo && !(op.usuarios || []).some(u => u.email === q)
    ? `<a class="li" href="javascript:void 0" onclick="elegirAlumno({email:'${esc(q)}',nombre:''})"><div class="avatar soft">+</div><div class="grow"><div class="title">${esc(q)}</div><div class="small muted">Nueva persona: se dará de alta como alumno</div></div></a>` : '';
  $('#listaAlumnos').innerHTML = nuevo + lista.map(u => `<a class="li" href="javascript:void 0" onclick='elegirAlumno(${JSON.stringify(u).replace(/'/g, '&#39;')})'>
      <div class="avatar soft">${initials(u.nombre || u.email)}</div><div class="grow"><div class="title">${esc(u.nombre || u.email)}</div><div class="small muted">${esc(u.email)}${u.rol !== 'Alumno' ? ' · ' + esc(u.rol) : ''}</div></div></a>`).join('')
    || (op.usuarios ? '<div class="li muted small">Nadie coincide. Escribe el correo completo para prestar a alguien nuevo.</div>' : cargando);
}
// Correo de la escuela o, solo en pruebas, cualquier correo (el servidor decide si lo admite)
const esCorreoValido = e => C.cuentasExternas ? /^[^@\s]+@[^@\s]+\.[a-z]+$/.test(e) : new RegExp('^[^@\\s]+@' + C.dominio.replace('.', '\\.') + '$').test(e);
function elegirAlumno(u) { op.alumno = u; op.paso = 2; render(); }

// Etiquetas impresas sin asignar: se cargan al abrir el escáner para responder al instante sin ir al servidor.
async function cargarLibres() {
  if (eti.libres) return;
  try { const c = await api('codigos'); eti.libres = c.libres; eti.siguiente = c.siguiente; } catch (e) { /* se consultará al servidor si hace falta */ }
}

// Busca un código: primero en lo que ya hay en el móvil (instantáneo) y, solo si no aparece,
// pregunta al servidor por si otra persona acaba de dar de alta ese artículo.
async function resolverCodigo(codigo) {
  const a = articulo(codigo);
  if (a) return a;
  if (eti.libres && eti.libres.includes(codigo)) { toast(`${codigo} es una etiqueta sin asignar: dale de alta primero`); return null; }
  toast(`Buscando ${codigo}…`);
  try {
    const r = await api('buscarCodigo', { codigo });
    if (r.tipo === 'libre') { toast(`${codigo} es una etiqueta sin asignar: dale de alta primero`); return null; }
    if (r.tipo === 'articulo') { await refrescarCatalogo(); return articulo(codigo); }
  } catch (e) { toast(e.message); return null; }
  toast(`Código ${codigo} desconocido`);
  return null;
}

// Paso 2: elegir del catálogo (lo normal en el PC) o escanear (lo normal en el móvil). Se recuerda la elección.
function modoElegir() {
  try { const m = localStorage.getItem('prestarModo'); if (m) return m; } catch (e) { /* sin almacenamiento */ }
  return matchMedia('(pointer: fine)').matches ? 'catalogo' : 'escaner';
}
function cambiarModoElegir(m) { try { localStorage.setItem('prestarModo', m); } catch (e) { /* sin almacenamiento */ } render(); }

// ---------- Elegir artículos del catálogo ----------
// Buscador con categorías para añadir artículos con un toque. Lo usan Prestar y la edición de solicitudes
// y de préstamos; cada uno dice qué artículos tiene ya (tiene), cómo se añaden y quitan, y cuáles valen.
let elegir = null;
function nuevoElegir(cfg) { elegir = Object.assign({ q: '', cat: null, max: 30, vale: a => a.estado === 'disp' }, cfg); }
const htmlElegir = () => `<form class="search" onsubmit="event.preventDefault();codigoBuscado()">${ICON.search}<input id="qElegir" placeholder="Nombre o código (también con el lector)" value="${esc(elegir.q)}" oninput="elegir.q=this.value;elegir.max=30;pintarElegir()" autocomplete="off"></form>
  <div class="chips" id="elegirCats"></div><div id="elegir"></div>`;
// Se repinta al escribir sin tocar la casilla (el móvil no cierra el teclado)
function pintarElegir() {
  const caja = $('#elegir'); if (!caja || !elegir) return;
  const cats = categorias();
  $('#elegirCats').innerHTML = `<button class="chip ${!elegir.cat ? 'on' : ''}" onclick="elegir.cat=null;elegir.max=30;pintarElegir()">Todas</button>`
    + cats.map((c, i) => `<button class="chip ${elegir.cat === c ? 'on' : ''}" onclick="elegir.cat=categorias()[${i}];elegir.max=30;pintarElegir()">${esc(catLabel(c))}</button>`).join('');
  const q = elegir.q.trim().toLowerCase();
  const orden = { disp: 0, prest: 1, mant: 2 };
  const lista = state.articulos.filter(a => a.estado !== 'baja' && (!elegir.cat || a.cat === elegir.cat) && (!q || (a.desc + ' ' + a.id).toLowerCase().includes(q)))
    .sort((a, b) => (orden[a.estado] ?? 3) - (orden[b.estado] ?? 3) || porNombre(a, b));
  const max = elegir.max, vis = lista.slice(0, max);
  const boton = a => elegir.fijo && elegir.fijo(a.id) ? '<span class="badge b-info">Ya en el préstamo</span>'
    : elegir.tiene(a.id) ? `<button class="chip on" onclick="elegir.quitar('${esc(a.id)}')">✓ Añadido</button>`
    : elegir.vale(a) ? `<button class="chip" onclick="elegir.anadir('${esc(a.id)}')">Añadir</button>` : '';
  const nota = a => a.estado === 'prest' && a.prestamo ? `<div class="small" style="color:var(--warn);font-weight:600">Prestado${a.prestamo.usuario ? ' a ' + esc(a.prestamo.usuario) : ''} hasta el ${fmt(a.prestamo.fin)}</div>`
    : a.estado === 'mant' ? '<div class="small" style="color:var(--danger);font-weight:600">En mantenimiento</div>' : resumenReservas(a);
  caja.innerHTML = `<div class="small muted" style="margin-bottom:8px">${lista.length > max ? `Mostrando ${max} de ${lista.length}: busca o elige una categoría para afinar` : nArt(lista.length)}</div>
    <div class="list">${vis.map(a => `<div class="li">${thumbArt(a)}<div class="grow"><div class="title">${esc(a.desc)}</div><div class="row wrap small" style="gap:6px"><span class="muted">${esc(a.id)}</span>${badge(a)}</div>${nota(a)}</div>${boton(a)}</div>`).join('')
      || '<div class="li muted small">Nada coincide con la búsqueda</div>'}</div>
    ${lista.length > max ? '<button class="btn ghost block" style="margin-top:8px" onclick="elegir.max+=30;pintarElegir()">Ver más</button>' : ''}`;
  observarFotos();
}
// Con el lector de códigos (o escribiendo el código y pulsando Intro) se añade directamente
function codigoBuscado() {
  const q = elegir.q.trim(); if (!q) return;
  const a = articulo(q.toUpperCase()) || articulo(q);
  if (!a && !/^[A-Za-z]*\d+$/.test(q)) return; // es una búsqueda por nombre: la lista ya está filtrada
  elegir.q = ''; $('#qElegir').value = ''; pintarElegir();
  elegir.anadir(a ? a.id : q.toUpperCase());
}
function quitarDeCesta(id) { op.cesta = op.cesta.filter(x => x !== id); pintarCesta(); }

// El artículo de ese código si se puede prestar ahora; si no, avisa y devuelve null
async function articuloLibre(codigo) {
  let a = await resolverCodigo(codigo);
  if (!a) return null;
  a = await articuloAlDia(a, x => x.estado === 'disp');
  if (a.estado === 'prest') { toast(`${a.desc} está prestado${a.prestamo && a.prestamo.usuario ? ' a ' + a.prestamo.usuario : ''}`); return null; }
  if (a.estado !== 'disp') { toast(`${a.desc} no está disponible (mantenimiento o baja)`); return null; }
  return a;
}
async function anadirACesta(codigo) {
  const a = await articuloLibre(codigo);
  if (!a) return;
  if (op.cesta.includes(a.id)) return toast(`${a.desc} ya está en la lista`);
  op.cesta.push(a.id);
  pintarCesta();
}
function pintarCesta() {
  const items = op.cesta.map(articulo).filter(Boolean);
  $('#cesta').innerHTML = `<div class="row" style="margin-bottom:8px"><b>${nArt(items.length)}</b></div>
    <div class="list">${items.map((a, i) => `<div class="li ${i === items.length - 1 ? 'flash' : ''}">${thumbArt(a)}<div class="grow"><div class="title">${esc(a.desc)}</div><div class="small muted">${esc(a.id)}</div></div>
      <button class="chip" onclick="quitarDeCesta('${esc(a.id)}')">Quitar</button></div>`).join('') || '<div class="li muted small">Aún no hay artículos</div>'}</div>`;
  $('#btnContinuar').disabled = !items.length;
  $('#btnContinuar').textContent = items.length ? `Continuar · ${nArt(items.length)}` : 'Continuar';
  pintarElegir();
  observarFotos();
}

// Los préstamos van por días enteros: el inicio cuenta desde las 0:00 y la devolución hasta las 23:59
function sumarDias(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const diaDe = valor => new Date(valor + 'T00:00');
const inicioIso = valor => diaDe(valor).toISOString();
const finIso = valor => new Date(valor + 'T23:59:59').toISOString();
function plazo(d) {
  const ini = $('#pIni').value ? diaDe($('#pIni').value) : new Date();
  const fin = d === 'curso' ? new Date(ini.getMonth() >= 6 ? ini.getFullYear() + 1 : ini.getFullYear(), 5, 30) : sumarDias(ini, Number(d));
  $('#pFin').value = isoDia(fin);
}

async function confirmarPrestamo() {
  const btn = $('#btnPrestar'); btn.disabled = true; btn.textContent = 'Guardando…';
  const otra = op.asigOtra ? $('#pAsigOtra').value.trim() : '';
  try {
    if (op.asigOtra && !otra) throw new Error('Escribe la asignatura o el motivo');
    if (!$('#pIni').value || !$('#pFin').value) throw new Error('Indica el día de inicio y el de devolución');
    if ($('#pFin').value < $('#pIni').value) throw new Error('La devolución no puede ser anterior al inicio');
    const r = await api('prestar', {
      email: op.alumno.email, articulos: op.cesta,
      inicio: inicioIso($('#pIni').value), fin: finIso($('#pFin').value),
      asignatura: otra || $('#pAsig').value, asignaturaNueva: !!otra, notas: $('#pNotas').value
    });
    if (otra) (state.maestros.Asignatura = state.maestros.Asignatura || []).push(otra);
    toast(`Préstamo ${r.id} registrado`);
    nuevoPrestamo(); op.usuarios = null;
    await refrescarCatalogo();
    ir('inicio');
  } catch (e) {
    if (e.codigo === 409) {
      // Algún artículo se prestó o cambió mientras tanto: se quita de la lista y se vuelve al paso 2
      const fuera = op.cesta.filter(id => { const a = articulo(id); return !a || a.estado !== 'disp'; });
      op.cesta = op.cesta.filter(id => !fuera.includes(id));
      op.paso = 2; render();
      toast(`Ya no están disponibles: ${fuera.join(', ')}. Los he quitado de la lista.`);
      return;
    }
    toast(e.message); btn.disabled = false; btn.textContent = 'Confirmar préstamo';
  }
}

// ---------- Devolver ----------
function vDevolver() {
  alMontar = async () => {
    Escaner.montar(anadirDevolucion);
    pintarDevoluciones();
    cargarLibres();
    datosAlDia('prestamos', () => api('prestamos'), ps => { op.prestamos = ps; $('#devPrestamos').innerHTML = ps.map(liPrestamo).join('') || '<div class="li muted small">No hay préstamos activos</div>'; })
      .catch(e => errorEn('#devPrestamos', e));
  };
  return `<div class="stack"><h1>Devolver</h1>
    ${Escaner.html('Escanea cada artículo que vuelve')}
    <div id="devLista"></div>
    <h2>O elige un préstamo</h2><div class="list" id="devPrestamos">${cargando}</div></div>`;
}
async function anadirDevolucion(codigo) {
  let a = await resolverCodigo(codigo);
  if (!a) return;
  a = await articuloAlDia(a, x => x.estado === 'prest');
  if (a.estado !== 'prest') return toast(`${a.desc} no figura como prestado`);
  if (op.devueltos.includes(a.id)) return toast(`${a.desc} ya está en la lista`);
  op.devueltos.push(a.id);
  pintarDevoluciones();
}
function pintarDevoluciones() {
  const items = op.devueltos.map(articulo).filter(Boolean);
  $('#devLista').innerHTML = !items.length ? '<p class="hint">Escanea un artículo o escribe su código para registrar su devolución.</p>' : `
    <div class="list">${items.map((a, i) => `<div class="li ${i === items.length - 1 ? 'flash' : ''}" style="flex-wrap:wrap">${thumbArt(a)}
      <div class="grow"><div class="title">${esc(a.desc)}</div><div class="small muted">${esc(a.id)} · ${esc(a.prestamo ? a.prestamo.usuario : '')}</div></div>
      <button class="chip" onclick="op.devueltos=op.devueltos.filter(x=>x!=='${esc(a.id)}');delete op.danos['${esc(a.id)}'];pintarDevoluciones()">Quitar</button>
      <label class="row small" style="width:100%"><input type="checkbox" ${op.danos[a.id] != null ? 'checked' : ''} onchange="marcarDano('${esc(a.id)}', this.checked)"> Vuelve con daños</label>
      ${op.danos[a.id] != null ? `<textarea class="input" rows="2" style="width:100%" placeholder="Describe el daño" oninput="op.danos['${esc(a.id)}']=this.value">${esc(op.danos[a.id])}</textarea>` : ''}
    </div>`).join('')}</div>
    <button class="btn block" style="margin-top:12px" id="btnDevolver" onclick="registrarDevoluciones()">Registrar ${items.length} devolución(es)</button>`;
  observarFotos();
}
function marcarDano(id, si) { if (si) op.danos[id] = op.danos[id] || ''; else delete op.danos[id]; pintarDevoluciones(); }
async function registrarDevoluciones(prestamo) {
  const btn = $('#btnDevolver'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const danos = {};
    Object.keys(op.danos).forEach(id => { danos[id] = op.danos[id].trim() || 'Daño sin describir'; });
    const r = await api('devolver', prestamo ? { prestamo } : { articulos: op.devueltos, danos });
    toast(`${r.devueltos.length} artículo(s) devuelto(s)${r.incidencias ? ` · ${r.incidencias} incidencia(s) abierta(s)` : ''}`);
    op.devueltos = []; op.danos = {};
    await refrescarCatalogo();
    render();
  } catch (e) { fallo(e); if (btn && e.codigo !== 409) { btn.disabled = false; btn.textContent = 'Registrar devolución'; } }
}

// ---------- Préstamos ----------
function vActivos() {
  alMontar = () => datosAlDia('prestamos', () => api('prestamos'), ps => {
      op.prestamos = ps;
      const filtro = state.filtroActivos || 'todos';
      const lista = filtro === 'retraso' ? ps.filter(vencido) : ps;
      $('#activosChips').innerHTML = [['todos', `Todos · ${ps.length}`], ['retraso', `Devolución con retraso · ${ps.filter(vencido).length}`]]
        .map(([k, t]) => `<button class="chip ${filtro === k ? 'on' : ''}" onclick="state.filtroActivos='${k}';render()">${t}</button>`).join('');
      $('#activosLista').innerHTML = lista.map(liPrestamo).join('') || '<div class="li muted small">No hay préstamos</div>';
    }).catch(e => errorEn('#activosLista', e));
  return `<div class="stack"><h1>Préstamos activos</h1><div class="chips" id="activosChips"></div><div class="list" id="activosLista">${cargando}</div></div>`;
}

// Edición de un préstamo vigente: asignatura, fechas, notas y artículos nuevos (los valores se guardan
// en `pe` al cambiarlos, para no perderlos si llegan datos nuevos y se repinta)
let pe = null;
function vPrestamo(id) {
  if (pe && pe.id !== id) pe = null;
  alMontar = () => datosAlDia('prestamo:' + id, () => api('prestamos', { id }), ([p]) => {
      if (!p) { $('#detPrestamo').innerHTML = '<p>No se encuentra el préstamo.</p>'; return; }
      if (pe) { pe.p = p; return pintarEdicionPrestamo(); }
      $('#detPrestamo').innerHTML = `
        <div class="row"><h1>Préstamo</h1><span class="spacer"></span>${estadoPrestamo(p)}</div>
        <div class="card stack small">
          <div class="row"><div class="avatar soft">${initials(p.usuario)}</div><div><b>${esc(p.usuario)}</b><div class="muted">${esc(p.email)}</div></div></div>
          <div class="two"><div><div class="muted">Desde</div><b>${fmt(p.inicio)}</b></div><div><div class="muted">Hasta</div><b>${fmt(p.fin)}</b></div></div>
          <div><div class="muted">Asignatura o motivo</div><b>${esc(p.asignatura)}</b></div>
          ${p.notas ? `<div><div class="muted">Notas</div>${esc(p.notas)}</div>` : ''}
          <div class="muted">Registrado por ${esc(p.docente)} · ${esc(p.id)}</div>
          ${pendientes(p).length ? `<button class="btn ghost sm" style="justify-self:start" onclick='editarPrestamo(${JSON.stringify(p).replace(/'/g, '&#39;')})'>✎ Editar: asignatura, fechas o añadir artículos</button>` : ''}
        </div>
        <div class="list">${p.lineas.map(l => { const a = articulo(l.id); return `<div class="li">${thumbArt(a)}<div class="grow"><div class="title">${esc(l.desc)}</div><div class="small muted">${esc(l.id)}${l.devuelto ? ' · devuelto el ' + fmt(l.devuelto) + (l.estado === 'Con daños' ? ' (con daños)' : '') : ''}</div></div>
          ${l.devuelto ? '<span class="badge b-info">Devuelto</span>' : `<button class="chip" onclick="devolverUno('${esc(l.id)}')">Devolver</button>`}</div>`; }).join('')}</div>
        ${pendientes(p).length ? `<button class="btn block" id="btnDevolver" onclick="registrarDevoluciones('${esc(p.id)}')">Devolver todo</button>` : ''}`;
      observarFotos();
    }).catch(e => errorEn('#detPrestamo', e));
  return `<div class="stack"><a href="#activos" class="small" style="color:var(--primary);text-decoration:none">← Préstamos activos</a><div class="stack" id="detPrestamo">${esqueleto(3)}</div></div>`;
}
function editarPrestamo(p) {
  const asig = state.maestros.Asignatura || [];
  pe = { id: p.id, p, ini: isoDia(new Date(p.inicio)), fin: isoDia(new Date(p.fin)), notas: p.notas || '', nuevos: [],
    asig: asig.includes(p.asignatura) ? p.asignatura : '__actual', otra: '' };
  nuevoElegir({ para: 'prestamo', fijo: id => pendientes(pe.p).some(l => l.id === id), tiene: id => pe.nuevos.includes(id) || pendientes(pe.p).some(l => l.id === id), anadir: anadirAlPrestamo, quitar: id => { pe.nuevos = pe.nuevos.filter(x => x !== id); pintarNuevos(); pintarElegir(); } });
  pintarEdicionPrestamo();
}
function pintarEdicionPrestamo() {
  const p = pe.p, asig = state.maestros.Asignatura || [];
  $('#detPrestamo').innerHTML = `<div class="row"><h1>Editar préstamo</h1><span class="spacer"></span>${estadoPrestamo(p)}</div>
    <div class="card stack small" id="peForm">
      <div class="row"><div class="avatar soft">${initials(p.usuario)}</div><div><b>${esc(p.usuario)}</b><div class="muted">${esc(p.email)} · ${esc(p.id)}</div></div></div>
      <div><label class="f">Asignatura o motivo</label>
        <select class="input" id="peAsig" onchange="pe.asig=this.value;$('#peOtra').style.display=pe.asig==='__otra'?'block':'none'">
          ${asig.includes(p.asignatura) ? '' : `<option value="__actual" ${pe.asig === '__actual' ? 'selected' : ''}>${esc(p.asignatura)} (actual)</option>`}
          ${asig.map(a => `<option ${pe.asig === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}<option value="__otra" ${pe.asig === '__otra' ? 'selected' : ''}>Otra…</option></select>
        <input class="input" id="peOtra" style="margin-top:8px;display:${pe.asig === '__otra' ? 'block' : 'none'}" placeholder="Nueva asignatura o motivo (se añadirá a la lista)" value="${esc(pe.otra)}" oninput="pe.otra=this.value"></div>
      <div class="two"><div><label class="f">Desde</label><input class="input" type="date" id="peIni" value="${pe.ini}" onchange="pe.ini=this.value;$('#peFin').min=this.value"></div>
        <div><label class="f">Devolución</label><input class="input" type="date" id="peFin" value="${pe.fin}" min="${pe.ini}" onchange="pe.fin=this.value"></div></div>
      <div class="chips">${[['+1 semana', 7], ['+2 semanas', 14], ['Fin de curso', 'curso']].map(([t, d]) => `<button class="chip" onclick="alargarPrestamo('${d}')">${t}</button>`).join('')}</div>
      <div class="hint" style="margin:0">Los días cuentan enteros. Al alargar la devolución no puede solaparse con una cita dada a otra persona.</div>
      <div><label class="f">Notas</label><textarea class="input" id="peNotas" rows="2" oninput="pe.notas=this.value">${esc(pe.notas)}</textarea></div>
    </div>
    <h2>Artículos</h2>
    <div class="list">${pendientes(p).map(l => `<div class="li">${thumbArt(articulo(l.id))}<div class="grow"><div class="title">${esc(l.desc || l.id)}</div><div class="small muted">${esc(l.id)} · en préstamo</div></div></div>`).join('')}</div>
    <div id="peNuevos"></div>
    <h2>Añadir artículos</h2>
    ${htmlElegir()}
    <div class="sticky-bar"><div class="two"><button class="btn" id="btnGuardarPe" onclick="guardarPrestamo()">Guardar cambios</button><button class="btn ghost" style="background:#fff" onclick="pe=null;render()">Cancelar</button></div></div>`;
  pintarNuevos(); pintarElegir();
}
function alargarPrestamo(d) {
  const fin = d === 'curso' ? (() => { const h = new Date(); return new Date(h.getMonth() >= 6 ? h.getFullYear() + 1 : h.getFullYear(), 5, 30); })() : sumarDias(diaDe(pe.fin), Number(d));
  pe.fin = isoDia(fin); $('#peFin').value = pe.fin;
}
function pintarNuevos() {
  const caja = $('#peNuevos'); if (!caja) return;
  caja.innerHTML = pe.nuevos.length ? `<div class="small" style="margin:4px 0 6px;font-weight:600;color:var(--ok)">Se añadirán al guardar:</div><div class="list">${pe.nuevos.map(articulo).filter(Boolean).map(a => `<div class="li flash">${thumbArt(a)}<div class="grow"><div class="title">${esc(a.desc)}</div><div class="small muted">${esc(a.id)}</div></div>
      <button class="chip" onclick="elegir.quitar('${esc(a.id)}')">Quitar</button></div>`).join('')}</div>` : '';
  observarFotos();
}
async function anadirAlPrestamo(codigo) {
  const a = await articuloLibre(codigo); if (!a) return;
  if (elegir.tiene(a.id)) return toast(`${a.desc} ya está en el préstamo`);
  pe.nuevos.push(a.id); pintarNuevos(); pintarElegir();
}
async function guardarPrestamo() {
  const btn = $('#btnGuardarPe');
  const otra = pe.asig === '__otra' ? pe.otra.trim() : '';
  if (pe.asig === '__otra' && !otra) return toast('Escribe la asignatura o el motivo');
  if (!pe.ini || !pe.fin) return toast('Indica el día de inicio y el de devolución');
  if (pe.fin < pe.ini) return toast('La devolución no puede ser anterior al inicio');
  const asignatura = otra || (pe.asig === '__actual' ? pe.p.asignatura : pe.asig);
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const r = await api('editarPrestamo', { id: pe.id, asignatura, asignaturaNueva: !!otra, inicio: inicioIso(pe.ini), fin: finIso(pe.fin), notas: pe.notas, anadir: pe.nuevos });
    if (otra) (state.maestros.Asignatura = state.maestros.Asignatura || []).push(otra);
    toast(r.anadidos.length ? `Préstamo actualizado: ${nArt(r.anadidos.length)} añadido(s). Alumno avisado.` : 'Préstamo actualizado');
    pe = null; elegir = null; cacheDatos.clear();
    await refrescarCatalogo(); render();
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Guardar cambios';
    if (e.codigo === 409) { await refrescarCatalogo(); pe.nuevos = pe.nuevos.filter(id => { const a = articulo(id); return a && a.estado === 'disp'; }); pintarNuevos(); pintarElegir(); }
    fallo(e);
  }
}
async function devolverUno(id) {
  try { await api('devolver', { articulos: [id] }); toast('Devuelto'); await refrescarCatalogo(); render(); } catch (e) { fallo(e); }
}

// ---------- Más ----------
function vMas() {
  const opciones = [['activos', 'Préstamos activos', 'En curso y con la devolución atrasada', 'box'], ['alta', 'Alta y edición de artículos', 'Nuevos artículos. Para editar uno, escanéalo aquí o ábrelo en el catálogo', 'plus'], ['etiquetas', 'Etiquetas', 'Generar e imprimir códigos de barras', 'tag'],
    ['solicitudes', 'Solicitudes', 'Aprobar, citar o rechazar', 'list'], ['incidencias', 'Incidencias', 'Daños y mantenimiento', 'more'], ['listas', 'Listas', 'Categorías, asignaturas, especialidades y cursos', 'list'],
    ['usuarios', 'Usuarios y roles', 'Alumnado (especialidad y curso), docentes y administradores', 'user'], ['ayuda', 'Ayuda', 'Cómo funciona la aplicación, para el profesorado y para el alumnado', 'list'], ['perfil', 'Perfil', state.usuario.email, 'user']];
  return `<div class="stack"><h1>Más opciones</h1><div class="list">${opciones.map(([h, t, d, i]) => `<a class="li" href="#${h}"><div class="thumb" style="display:grid;place-items:center;background:var(--primary-soft);color:var(--primary)">${ICON[i] || ''}</div><div class="grow"><div class="title">${t}</div><div class="small muted">${esc(d)}</div></div></a>`).join('')}</div></div>`;
}
ICON.plus = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>';
ICON.tag = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12V4a1 1 0 011-1h8l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.5"/></svg>';
ICON.cam = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
ICON.print = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>';

// ---------- Alta de artículo ----------
function vAlta() {
  alMontar = async () => {
    Escaner.montar(codigo => {
      // Si la etiqueta ya es de un artículo, se abre su edición (para cambiarle la foto o los datos)
      if (articulo(codigo)) { toast(`${codigo} ya existe: abro su edición`); return ir('editar/' + encodeURIComponent(codigo)); }
      op.altaCodigo = codigo; $('#aCodigo').value = codigo; $('#aDesc').focus();
    });
    if (!op.altaCodigo) {
      try { const c = await api('codigos'); eti.libres = c.libres; eti.siguiente = c.siguiente; if (!$('#aCodigo').value && c.libres.length) $('#aCodigo').value = c.libres[0]; pintarPistaCodigo(); }
      catch (e) { toast(e.message); }
    }
  };
  const cats = categorias();
  return `<div class="stack"><h1>Alta de artículo</h1>
    <div class="callout info small">Pega una etiqueta de la hoja impresa en el artículo y escanéala: el código se rellena solo. Si escaneas un artículo que ya existe, se abre su edición.</div>
    <div class="hint">Para cambiar la foto o los datos de un artículo ya dado de alta: ábrelo en el <a href="#catalogo">Catálogo</a> y pulsa «Editar foto y datos».</div>
    ${Escaner.html('Escanea la etiqueta pegada en el artículo')}
    <div class="foto-alta azulejo" id="aFotoCaja">${op.altaFoto ? `<img src="${op.altaFoto}" alt="">` : ''}
      ${botonFoto(op.altaFoto ? 'Repetir foto' : 'Hacer foto', 'alta', 'tomarFoto')}</div>
    <div class="card stack">
      <div><label class="f">Código</label><input class="input" id="aCodigo" value="${esc(op.altaCodigo)}" autocapitalize="characters" oninput="op.altaCodigo=this.value.trim().toUpperCase();pintarPistaCodigo()"><div class="hint" id="aPista"></div></div>
      <div><label class="f">Descripción</label><input class="input" id="aDesc" placeholder="Ej.: Lámpara de pie dorada"></div>
      <div><label class="f">Categoría</label>
        <select class="input" id="aCat" onchange="op.nuevaCat=this.value==='__nueva';$('#aCatNueva').style.display=op.nuevaCat?'block':'none'">${cats.map(c => `<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('')}<option value="__nueva">+ Nueva categoría…</option></select>
        <input class="input" id="aCatNueva" style="margin-top:8px;display:none" placeholder="Nombre de la nueva categoría"></div>
      <div><label class="f">Ubicación</label><input class="input" id="aUbic" placeholder="Estante B3"></div>
      <div><label class="f">Observaciones</label><textarea class="input" id="aObs" rows="2"></textarea></div>
    </div>
    <div class="two"><button class="btn" id="btnAlta" onclick="guardarAlta(false)">Guardar</button><button class="btn ghost" onclick="guardarAlta(true)">Guardar y siguiente</button></div></div>`;
}
function pintarPistaCodigo() {
  const c = ($('#aCodigo') || {}).value; const el = $('#aPista'); if (!el) return;
  el.textContent = !c ? '' : articulo(c) ? '⚠ Ya existe un artículo con este código.'
    : eti.libres && eti.libres.includes(c) ? 'Etiqueta impresa pendiente de asignar.' : 'Código nuevo (también vale el EAN del fabricante).';
}
// Lee la foto de la cámara o la galería, reducida a 1600 px, y la muestra en la caja indicada
async function leerFoto(input, caja) {
  if (!input.files.length) return null;
  try { return mostrarFoto(reducirFoto(await createImageBitmap(input.files[0])), caja); }
  catch (e) { toast('No se pudo leer la foto'); return null; }
}
function reducirFoto(img) {
  const w = img.videoWidth || img.width, h = img.videoHeight || img.height, k = Math.min(1, 1600 / Math.max(w, h));
  const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.85);
}
function mostrarFoto(url, caja) {
  $(caja).querySelectorAll('img').forEach(i => i.remove());
  const img = new Image(); img.src = url; $(caja).prepend(img);
  return url;
}
async function tomarFoto(input) { const url = await leerFoto(input, '#aFotoCaja'); if (url) op.altaFoto = url; }

// ---------- Hacer la foto con la cámara ----------
// En el móvil, el botón abre la cámara del sistema (input con capture). En el ordenador (p. ej. la Surface)
// el navegador ignora capture y abriría el explorador de archivos: allí se hace la foto dentro de la web.
const camaraDelSistema = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const DESTINO_FOTO = {
  alta: url => { op.altaFoto = mostrarFoto(url, '#aFotoCaja'); },
  edicion: url => { ed.foto = mostrarFoto(url, '#fotoGrande'); ed.quitar = false; $('#fotoGrande').removeAttribute('data-foto'); }
};
function botonFoto(texto, destino, alElegir) {
  return camaraDelSistema
    ? `<label class="btn">${ICON.cam} ${texto}<input type="file" accept="image/*" capture="environment" hidden onchange="${alElegir}(this)"></label>`
    : `<button class="btn" type="button" onclick="abrirCamaraFoto('${destino}')">${ICON.cam} ${texto}</button>`;
}
const camFoto = { flujo: null, destino: null };
async function abrirCamaraFoto(destino, deviceId) {
  Escaner.parar(); // una cámara no se puede abrir dos veces a la vez
  cerrarCamaraFoto(false);
  camFoto.destino = destino;
  const capa = document.createElement('div'); capa.id = 'camFoto'; capa.className = 'cam-foto';
  capa.innerHTML = `<video playsinline muted autoplay></video><div class="cam-foto-info small" id="camFotoInfo">Abriendo la cámara…</div>
    <div class="cam-foto-botones"><button class="btn" id="camFotoDisparo" disabled onclick="dispararFoto()">${ICON.cam} Hacer foto</button>
      <button class="btn ghost" id="camFotoOtra" hidden onclick="otraCamaraFoto()">Otra cámara</button>
      <label class="btn ghost">Elegir archivo<input type="file" accept="image/*" hidden onchange="archivoCamaraFoto(this)"></label>
      <button class="btn ghost" onclick="cerrarCamaraFoto()">Cancelar</button></div>`;
  document.body.appendChild(capa);
  try {
    const guardada = deviceId || localStorage.getItem('camaraFotoId');
    const pedir = id => navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1920 }, height: { ideal: 1080 } } });
    let flujo;
    try { flujo = await pedir(guardada); } catch (e) { if (!guardada || e.name === 'NotAllowedError') throw e; flujo = await pedir(null); }
    // En la Surface se abre la frontal aunque se pida la trasera: si se sabe cuál es la trasera, se cambia
    const camaras = await camarasDisponibles(), actual = flujo.getVideoTracks()[0].getSettings().deviceId;
    if (!guardada && camaras.some(esTrasera) && !camaras.some(c => esTrasera(c) && c.deviceId === actual)) {
      detener(flujo); flujo = await pedir(camaras.find(esTrasera).deviceId);
    }
    if (!document.body.contains(capa)) { detener(flujo); return; }
    camFoto.flujo = flujo; camFoto.camaras = camaras;
    const video = capa.querySelector('video'); video.srcObject = flujo; await video.play();
    const id = flujo.getVideoTracks()[0].getSettings().deviceId, i = Math.max(0, camaras.findIndex(c => c.deviceId === id));
    $('#camFotoInfo').textContent = camaras.length > 1 ? `Cámara ${i + 1}/${camaras.length}` : '';
    $('#camFotoOtra').hidden = camaras.length < 2;
    $('#camFotoDisparo').disabled = false;
  } catch (e) {
    const info = $('#camFotoInfo'); if (info) info.textContent = 'No se puede usar la cámara: ' + mensajeCamara(e) + '. Puedes elegir un archivo.';
  }
}
function otraCamaraFoto() {
  const cs = camFoto.camaras || []; if (cs.length < 2) return;
  const actual = camFoto.flujo && camFoto.flujo.getVideoTracks()[0].getSettings().deviceId;
  const sig = cs[(Math.max(0, cs.findIndex(c => c.deviceId === actual)) + 1) % cs.length];
  try { localStorage.setItem('camaraFotoId', sig.deviceId); } catch (e) { /* sin almacenamiento */ }
  abrirCamaraFoto(camFoto.destino, sig.deviceId);
}
function dispararFoto() {
  const video = $('#camFoto video'); if (!video || !video.videoWidth) return;
  const url = reducirFoto(video), destino = camFoto.destino;
  pitido(); cerrarCamaraFoto(); DESTINO_FOTO[destino](url);
}
async function archivoCamaraFoto(input) {
  if (!input.files.length) return;
  try { const url = reducirFoto(await createImageBitmap(input.files[0])), destino = camFoto.destino; cerrarCamaraFoto(); DESTINO_FOTO[destino](url); }
  catch (e) { toast('No se pudo leer la foto'); }
}
function cerrarCamaraFoto(volverEscaner = true) {
  if (camFoto.flujo) { detener(camFoto.flujo); camFoto.flujo = null; }
  const capa = $('#camFoto'); if (capa) capa.remove();
  // En Alta, el escáner de etiquetas vuelve a encenderse si la persona lo tenía activado
  if (volverEscaner && document.getElementById('camara')) { try { if (localStorage.getItem('camara') === 'si') Escaner.encender(); } catch (e) { /* sin almacenamiento */ } }
}
window.addEventListener('hashchange', () => cerrarCamaraFoto(false));
async function guardarAlta(seguir) {
  const id = $('#aCodigo').value.trim().toUpperCase();
  const cat = op.nuevaCat ? $('#aCatNueva').value.trim().toUpperCase() : $('#aCat').value;
  const btn = $('#btnAlta'); btn.disabled = true;
  try {
    if (!op.altaFoto && !confirm('¿Guardar sin foto?')) { btn.disabled = false; return; }
    await api('altaArticulo', { id, desc: $('#aDesc').value, cat, ubicacion: $('#aUbic').value, observaciones: $('#aObs').value, foto: op.altaFoto });
    if (op.nuevaCat && cat) state.maestros.Categoria.push(cat);
    toast(`${id} dado de alta`);
    const foto = op.altaFoto;
    op.altaCodigo = ''; op.altaFoto = ''; op.nuevaCat = false; eti.libres = null;
    await refrescarCatalogo();
    const a = articulo(id); if (a && a.foto && foto) await fotoLocal(a.foto, foto);
    if (seguir) render(); else ir('articulo/' + encodeURIComponent(id));
  } catch (e) { fallo(e); btn.disabled = false; }
}

// ---------- Editar artículo ----------
// El código no se puede cambiar (está impreso en la etiqueta). La foto se puede sustituir o quitar.
const ed = { id: null, foto: '', quitar: false, nuevaCat: false };
function vEditar(id) {
  const a = articulo(id);
  if (!a) return '<p>No se encuentra el artículo.</p>';
  if (ed.id !== id) Object.assign(ed, { id, foto: '', quitar: false, nuevaCat: false });
  const cats = categorias();
  const conFoto = !ed.quitar && (ed.foto || a.foto);
  alMontar = () => { if (!ed.foto && !ed.quitar && a.foto) cargarFotoGrande(id); };
  return `<div class="stack">
    <a href="#articulo/${encodeURIComponent(id)}" class="small" style="color:var(--primary);text-decoration:none">← ${esc(a.desc)}</a>
    <h1>Editar artículo</h1>
    <div class="foto-alta azulejo" id="fotoGrande" ${!ed.foto && !ed.quitar && a.foto ? `data-foto="${esc(id)}"` : ''}>${ed.foto ? `<img src="${ed.foto}" alt="">` : ''}
      <div class="row" style="position:relative;z-index:1;gap:8px">
        ${botonFoto(conFoto ? 'Cambiar foto' : 'Hacer foto', 'edicion', 'fotoEdicion')}
        <label class="btn ghost" style="background:#fff">Galería<input type="file" accept="image/*" hidden onchange="fotoEdicion(this)"></label>
        ${conFoto ? '<button class="btn ghost" style="background:#fff" onclick="ed.foto=\'\';ed.quitar=true;render()">Quitar</button>' : ''}
      </div></div>
    ${ed.quitar ? '<div class="hint">El artículo se quedará sin foto al guardar. La foto anterior no se borra de Drive.</div>' : ''}
    <div class="card stack">
      <div><label class="f">Código</label><div class="input" style="background:var(--bg)">${esc(id)}</div><div class="hint">El código no se cambia: está impreso en la etiqueta.</div></div>
      <div><label class="f">Descripción</label><input class="input" id="eDesc" value="${esc(a.desc)}"></div>
      <div><label class="f">Categoría</label>
        <select class="input" id="eCat" onchange="ed.nuevaCat=this.value==='__nueva';$('#eCatNueva').style.display=ed.nuevaCat?'block':'none'">${cats.map(c => `<option value="${esc(c)}" ${c === a.cat ? 'selected' : ''}>${esc(catLabel(c))}</option>`).join('')}<option value="__nueva">+ Nueva categoría…</option></select>
        <input class="input" id="eCatNueva" style="margin-top:8px;display:none" placeholder="Nombre de la nueva categoría"></div>
      <div><label class="f">Ubicación</label><input class="input" id="eUbic" value="${esc(a.ubicacion || '')}" placeholder="Estante B3"></div>
      <div><label class="f">Observaciones</label><textarea class="input" id="eObs" rows="2">${esc(a.observaciones || '')}</textarea></div>
    </div>
    <div class="two"><button class="btn" id="btnEditar" onclick="guardarEdicion()">Guardar cambios</button><a class="btn ghost" href="#articulo/${encodeURIComponent(id)}" onclick="ed.id=null">Cancelar</a></div></div>`;
}
async function fotoEdicion(input) {
  const url = await leerFoto(input, '#fotoGrande');
  if (url) { ed.foto = url; ed.quitar = false; $('#fotoGrande').removeAttribute('data-foto'); }
}
async function guardarEdicion() {
  const a = articulo(ed.id);
  const cat = ed.nuevaCat ? $('#eCatNueva').value.trim().toUpperCase() : $('#eCat').value;
  const btn = $('#btnEditar'); btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const r = await api('editarArticulo', { id: a.id, desc: $('#eDesc').value, cat, ubicacion: $('#eUbic').value, observaciones: $('#eObs').value, foto: ed.foto, quitarFoto: ed.quitar });
    if (ed.nuevaCat && cat) state.maestros.Categoria.push(cat);
    if (ed.foto && r.foto) await fotoLocal(r.foto, ed.foto);
    const id = ed.id; ed.id = null;
    await refrescarCatalogo();
    toast('Cambios guardados');
    ir('articulo/' + encodeURIComponent(id));
  } catch (e) { fallo(e); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
}

// ---------- Etiquetas ----------
function codigosEtiquetas() {
  if (eti.modo === 'nuevos') {
    if (eti.siguiente == null) return [];
    const n = eti.hojas * POR_HOJA - (eti.inicio - 1);
    return Array.from({ length: n }, (_, i) => 'ART' + String(eti.siguiente + i).padStart(3, '0'));
  }
  return eti.modo === 'libres' ? (eti.libres || []) : eti.reimprimir;
}
const numHojas = n => { const hueco = POR_HOJA - (eti.inicio - 1); return n <= hueco ? 1 : 1 + Math.ceil((n - hueco) / POR_HOJA); };

function vEtiquetas() {
  alMontar = async () => {
    if (eti.siguiente == null) {
      try { const c = await api('codigos'); eti.libres = c.libres; eti.siguiente = c.siguiente; render(); return; } catch (e) { toast(e.message); }
    }
    pintarHoja();
  };
  const cods = codigosEtiquetas(), hojas = numHojas(cods.length);
  const modos = [['nuevos', 'Generar códigos nuevos'], ['libres', `Reimprimir sin asignar · ${eti.libres ? eti.libres.length : '…'}`], ['existentes', 'Reimprimir de artículos']];
  return `<div class="stack"><h1>Etiquetas</h1>
    <div class="callout info small">Se generan códigos por adelantado, se imprime la hoja y se pegan en los artículos. Al escanear una etiqueta nueva en <a href="#alta">Alta de artículo</a> se le pone nombre, foto y categoría.</div>
    <div class="chips">${modos.map(([k, t]) => `<button class="chip ${eti.modo === k ? 'on' : ''}" onclick="eti.modo='${k}';render()">${t}</button>`).join('')}</div>
    <div class="card stack">
      ${eti.modo === 'nuevos' ? `
        <div class="two"><div><label class="f">Hojas A4</label><input class="input" type="number" min="1" max="10" value="${eti.hojas}" onchange="eti.hojas=Math.min(10,Math.max(1,+this.value||1));render()"></div>
          <div><label class="f">Códigos</label><div class="input" style="background:var(--bg)">${cods.length ? `${cods[0]} – ${cods[cods.length - 1]}` : 'Cargando…'}</div></div></div>
        <div class="hint">Siempre se imprimen hojas completas (${POR_HOJA} etiquetas por hoja). Al imprimir, los códigos quedan reservados como "sin asignar".</div>`
      : eti.modo === 'libres' ? `<div class="small">${eti.libres && eti.libres.length ? `Códigos impresos sin artículo: <b>${eti.libres.length}</b> (${esc(eti.libres[0])} – ${esc(eti.libres[eti.libres.length - 1])}).` : 'No hay códigos sin asignar.'}</div>`
      : `<form class="row" onsubmit="event.preventDefault();anadirReimpresion()"><input class="input" id="etiBusca" placeholder="Código o nombre del artículo"><button class="btn ghost" type="submit">Añadir</button></form>
         <div class="row wrap" style="gap:8px">${eti.reimprimir.map((c, i) => `<span class="chip">${esc(c)}<button class="x" onclick="eti.reimprimir.splice(${i},1);render()">×</button></span>`).join('') || '<span class="hint">Añade los artículos cuya etiqueta quieres reimprimir.</span>'}</div>`}
      <div class="two"><div><label class="f">Empezar en la etiqueta nº</label><input class="input" type="number" min="1" max="${POR_HOJA}" value="${eti.inicio}" onchange="eti.inicio=Math.min(${POR_HOJA},Math.max(1,+this.value||1));render()"><div class="hint">Para aprovechar hojas ya empezadas.</div></div>
        <div><label class="f">Opciones</label><label class="row small input"><input type="checkbox" ${eti.cortes ? 'checked' : ''} onchange="eti.cortes=this.checked;render()"> Líneas de corte</label></div></div>
    </div>
    <div class="row"><h2>Vista previa</h2><span class="spacer"></span><span class="small muted">${cods.length} etiquetas · ${hojas} ${hojas === 1 ? 'hoja' : 'hojas'} A4 · 50 × 10 mm</span></div>
    <div class="hoja-wrap" id="hojaWrap"></div>
    ${hojas > 1 ? `<p class="hint" style="text-align:center">Vista previa de la hoja 1 de ${hojas}</p>` : ''}
    <button class="btn block" id="btnImprimir" ${!cods.length ? 'disabled' : ''} onclick="imprimirEtiquetas()">${ICON.print} ${eti.modo === 'nuevos' ? 'Reservar e imprimir' : 'Imprimir'} ${hojas} ${hojas === 1 ? 'hoja' : 'hojas'}</button>
    <p class="note">Imprime al 100 %, sin "ajustar a la página".</p>
    <div id="printArea"></div></div>`;
}
function anadirReimpresion() {
  const q = $('#etiBusca').value.trim().toLowerCase();
  const a = state.articulos.find(x => x.id.toLowerCase() === q) || state.articulos.find(x => x.desc.toLowerCase().includes(q));
  if (!a) return toast('No se encuentra ese artículo');
  if (!eti.reimprimir.includes(a.id)) eti.reimprimir.push(a.id);
  render();
}
function paginasEtiquetas(cods) {
  const celdas = [...Array(eti.inicio - 1).fill(null), ...cods];
  const paginas = [];
  for (let p = 0; p * POR_HOJA < Math.max(celdas.length, 1); p++) {
    const trozo = celdas.slice(p * POR_HOJA, (p + 1) * POR_HOJA);
    while (trozo.length < POR_HOJA) trozo.push(undefined);
    paginas.push(`<div class="hoja ${eti.cortes ? 'cortes' : ''}">${trozo.map(c =>
      c ? `<div class="eti"><svg data-c="${esc(c)}"></svg><div class="cod">${esc(c)}</div></div>` : `<div class="eti ${c === null ? 'vacia' : ''}"></div>`).join('')}</div>`);
  }
  return paginas;
}
function dibujarCodigos(raiz) {
  if (!window.JsBarcode) return;
  raiz.querySelectorAll('svg[data-c]').forEach(svg => {
    JsBarcode(svg, svg.dataset.c, { format: 'CODE128', width: 2, height: 60, displayValue: false, margin: 0 });
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.removeAttribute('width'); svg.removeAttribute('height'); svg.removeAttribute('style');
  });
}
function pintarHoja() {
  const wrap = $('#hojaWrap'); if (!wrap) return;
  wrap.innerHTML = paginasEtiquetas(codigosEtiquetas())[0];
  dibujarCodigos(wrap);
  const hoja = wrap.firstElementChild;
  const escalar = () => { hoja.style.transform = `scale(${wrap.clientWidth / hoja.offsetWidth})`; };
  escalar(); window.onresize = escalar;
}
async function imprimirEtiquetas() {
  let cods = codigosEtiquetas();
  const btn = $('#btnImprimir'); btn.disabled = true;
  try {
    if (eti.modo === 'nuevos') {
      // El servidor reserva los códigos y devuelve los definitivos (por si otra persona generó a la vez)
      cods = (await api('generarCodigos', { cantidad: cods.length })).codigos;
      eti.siguiente = null; eti.libres = null;
    }
    const area = $('#printArea');
    area.innerHTML = paginasEtiquetas(cods).join('');
    dibujarCodigos(area);
    window.print();
    if (eti.modo === 'nuevos') toast(`${cods.length} códigos reservados (${cods[0]} – ${cods[cods.length - 1]})`);
    render();
  } catch (e) { toast(e.message); btn.disabled = false; }
}

// ---------- Solicitudes (profesorado) ----------
const gs = { tab: 'Pendiente', lista: null, citando: null, aprobando: null, foco: null, editando: null };

function vSolicitudesDocente(id) {
  if (id) gs.foco = id;
  alMontar = async () => {
    datosAlDia('solicitudes', () => api('solicitudes'), ls => { gs.lista = ls; pintarSolicitudes(); }).catch(e => errorEn('#solDoc', e));
  };
  return `<div class="stack"><h1>Solicitudes</h1><div class="chips" id="solTabs"></div><div class="stack" id="solDoc">${esqueleto(2)}</div></div>`;
}
function pintarSolicitudes() {
  if (!$('#solDoc')) return;
  const ls = gs.lista || [];
  const cuenta = e => ls.filter(s => s.estado === e).length;
  const atencion = ls.filter(s => necesitaAtencion(s) || citaVencida(s)).length;
  $('#solTabs').innerHTML = [['Pendiente', 'Pendientes'], ['Citada', 'Citadas']].map(([k, t]) => `<button class="chip ${gs.tab === k ? 'on' : ''}" onclick="gs.tab='${k}';pintarSolicitudes()">${t} · ${cuenta(k)}${k === 'Citada' && atencion ? ` (${atencion} por gestionar)` : ''}</button>`).join('');
  // Por orden de llegada; las citas con respuesta que pide algo al docente van primero
  const urge = s => necesitaAtencion(s) || !!citaVencida(s);
  const lista = ls.filter(s => s.estado === gs.tab).sort((a, b) => urge(b) - urge(a) || String(a.creada).localeCompare(String(b.creada)));
  $('#solDoc').innerHTML = lista.map(tarjetaSolicitud).join('') || '<p class="muted">No hay solicitudes.</p>';
  if (gs.editando) { pintarArtsEdicion(); pintarElegir(); }
  observarFotos();
  // Desde el enlace de un correo (#solicitudes/<id>): se abre su pestaña y se lleva a la vista
  if (gs.foco) {
    const s = ls.find(x => x.id === gs.foco), el = $('#sol-' + CSS.escape(gs.foco));
    if (s && s.estado !== gs.tab) { gs.tab = s.estado; return pintarSolicitudes(); }
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); }
    gs.foco = null;
  }
}
// ---------- Cola de cada artículo ----------
// Otras solicitudes activas del mismo artículo con fechas que se solapan, por orden de llegada
const solapanFechas = (a, b) => new Date(a.desde) <= new Date(b.hasta) && new Date(b.desde) <= new Date(a.hasta);
const colaDe = (s, id) => (gs.lista || []).filter(o => o.articulos.includes(id) && (o.id === s.id || solapanFechas(o, s)))
  .sort((a, b) => String(a.creada).localeCompare(String(b.creada)));
function avisoCola(s, id, a) {
  const cola = colaDe(s, id), otras = cola.filter(o => o.id !== s.id), avisos = [];
  const citada = otras.find(o => o.estado === 'Citada');
  if (citada) avisos.push(`<div style="color:var(--danger);font-weight:600">Ya citado para ${esc(citada.usuario)} ${periodo(citada)}: no se puede citar ni entregar a la vez</div>`);
  if (otras.length) {
    const pos = cola.findIndex(o => o.id === s.id) + 1;
    avisos.push(`<div style="color:var(--warn);font-weight:600">${pos}º de ${cola.length} en la cola para estas fechas</div>`
      + otras.map(o => `<div class="muted">${esc(o.usuario)} ${periodo(o)} · pedido el ${fmt(o.creada)}${o.estado === 'Citada' ? ' · citado' : ''}</div>`).join(''));
  }
  if (a && a.prestamo && new Date(a.prestamo.fin) >= new Date(s.desde)) avisos.push(`<div style="color:var(--warn)">Prestado a ${esc(a.prestamo.usuario || '')} hasta el ${fmt(a.prestamo.fin)}</div>`);
  return avisos.join('');
}
// Asignatura que el docente deja en la solicitud: la de la lista, la escrita por el alumno (corregida)
// para añadirla a la lista, o un texto solo para esta solicitud
function asignaturaElegida(s) {
  const sel = $('#asig-' + CSS.escape(s.id)).value;
  const texto = sel.startsWith('__') ? $('#asigTxt-' + CSS.escape(s.id)).value.trim() : sel;
  if (!texto) return null;
  const existente = (state.maestros.Asignatura || []).find(a => a.toLowerCase() === texto.toLowerCase());
  return existente ? { asignatura: existente } : { asignatura: texto, asignaturaNueva: sel === '__nueva', soloEsta: sel !== '__nueva' };
}
function tarjetaSolicitud(s) {
  const asig = state.maestros.Asignatura || [];
  const fueraDeLista = !s.motivoNuevo && s.motivo && !asig.includes(s.motivo);
  const citando = gs.citando === s.id;
  const manana = new Date(Date.now() + 864e5);
  // Al cambiar la cita, se propone por defecto la fecha que pidió el alumno
  const base = s.respuestaCita === 'Propuesta' && s.citaPropuesta ? new Date(s.citaPropuesta) : null;
  const horaBase = base ? `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}` : '10:00';
  return `<div class="card stack" id="sol-${esc(s.id)}">
    <div class="row"><div class="avatar soft">${initials(s.usuario)}</div><div class="grow" style="min-width:0"><b>${esc(s.usuario)}</b><div class="small muted" style="overflow:hidden;text-overflow:ellipsis">${esc(s.especialidad || s.email)}</div></div></div>
    <div class="row wrap">${s.estado === 'Citada' ? badgeCita(s) : ESTADO_SOL[s.estado]}</div>
    <div class="small muted">Lo necesita del ${fmt(s.desde)} al ${fmt(s.hasta)}${s.comentario ? ` · «${esc(s.comentario)}»` : ''}</div>
    ${s.estado === 'Citada' ? bloqueCitaDocente(s) : ''}
    ${gs.editando && gs.editando.id === s.id ? '' : `<div class="list small">${s.articulos.map(i => { const a = artPorId(i); return `<div class="li">${miniatura(a)}<div class="grow"><div class="title">${esc(a ? a.desc : i)}</div><div class="muted">${esc(i)}</div>${avisoCola(s, i, a)}</div>${a ? badge(a) : ''}</div>`; }).join('')}</div>`}
    <div><label class="f">Asignatura o motivo ${s.motivoNuevo ? '<span class="badge b-violet">Nueva, escrita por el alumno</span>' : ''}</label>
      <select class="input" id="asig-${esc(s.id)}" onchange="const c=$('#asigTxtCaja-${esc(s.id)}');if(c)c.style.display=this.value.startsWith('__')?'block':'none'">
        ${s.motivoNuevo ? `<option value="__nueva" selected>Añadir a la lista (puedes corregir el texto)</option><option value="__solo">Usar solo en este préstamo</option>` : ''}
        ${fueraDeLista ? `<option value="${esc(s.motivo)}" selected>${esc(s.motivo)} (solo en esta solicitud)</option>` : ''}
        ${asig.map(a => `<option value="${esc(a)}" ${!s.motivoNuevo && a === s.motivo ? 'selected' : ''}>${s.motivoNuevo || fueraDeLista ? 'Cambiar por: ' : ''}${esc(a)}</option>`).join('')}
      </select>
      ${s.motivoNuevo ? `<div id="asigTxtCaja-${esc(s.id)}" style="margin-top:8px"><input class="input" id="asigTxt-${esc(s.id)}" value="${esc(s.motivo)}">
        <div class="hint">Texto escrito por el alumno. Corrige erratas antes de aprobar.</div></div>` : ''}</div>
    ${gs.editando && gs.editando.id === s.id ? panelEditarSolicitud(s) : gs.aprobando === s.id ? panelEntrega(s) : citando ? `<div class="callout info stack"><b>Citar para recoger</b>
        <div class="two"><div><label class="f">Día</label><input class="input" type="date" id="citaDia" value="${isoDia(base || manana)}"></div><div><label class="f">Hora</label><input class="input" type="time" id="citaHora" value="${horaBase}"></div></div>
        <div><label class="f">Mensaje (opcional)</label><textarea class="input" id="citaMsg" rows="2"></textarea></div>
        <div class="two"><button class="btn" onclick="citar('${esc(s.id)}')">Enviar cita por correo</button><button class="btn ghost" onclick="gs.citando=null;pintarSolicitudes()">Cancelar</button></div></div>`
    : `<div class="three"><button class="btn sm" onclick="gs.aprobando='${esc(s.id)}';gs.citando=null;gs.editando=null;pintarSolicitudes()">Aprobar</button>
        <button class="btn violet sm" onclick="gs.citando='${esc(s.id)}';gs.aprobando=null;gs.editando=null;pintarSolicitudes()">${s.estado === 'Citada' ? 'Cambiar cita' : 'Citar'}</button>
        <button class="btn danger sm" onclick="rechazar('${esc(s.id)}')">Rechazar</button></div>
      <button class="btn ghost sm" onclick="editarSolicitudDoc('${esc(s.id)}')">✎ Editar: fechas, asignatura o artículos</button>
      <div class="hint">Aprobar registra el préstamo en este momento, con el material entregado.</div>`}
  </div>`;
}
// Último botón pulsado: mientras se guarda, sus botones vecinos quedan desactivados y él dice «Enviando…»
let botonPulsado = null;
document.addEventListener('click', e => { botonPulsado = e.target.closest ? e.target.closest('button') : null; }, true);
async function accionSolicitud(id, accion, datos, mensaje) {
  const btn = botonPulsado, vecinos = btn ? [...btn.parentElement.querySelectorAll('button')] : [], texto = btn && btn.textContent;
  vecinos.forEach(b => { b.disabled = true; });
  if (btn) btn.textContent = 'Enviando…';
  try {
    await api(accion, { id, ...datos }); toast(mensaje); gs.citando = null; gs.aprobando = null;
    // Solicitudes y catálogo al día en una sola petición, y se repinta una vez
    try {
      const [ls, arts] = await apiVarias([['solicitudes'], ['catalogo']]);
      guardarDatos('solicitudes', ls); gs.lista = ls;
      state.articulos = arts; catalogoEn = Date.now(); recuerdo.guardar();
    } catch (x) { gs.lista = null; }
    if (location.hash.startsWith('#solicitudes')) render();
    return true;
  } catch (e) {
    if (e.codigo === 409) { gs.citando = null; gs.aprobando = null; }
    vecinos.forEach(b => { b.disabled = false; });
    if (btn) btn.textContent = texto;
    fallo(e);
    return false;
  }
}
function bloqueCitaDocente(s) {
  const msg = s.mensajeCita ? ` «${esc(s.mensajeCita)}»` : '';
  const vencida = citaVencida(s);
  if (vencida) return `<div class="callout warn small stack">${vencida === 'retraso'
      ? `<div><b>Cita con retraso:</b> era hoy, ${fmtCita(s.cita)}, y el alumno aún no ha venido.</div>`
      : `<div><b>El alumno no acudió a la cita</b> del ${fmtCita(s.cita)}.</div>`}
    <div>Si viene más tarde, pulsa Aprobar. Si no, cambia la cita o anula la solicitud.</div>
    <button class="btn danger sm" style="justify-self:start" onclick="anularNoAcudio('${esc(s.id)}')">${vencida === 'retraso' ? 'Anular la solicitud' : 'Anular: no acudió'}</button></div>`;
  if (s.respuestaCita === 'Aceptada') return `<div class="callout ok small">Cita confirmada por el alumno: <b>${fmtCita(s.cita)}</b>.${msg} Cuando llegue al almacén, pulsa Aprobar.</div>`;
  if (s.respuestaCita === 'Rechazada') return `<div class="callout warn small">No puede ir a la cita del <b>${fmtCita(s.cita)}</b>.${msg}<br>Propón otra fecha con «Cambiar cita» o rechaza la solicitud.</div>`;
  if (s.respuestaCita === 'Propuesta') return `<div class="callout warn small stack">No puede ir a la cita del ${fmtCita(s.cita)} y propone el <b>${fmtCita(s.citaPropuesta)}</b>.${msg}
      <div class="two"><button class="btn sm" onclick="aceptarPropuesta('${esc(s.id)}')">Aceptar esa fecha</button><button class="btn ghost sm" style="background:#fff" onclick="gs.citando='${esc(s.id)}';pintarSolicitudes()">Proponer otra</button></div></div>`;
  return `<div class="callout violet small">Cita: <b>${fmtCita(s.cita)}</b>. El alumno aún no ha respondido. Cuando llegue al almacén, pulsa Aprobar para hacer efectivo el préstamo.</div>`;
}
// El docente edita la solicitud (fechas, asignatura con el desplegable de la tarjeta, artículos) antes de citar o aprobar
function editarSolicitudDoc(id) {
  const s = gs.lista.find(x => x.id === id);
  gs.editando = { id, desde: isoDia(new Date(s.desde)), hasta: isoDia(new Date(s.hasta)), arts: s.articulos.slice() };
  gs.citando = null; gs.aprobando = null;
  // Se puede pedir lo que no está en mantenimiento ni de baja; las fechas las comprueba el servidor
  nuevoElegir({ para: 'solicitud', vale: a => a.estado === 'disp' || a.estado === 'prest', tiene: x => gs.editando.arts.includes(x),
    anadir: x => { const a = articulo(x); if (!a) return toast(`Código ${x} desconocido`); if (!['disp', 'prest'].includes(a.estado)) return toast(`${a.desc} no está disponible (mantenimiento o baja)`); if (!gs.editando.arts.includes(x)) gs.editando.arts.push(x); pintarArtsEdicion(); pintarElegir(); },
    quitar: x => { gs.editando.arts = gs.editando.arts.filter(y => y !== x); pintarArtsEdicion(); pintarElegir(); } });
  pintarSolicitudes();
  const el = $('#sol-' + CSS.escape(id)); if (el) el.scrollIntoView({ block: 'start' });
}
function panelEditarSolicitud(s) {
  const e = gs.editando;
  return `<div class="callout info stack" id="edForm"><b>Editar la solicitud</b>
    <div class="small">La asignatura se cambia en el desplegable de arriba. Al guardar, se avisa al alumno por correo${s.estado === 'Citada' ? '; la cita no cambia' : ''}.</div>
    <div class="two"><div><label class="f">Desde</label><input class="input" type="date" id="edDesde" value="${e.desde}" onchange="gs.editando.desde=this.value;$('#edHasta').min=this.value"></div>
      <div><label class="f">Hasta</label><input class="input" type="date" id="edHasta" value="${e.hasta}" min="${e.desde}" onchange="gs.editando.hasta=this.value"></div></div>
    <div><b class="small">Artículos</b><div id="edArts" style="margin-top:6px"></div></div>
    <details ${e.abierto ? 'open' : ''} ontoggle="gs.editando.abierto=this.open;if(this.open)pintarElegir()"><summary class="small" style="cursor:pointer;color:var(--primary);font-weight:600">+ Añadir artículos del catálogo</summary><div class="stack" style="margin-top:8px">${htmlElegir()}</div></details>
    <div class="two"><button class="btn" onclick="guardarSolicitudDoc('${esc(s.id)}')">Guardar cambios</button><button class="btn ghost" style="background:#fff" onclick="gs.editando=null;elegir=null;pintarSolicitudes()">Cancelar</button></div></div>`;
}
function pintarArtsEdicion() {
  const caja = $('#edArts'); if (!caja) return;
  caja.innerHTML = `<div class="list small">${gs.editando.arts.map(i => { const a = artPorId(i); return `<div class="li">${miniatura(a)}<div class="grow"><div class="title">${esc(a ? a.desc : i)}</div><div class="row wrap" style="gap:6px"><span class="muted">${esc(i)}</span>${a ? badge(a) : ''}</div></div><button class="chip" onclick="elegir.quitar('${esc(i)}')">Quitar</button></div>`; }).join('') || '<div class="li muted">Añade al menos un artículo</div>'}</div>`;
  observarFotos();
}
function guardarSolicitudDoc(id) {
  const s = gs.lista.find(x => x.id === id), e = gs.editando;
  const asignatura = asignaturaElegida(s);
  if (!asignatura) return toast('Escribe la asignatura o el motivo');
  if (!e.arts.length) return toast('Añade al menos un artículo');
  if (!e.desde || !e.hasta) return toast('Indica las dos fechas');
  if (e.hasta < e.desde) return toast('La fecha final es anterior a la inicial');
  if (asignatura.asignaturaNueva) (state.maestros.Asignatura = state.maestros.Asignatura || []).push(asignatura.asignatura);
  gs.editando = null; elegir = null;
  accionSolicitud(id, 'editarSolicitud', { articulos: e.arts, desde: new Date(e.desde + 'T09:00').toISOString(), hasta: new Date(e.hasta + 'T20:00').toISOString(),
    motivo: asignatura.asignatura, asignaturaNueva: !!asignatura.asignaturaNueva, soloEsta: !!asignatura.soloEsta }, 'Solicitud actualizada y alumno avisado').then(ok => {
    // Si el servidor no la acepta (p. ej. un artículo prestado esos días), se vuelve a la edición con lo que había
    if (!ok) { editarSolicitudDoc(id); gs.editando = e; pintarSolicitudes(); }
  });
}
function aceptarPropuesta(id) { accionSolicitud(id, 'aceptarPropuesta', {}, 'Cita confirmada y alumno avisado'); }
function citar(id) {
  const s = gs.lista.find(x => x.id === id);
  const cita = new Date($('#citaDia').value + 'T' + $('#citaHora').value);
  if (isNaN(cita)) return toast('Indica el día y la hora de la cita');
  // La asignatura corregida (o añadida a la lista) se guarda ya al citar, no solo al aprobar
  const asignatura = asignaturaElegida(s);
  if (!asignatura) return toast('Escribe la asignatura o el motivo');
  if (asignatura.asignaturaNueva) (state.maestros.Asignatura = state.maestros.Asignatura || []).push(asignatura.asignatura);
  accionSolicitud(id, 'citarSolicitud', { cita: cita.toISOString(), mensaje: $('#citaMsg').value, ...asignatura }, 'Cita enviada por correo');
}
function rechazar(id) {
  const motivo = prompt('Motivo del rechazo (se enviará al alumno):');
  if (motivo === null) return;
  accionSolicitud(id, 'rechazarSolicitud', { motivo }, 'Solicitud rechazada');
}
function anularNoAcudio(id) {
  const s = gs.lista.find(x => x.id === id);
  if (!confirm(`¿Anular la solicitud de ${s.usuario}? Se le avisará por correo de que no acudió a la cita.`)) return;
  accionSolicitud(id, 'rechazarSolicitud', { motivo: 'No acudió a la cita del ' + fmtCita(s.cita), noAcudio: true }, 'Solicitud anulada y alumno avisado');
}
// ---------- Aprobar = entregar ----------
// Antes de entregar, el docente ve las fechas pedidas y puede mantenerlas o cambiarlas. Si la devolución
// pedida ya pasó (el alumno llega tarde), se propone la misma duración a partir de ahora.
function fechasEntrega(s) {
  const hoy = new Date(), desde = new Date(s.desde), hasta = new Date(s.hasta);
  if (isoDia(hasta) >= isoDia(hoy)) return { ini: hoy, fin: hasta, tarde: false };
  const dias = Math.max(1, Math.round((diaDe(isoDia(hasta)) - diaDe(isoDia(desde))) / 864e5));
  return { ini: hoy, fin: sumarDias(hoy, dias), tarde: true };
}
function panelEntrega(s) {
  const f = fechasEntrega(s), id = esc(s.id);
  return `<div class="callout ok stack"><b>Entregar el material ahora</b>
    <div class="small">Pedido por el alumno: <b>del ${fmt(s.desde)} al ${fmt(s.hasta)}</b>.</div>
    ${f.tarde ? `<div class="small" style="color:var(--danger);font-weight:600">La devolución que pidió (${fmt(s.hasta)}) ya ha pasado: se propone la misma duración desde hoy. Revísala antes de entregar.</div>` : ''}
    <div><label class="f">Entrega</label><input class="input" type="date" id="apIni" value="${isoDia(f.ini)}" onchange="$('#apFin').min=this.value"></div>
      <div><label class="f">Devolución</label><input class="input" type="date" id="apFin" value="${isoDia(f.fin)}" min="${isoDia(f.ini)}"></div>
    <div class="chips" style="flex-wrap:wrap">${f.tarde ? '' : `<button class="chip" onclick="$('#apFin').value='${isoDia(new Date(s.hasta))}'">Mantener la pedida (${fmt(s.hasta)})</button>`}
      <button class="chip" onclick="$('#apFin').value=isoDia(sumarDias(diaDe($('#apIni').value), 7))">1 semana</button>
      <button class="chip" onclick="$('#apFin').value=isoDia(sumarDias(diaDe($('#apIni').value), 14))">2 semanas</button></div>
    <div class="two"><button class="btn" onclick="aprobar('${id}')">Confirmar entrega</button><button class="btn ghost" style="background:#fff" onclick="gs.aprobando=null;pintarSolicitudes()">Cancelar</button></div></div>`;
}
function aprobar(id) {
  const s = gs.lista.find(x => x.id === id);
  const datos = asignaturaElegida(s);
  if (!datos) return toast('Escribe la asignatura o el motivo');
  const ini = $('#apIni').value, fin = $('#apFin').value;
  if (!ini || !fin) return toast('Indica el día de entrega y el de devolución');
  if (fin < ini) return toast('La devolución no puede ser anterior a la entrega');
  if (datos.asignaturaNueva) (state.maestros.Asignatura = state.maestros.Asignatura || []).push(datos.asignatura);
  accionSolicitud(id, 'aprobarSolicitud', { ...datos, inicio: inicioIso(ini), fin: finIso(fin) }, 'Préstamo registrado y alumno avisado');
}

// ---------- Listas maestras ----------
const LISTAS = [['Categoria', 'Categorías', 'Para clasificar los artículos'], ['Asignatura', 'Asignaturas', 'Motivo de los préstamos'], ['Especialidad', 'Especialidades', 'Perfil del alumnado'], ['Curso', 'Cursos', 'Perfil del alumnado']];
function vListas() {
  return `<div class="stack"><h1>Listas</h1><p class="hint">Estas listas alimentan los desplegables de toda la aplicación.</p>
    ${LISTAS.map(([k, t, d]) => `<div class="card stack"><div><h2>${t}</h2><div class="small muted">${d}</div></div>
      <div class="row wrap" style="gap:8px">${(state.maestros[k] || []).map(v => `<span class="chip">${esc(k === 'Categoria' ? catLabel(v) : v)}
        <button class="x" title="Renombrar" onclick="editarLista('${k}', ${esc(JSON.stringify(v))}, 'renombrar')">✎</button>
        <button class="x" title="Quitar" onclick="editarLista('${k}', ${esc(JSON.stringify(v))}, 'borrar')">×</button></span>`).join('')}</div>
      <form class="row" onsubmit="event.preventDefault();editarLista('${k}', this.v.value, 'anadir')"><input class="input" name="v" placeholder="Añadir…"><button class="btn sm" type="submit">Añadir</button></form></div>`).join('')}
    <p class="hint">✎ renombra el valor y lo corrige también en todos los registros que lo usan. No se puede quitar una categoría, especialidad o curso que esté en uso; las asignaturas sí, porque cada préstamo conserva su texto.</p></div>`;
}
async function editarLista(lista, valor, accion) {
  const datos = { lista, valor };
  if (accion === 'borrar') {
    if (!confirm(lista === 'Asignatura' ? `¿Quitar «${valor}» de la lista? Los préstamos que la usan la conservan en su historial.` : `¿Quitar «${valor}» de la lista?`)) return;
    datos.borrar = true;
  } else if (accion === 'renombrar') {
    const nuevo = prompt(`Nuevo nombre para «${valor}» (se corregirá también en todos los registros que lo usan):`, valor);
    if (!nuevo || nuevo.trim() === valor) return;
    datos.renombrar = nuevo.trim();
  }
  try {
    state.maestros = ordenarMaestros(await api('guardarMaestro', datos));
    if (lista === 'Categoria' && accion === 'renombrar') await refrescarCatalogo();
    render();
  } catch (e) { toast(e.message); }
}

// ---------- Usuarios y roles ----------
// El alumnado se da de alta solo al entrar por primera vez (o al prestarle algo). Aquí el profesorado
// puede adelantarlo (alta con el correo) y corregir nombre, especialidad y curso; los roles, solo un administrador.
const us = { q: '', editando: null };
function vUsuarios() {
  const admin = state.usuario.rol === 'Administrador';
  alMontar = () => datosAlDia('usuarios', () => api('usuarios'), lista => { op.usuarios = lista; pintarUsuarios(); }).catch(e => errorEn('#listaUsuarios', e));
  return `<div class="stack"><h1>Usuarios y roles</h1>
    <p class="small muted">Cualquier cuenta @${esc(C.dominio)} entra como alumno la primera vez, con su nombre de Google. ${admin ? 'Aquí indicas quién es docente o administrador; los cambios se aplican en unos minutos.' : 'Solo un administrador puede cambiar roles.'}</p>
    <form class="row" onsubmit="event.preventDefault();us.editando=this.e.value.trim().toLowerCase();us.q='';pintarUsuarios()"><input class="input" name="e" placeholder="correo@${esc(C.dominio)}" autocomplete="off"><button class="btn" type="submit">Dar de alta</button></form>
    ${admin ? `<form class="row" onsubmit="event.preventDefault();cambiarRol(this.e.value.trim().toLowerCase(), 'Docente')"><input class="input" name="e" placeholder="correo@${esc(C.dominio)} del docente" autocomplete="off"><button class="btn ghost" type="submit">Añadir docente</button></form>` : ''}
    <div class="search">${ICON.search}<input id="buscaUsuario" placeholder="Buscar por nombre, correo, especialidad o curso" value="${esc(us.q)}" oninput="us.q=this.value;pintarUsuarios()" autocomplete="off"></div>
    <div class="list" id="listaUsuarios">${cargando}</div></div>`;
}
function pintarUsuarios() {
  const el = $('#listaUsuarios'); if (!el || !op.usuarios) return;
  const admin = state.usuario.rol === 'Administrador', m = state.maestros;
  const orden = { Administrador: 0, Docente: 1, Alumno: 2 }, q = us.q.trim().toLowerCase();
  const perfil = u => [u.especialidad, u.curso].filter(Boolean).join(' · ');
  let lista = op.usuarios.filter(u => !q || [u.nombre, u.email, u.especialidad, u.curso].join(' ').toLowerCase().includes(q))
    .sort((a, b) => orden[a.rol] - orden[b.rol] || (a.nombre || a.email).localeCompare(b.nombre || b.email));
  // Alta de alguien que aún no está: se abre su ficha vacía
  if (us.editando && !op.usuarios.some(u => u.email === us.editando)) lista = [{ email: us.editando, nombre: '', nombrePila: '', apellidos: '', rol: 'Alumno', nuevo: true }, ...lista];
  el.innerHTML = lista.map(u => us.editando === u.email ? `<div class="li" style="flex-wrap:wrap">
      <div class="grow"><div class="title">${u.nuevo ? 'Alta: ' : ''}${esc(u.email)}</div></div>
      <div class="two" style="width:100%"><div><label class="f">Nombre</label><input class="input" id="uNom" value="${esc(u.nombrePila)}"></div><div><label class="f">Apellidos</label><input class="input" id="uApe" value="${esc(u.apellidos)}"></div></div>
      <div class="two" style="width:100%"><div><label class="f">Especialidad</label><select class="input" id="uEsp"><option value="">—</option>${(m.Especialidad || []).map(e => `<option ${u.especialidad === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
        <div><label class="f">Curso</label><select class="input" id="uCur"><option value="">—</option>${(m.Curso || []).map(c => `<option ${u.curso === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
      <div class="two" style="width:100%"><button class="btn" id="btnUsuario" onclick="guardarUsuario('${esc(u.email)}')">${u.nuevo ? 'Dar de alta' : 'Guardar'}</button><button class="btn ghost" onclick="us.editando=null;pintarUsuarios()">Cancelar</button></div></div>`
    : `<div class="li">
      <div class="avatar soft">${initials(u.nombre || u.email)}</div><div class="grow" style="min-width:0"><div class="title">${esc(u.nombre || u.email)}</div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis">${esc(u.email)}${perfil(u) ? ' · ' + esc(perfil(u)) : ''}</div></div>
      <button class="chip" onclick="us.editando='${esc(u.email)}';pintarUsuarios()">Editar</button>
      ${admin ? `<select class="input" style="width:auto;min-height:38px" onchange="cambiarRol('${esc(u.email)}', this.value)">${['Alumno', 'Docente', 'Administrador'].map(r => `<option ${u.rol === r ? 'selected' : ''}>${r}</option>`).join('')}</select>` : `<span class="badge b-info">${esc(u.rol)}</span>`}</div>`).join('')
    || '<div class="li muted small">Nadie coincide con la búsqueda</div>';
}
async function guardarUsuario(email) {
  const btn = $('#btnUsuario'); btn.disabled = true;
  const datos = { email, nombre: $('#uNom').value, apellidos: $('#uApe').value, especialidad: $('#uEsp').value, curso: $('#uCur').value };
  try {
    const r = await api('editarUsuario', datos);
    toast(r.nuevo ? `${email} dado de alta como alumno` : 'Datos guardados');
    us.editando = null;
    op.usuarios = await api('usuarios'); guardarDatos('usuarios', op.usuarios);
    pintarUsuarios();
  } catch (e) { btn.disabled = false; toast(e.message); }
}
async function cambiarRol(email, rol) {
  try { await api('cambiarRol', { email, rol }); toast(`${email}: ${rol}`); render(); } catch (e) { toast(e.message); render(); }
}

// ---------- Incidencias y estado de artículos ----------
function vIncidencias() {
  alMontar = () => datosAlDia('incidencias', () => api('incidencias'), ls => {
      $('#listaInc').innerHTML = ls.map(i => `<div class="li" style="flex-wrap:wrap">${miniatura(artPorId(i.articulo))}
        <div class="grow"><div class="title">${esc(i.desc || i.articulo)}</div><div class="small">${esc(i.texto)}</div><div class="small muted">${fmt(i.fecha)} · ${esc(i.por)}</div></div>
        ${i.estado === 'Abierta' ? `<button class="chip" onclick="cerrarIncidencia('${esc(i.id)}')">Cerrar</button>` : '<span class="badge b-info">Cerrada</span>'}</div>`).join('') || '<div class="li muted small">No hay incidencias</div>';
      observarFotos();
    }).catch(e => errorEn('#listaInc', e));
  return `<div class="stack"><h1>Incidencias</h1><div class="list" id="listaInc">${cargando}</div>
    <p class="hint">Para registrar un daño, abre el artículo desde el catálogo y pulsa «Registrar daño».</p></div>`;
}
async function cerrarIncidencia(id) { try { await api('cerrarIncidencia', { id }); render(); } catch (e) { fallo(e); } }
async function registrarIncidencia(id) {
  const texto = prompt('Describe el daño o la incidencia:');
  if (!texto) return;
  const mant = confirm('¿Pasar el artículo a «Mantenimiento» para que no se pueda prestar?');
  try { await api('nuevaIncidencia', { articulo: id, texto, mantenimiento: mant }); toast('Incidencia registrada'); if (mant) await refrescarCatalogo(); render(); } catch (e) { toast(e.message); }
}
async function cambiarEstado(id, estado) {
  try { await api('estadoArticulo', { id, estado }); toast(`Estado: ${estado}`); await refrescarCatalogo(); render(); } catch (e) { toast(e.message); render(); }
}

// ---------- Registro de pantallas ----------
Object.assign(VISTAS, {
  inicio: () => vInicio(), prestar: () => vPrestar(), devolver: () => vDevolver(), activos: () => vActivos(),
  prestamo: id => vPrestamo(id), mas: () => vMas(), alta: () => vAlta(), editar: id => vEditar(id), etiquetas: () => vEtiquetas(),
  listas: () => vListas(), usuarios: () => vUsuarios(), incidencias: () => vIncidencias(),
  solicitudes: id => esDocente() ? vSolicitudesDocente(id) : vSolicitudesAlumno()
});
['inicio', 'prestar', 'devolver', 'activos', 'prestamo', 'mas', 'alta', 'editar', 'etiquetas', 'listas', 'usuarios', 'incidencias'].forEach(r => SOLO_DOCENTE.add(r));
