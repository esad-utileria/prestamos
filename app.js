// Préstamo de Utilería · ESAD Sevilla
// Web estática: inicia sesión con Google y habla con la API de Apps Script.

const C = window.CONFIG;
const state = { usuario: null, maestros: {}, articulos: [], q: '', cat: null, filtro: 'todos', cargando: false };
const fotos = {};          // id de artículo -> data URL (miniatura)
const fotosGrandes = {};   // id de artículo -> data URL (ficha)

// ---------- Utilidades ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = iso => iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
const initials = n => String(n || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const CAT_LABEL = { 'MENAJE DEL HOGAR': 'Menaje', 'ESTRUCTURAS Y ESCALERAS': 'Estructuras', 'TELEFONOS': 'Teléfonos', 'ILUMINACIÓN': 'Iluminación' };
const catLabel = c => CAT_LABEL[c] || (c ? c[0] + c.slice(1).toLowerCase() : '');
const nArt = n => n + (n === 1 ? ' artículo' : ' artículos');
const esDocente = () => state.usuario && (state.usuario.rol === 'Docente' || state.usuario.rol === 'Administrador');
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
}
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } }
};

const ICON = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h12"/><path d="M12 6l6 6-6 6"/><path d="M20 4v16"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12H8"/><path d="M12 6l-6 6 6 6"/><path d="M4 4v16"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
};

// ---------- Sesión con Google ----------
function tokenGuardado() {
  const t = store.get('token'), exp = Number(store.get('token_exp'));
  return t && exp > Date.now() + 60000 ? t : null;
}
function alRecibirCredencial(resp) {
  const payload = JSON.parse(atob(resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (payload.hd !== C.dominio) { vLogin('Entra con tu cuenta @' + C.dominio); return; }
  store.set('token', resp.credential);
  store.set('token_exp', String(payload.exp * 1000));
  arrancar();
}
function iniciarGoogle() {
  google.accounts.id.initialize({ client_id: C.clientId, callback: alRecibirCredencial, hd: C.dominio, auto_select: true, use_fedcm_for_prompt: true });
}
function cerrarSesion() {
  store.del('token'); store.del('token_exp');
  if (window.google) google.accounts.id.disableAutoSelect();
  state.usuario = null; location.hash = ''; vLogin();
}

// ---------- API ----------
const SOLO_LECTURA = new Set(['yo', 'catalogo', 'fotos', 'usuarios', 'prestamos', 'buscarCodigo', 'codigos', 'solicitudes', 'incidencias']);
async function api(accion, datos, intento = 1) {
  if (!C.apiUrl) throw new Error('Falta configurar la URL de la API en config.js');
  const token = tokenGuardado();
  if (!token) { vLogin('Tu sesión ha caducado. Vuelve a entrar.'); throw new Error('sin sesión'); }
  let res;
  try {
    const r = await fetch(C.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita la comprobación CORS previa
      body: JSON.stringify({ accion, token, datos: datos || {} })
    });
    const texto = await r.text();
    try { res = JSON.parse(texto); } catch (e) {
      // A veces Google devuelve una página de error HTML (servidor saturado o reiniciándose): se reintenta
      console.warn('Respuesta no JSON de la API', accion, r.status, texto.slice(0, 200));
      throw new Error('respuesta no válida');
    }
  } catch (e) {
    // Solo se reintentan las consultas: repetir una escritura podría duplicar un préstamo
    if (SOLO_LECTURA.has(accion) && intento < 3) { await new Promise(ok => setTimeout(ok, 700 * intento)); return api(accion, datos, intento + 1); }
    throw new Error(SOLO_LECTURA.has(accion)
      ? 'El servidor no ha respondido. Comprueba la conexión e inténtalo de nuevo.'
      : 'El servidor no ha confirmado la operación. Revisa si se ha guardado antes de repetirla.');
  }
  if (!res.ok) {
    if (res.codigo === 401 || res.codigo === 403) { store.del('token'); vLogin(res.error); }
    throw new Error(res.error);
  }
  return res.datos;
}

// ---------- Fotos (carga perezosa por lotes) ----------
let colaFotos = new Set(), temporizador = null;
const observador = 'IntersectionObserver' in window ? new IntersectionObserver(entradas => {
  entradas.forEach(e => {
    if (!e.isIntersecting) return;
    observador.unobserve(e.target);
    const id = e.target.dataset.foto;
    if (fotos[id]) pintarFoto(e.target, fotos[id]); else { colaFotos.add(id); programarFotos(); }
  });
}, { rootMargin: '300px' }) : null;

function programarFotos() {
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    const ids = [...colaFotos].slice(0, 12);
    ids.forEach(id => colaFotos.delete(id));
    if (colaFotos.size) programarFotos();
    try {
      const res = await api('fotos', { ids });
      Object.assign(fotos, res);
      ids.forEach(id => document.querySelectorAll(`[data-foto="${CSS.escape(id)}"]`).forEach(el => res[id] && pintarFoto(el, res[id])));
    } catch (e) { console.warn('Fotos', e); }
  }, 60);
}
function pintarFoto(el, url) {
  if (el.querySelector('img')) return;
  const img = new Image(); img.alt = ''; img.src = url; el.appendChild(img);
}
function observarFotos() {
  document.querySelectorAll('[data-foto]').forEach(el => {
    if (fotos[el.dataset.foto]) pintarFoto(el, fotos[el.dataset.foto]);
    else if (observador) observador.observe(el);
  });
}
const ph = a => `<div class="ph azulejo" ${a.foto ? `data-foto="${esc(a.id)}"` : ''}><span>${esc(catLabel(a.cat)).toUpperCase()}</span></div>`;

// ---------- Estructura ----------
const NAV = {
  alumno: [['catalogo', 'Catálogo', 'grid'], ['mis', 'Mis préstamos', 'box'], ['solicitudes', 'Solicitudes', 'list'], ['perfil', 'Mi perfil', 'user']],
  docente: [['inicio', 'Inicio', 'home'], ['catalogo', 'Catálogo', 'grid'], ['prestar', 'Prestar', 'send'], ['devolver', 'Devolver', 'back'], ['mas', 'Más', 'more']]
};
ICON.home = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>';
const ruta = () => (location.hash.slice(1) || (esDocente() ? 'inicio' : 'catalogo')).split('/').map(decodeURIComponent);
const ir = destino => { if (location.hash === '#' + destino) render(); else location.hash = destino; };

function shell(contenido) {
  const [r] = ruta();
  const u = state.usuario;
  const links = NAV[esDocente() ? 'docente' : 'alumno'].map(([k, t, i]) => `<a href="#${k}" class="${r === k ? 'on' : ''}">${ICON[i]}<span>${t}</span></a>`).join('');
  return `<div class="app">
    <header class="top"><div class="top-inner">
      <a class="brand" href="#catalogo"><img src="img/logo-esad.png" alt="ESAD Sevilla"><span class="t">Utilería</span></a>
      <div class="spacer"></div>
      <span class="badge b-info">${esc(u.rol)}</span>
      <a class="avatar" href="#perfil" title="${esc(u.email)}" style="text-decoration:none">${initials(u.nombre ? u.nombre + ' ' + u.apellidos : u.email)}</a>
    </div></header>
    <div class="layout"><nav class="side">${links}</nav><main>${contenido}</main></div>
    <nav class="bottom">${links}</nav>
  </div>`;
}

// Pantallas por ruta. docente.js añade las del profesorado.
const VISTAS = { catalogo: () => vCatalogo(), articulo: arg => vArticulo(arg), perfil: () => vPerfil() };
const SOLO_DOCENTE = new Set();
let alMontar = null; // lo fija una vista que necesita hacer algo tras pintarse (cámara, cargar datos…)

function render() {
  if (!state.usuario) return;
  if (typeof Escaner !== 'undefined') Escaner.parar(); // `const` no se publica en window: hay que usar typeof
  const [r, arg] = ruta();
  alMontar = null;
  const vista = VISTAS[r] && (!SOLO_DOCENTE.has(r) || esDocente()) ? VISTAS[r] : vPronto;
  $('#root').innerHTML = shell(vista(arg));
  observarFotos();
  if (r === 'articulo') cargarFotoGrande(arg);
  if (alMontar) alMontar();
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- Pantallas ----------
function vLogin(aviso) {
  $('#root').innerHTML = `<div class="login azulejo"><div class="box stack">
    <img src="img/logo-esad.png" alt="ESAD Sevilla" style="height:70px">
    <h1>Préstamo de Utilería</h1>
    <p class="muted">Consulta el catálogo, gestiona tus préstamos y solicita material para tus ensayos y montajes.</p>
    ${aviso ? `<div class="callout warn small">${esc(aviso)}</div>` : ''}
    <div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div>
    <p class="small muted">Solo cuentas @${esc(C.dominio)}</p>
  </div></div>`;
  const pintar = () => {
    iniciarGoogle();
    google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'es', width: 280 });
    if (!aviso) google.accounts.id.prompt();
  };
  if (window.google && google.accounts) pintar();
  else window.addEventListener('load', pintar, { once: true });
}

function vCatalogo() {
  const doc = esDocente();
  const q = state.q.toLowerCase();
  const f = state.filtro;
  const lista = state.articulos.filter(a => (!state.cat || a.cat === state.cat)
    && (f === 'todos' || a.estado === f)
    && (!q || (a.desc + ' ' + a.id).toLowerCase().includes(q)));
  const cuenta = k => state.articulos.filter(a => k === 'todos' || a.estado === k).length;
  const filtros = doc ? [['todos', 'Todos'], ['disp', 'Disponibles'], ['prest', 'Prestados'], ['mant', 'Mantenimiento']] : [['todos', 'Todos'], ['disp', 'Disponibles']];
  const cats = state.maestros.Categoria || [];
  return `<div class="stack">
    <div class="row"><h1>Catálogo</h1><div class="spacer"></div>${doc ? '' : '<a class="btn ghost sm" href="#escanear">Escanear</a>'}<button class="btn ghost sm" onclick="recargar()">Actualizar</button></div>
    <div class="search">${ICON.search}<input id="q" placeholder="Buscar por nombre o código" value="${esc(state.q)}" oninput="state.q=this.value;renderBusqueda()"></div>
    <div class="chips">${filtros.map(([k, t]) => `<button class="chip ${f === k ? 'on' : ''}" onclick="state.filtro='${k}';render()">${t} · ${cuenta(k)}</button>`).join('')}</div>
    <div class="chips">
      <button class="chip ${!state.cat ? 'on' : ''}" onclick="state.cat=null;render()">Todas las categorías</button>
      ${cats.map((c, i) => `<button class="chip ${state.cat === c ? 'on' : ''}" onclick="state.cat=state.maestros.Categoria[${i}];render()">${esc(catLabel(c))}</button>`).join('')}
    </div>
    <div class="small muted">${nArt(lista.length)}</div>
    <div class="grid">${lista.map(a => `<a class="item" href="#articulo/${encodeURIComponent(a.id)}">${ph(a)}<div class="info"><div class="name">${esc(a.desc)}</div>
      ${doc && a.prestamo ? `<div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.prestamo.usuario)}</div><div class="small" style="color:var(--warn);font-weight:600">Hasta el ${fmt(a.prestamo.fin)}</div>` : ''}
      <div class="row" style="justify-content:space-between"><span class="id">${esc(a.id)}</span>${badge(a)}</div></div></a>`).join('')}</div>
    ${barraCesta()}
  </div>`;
}
function renderBusqueda() {
  const el = $('#q'), pos = el.selectionStart;
  render();
  const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos);
}
const badge = a => a.prestamo && a.prestamo.mio ? '<span class="badge b-info">En tu préstamo</span>'
  : { disp: '<span class="badge b-ok">Disponible</span>', prest: '<span class="badge b-warn">Prestado</span>', mant: '<span class="badge b-danger">Mantenimiento</span>', baja: '<span class="badge b-danger">Baja</span>' }[a.estado];

function vArticulo(id) {
  const a = state.articulos.find(x => x.id === id);
  if (!a) return '<p>No se encuentra el artículo.</p>';
  const doc = esDocente();
  let info = '';
  if (a.prestamo && a.prestamo.mio) info = `<div class="callout ok">Lo tienes tú en préstamo. Devuélvelo antes del <b>${fmt(a.prestamo.fin)}</b>.</div>`;
  else if (a.prestamo && doc) info = `<div class="callout warn">Prestado a <b>${esc(a.prestamo.usuario)}</b> hasta el <b>${fmt(a.prestamo.fin)}</b>.</div>`;
  else if (a.prestamo) info = `<div class="callout warn">No está disponible ahora. Vuelve al almacén hacia el <b>${fmt(a.prestamo.fin)}</b>.</div>`;
  else if (a.estado === 'mant') info = '<div class="callout warn">Está en mantenimiento.</div>';
  return `<div class="stack">
    <a href="#catalogo" class="small" style="color:var(--primary);text-decoration:none">← Catálogo</a>
    <div class="detail"><div class="ph azulejo" id="fotoGrande" ${a.foto ? `data-foto="${esc(a.id)}"` : ''}><span>${esc(catLabel(a.cat)).toUpperCase()}</span></div>
      <div class="stack">
        <div class="row wrap">${badge(a)}<span class="badge b-info">${esc(catLabel(a.cat))}</span></div>
        <h1>${esc(a.desc)}</h1><div class="muted">Código ${esc(a.id)}</div>
        ${doc && a.ubicacion ? `<div class="small"><span class="muted">Ubicación:</span> ${esc(a.ubicacion)}</div>` : ''}
        ${info}
        ${doc ? `<div class="two">
            <button class="btn" ${a.estado !== 'disp' ? 'disabled' : ''} onclick="prestarArticulo('${esc(a.id)}')">Prestar</button>
            ${a.prestamo ? `<a class="btn ghost" href="#prestamo/${encodeURIComponent(a.prestamo.id)}">Ver préstamo</a>` : '<span></span>'}
          </div>
          <div class="two">
            <select class="input" onchange="cambiarEstado('${esc(a.id)}', this.value)">${['Bueno', 'Mantenimiento', 'Baja'].map(e => `<option ${({ disp: 'Bueno', prest: 'Bueno', mant: 'Mantenimiento', baja: 'Baja' })[a.estado] === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
            <button class="btn danger" onclick="registrarIncidencia('${esc(a.id)}')">Registrar daño</button>
          </div>` : accionesAlumno(a)}
      </div></div></div>`;
}
async function cargarFotoGrande(id) {
  const a = state.articulos.find(x => x.id === id);
  if (!a || !a.foto) return;
  const pintarGrande = url => { const el = $('#fotoGrande'); if (!el) return; el.querySelectorAll('img').forEach(i => i.remove()); pintarFoto(el, url); };
  if (fotosGrandes[id]) return pintarGrande(fotosGrandes[id]);
  try {
    const res = await api('fotos', { ids: [id], tam: 'g' });
    if (res[id]) { fotosGrandes[id] = res[id]; pintarGrande(res[id]); }
  } catch (e) { console.warn('Foto grande', e); }
}

function vPerfil() {
  const u = state.usuario;
  return `<div class="stack"><h1>${esDocente() ? 'Perfil' : 'Mi perfil'}</h1>
    <div class="card stack" style="text-align:center">
      <div class="avatar" style="width:64px;height:64px;font-size:1.3rem;margin:0 auto">${initials(u.nombre ? u.nombre + ' ' + u.apellidos : u.email)}</div>
      <div><b>${esc([u.nombre, u.apellidos].join(' ').trim() || u.email)}</b><div class="small muted">${esc(u.email)}</div></div>
      <div><span class="badge b-info">${esc(u.rol)}</span></div>
    </div>
    <p class="note">Especialidad, curso y tu código QR: en la próxima versión.</p>
    <button class="btn ghost block" onclick="cerrarSesion()">Cerrar sesión</button></div>`;
}

function vPronto() {
  return `<div class="stack"><h1>Próximamente</h1><p class="muted">Esta sección llegará en las siguientes versiones.</p><a class="btn ghost" href="#catalogo">Ir al catálogo</a></div>`;
}

// ---------- Arranque ----------
async function arrancar() {
  $('#root').innerHTML = '<div class="login azulejo"><div class="box"><p class="muted">Cargando el catálogo…</p></div></div>';
  try {
    const yo = await api('yo');
    state.usuario = yo.usuario; state.maestros = yo.maestros;
    state.articulos = await api('catalogo');
    render();
  } catch (e) {
    if (e.message !== 'sin sesión' && state.usuario !== null) toast(e.message);
    if (!tokenGuardado()) return;
    $('#root').innerHTML = `<div class="login azulejo"><div class="box stack"><h1>No se ha podido cargar</h1><p class="muted">${esc(e.message)}</p><button class="btn" onclick="arrancar()">Reintentar</button><button class="btn ghost" onclick="cerrarSesion()">Cerrar sesión</button></div></div>`;
  }
}
// Actualización automática: cada minuto mientras la pestaña está visible y al volver a ella.
// Solo repinta pantallas de consulta y nunca mientras se escribe, se edita una solicitud o se cita.
const VISTAS_REFRESCABLES = new Set(['catalogo', 'articulo', 'inicio', 'solicitudes', 'mis', 'activos', 'incidencias', 'prestamo']);
let ultimaActualizacion = Date.now(), actualizando = false;
async function actualizarSolo() {
  if (!state.usuario || document.hidden || actualizando || Date.now() - ultimaActualizacion < 45000) return;
  actualizando = true;
  try {
    state.articulos = await api('catalogo');
    ultimaActualizacion = Date.now();
    if (typeof sol !== 'undefined') sol.lista = null;
    const [r] = ruta();
    const escribiendo = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    const ocupado = (typeof sol !== 'undefined' && sol.editando) || (typeof gs !== 'undefined' && gs.citando);
    if (VISTAS_REFRESCABLES.has(r) && !escribiendo && !ocupado) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  } catch (e) { /* se reintentará en el próximo ciclo */ } finally { actualizando = false; }
}
setInterval(actualizarSolo, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) actualizarSolo(); });

async function recargar() {
  try { state.articulos = await api('catalogo'); render(); toast('Catálogo actualizado'); } catch (e) { toast(e.message); }
}

function arranque() { if (tokenGuardado()) arrancar(); else vLogin(); }
