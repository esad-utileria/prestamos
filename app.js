// Préstamo de Utilería · ESAD Sevilla
// Web estática: inicia sesión con Google y habla con la API de Apps Script.

const C = window.CONFIG;
const state = { usuario: null, maestros: {}, articulos: [], q: '', cat: null, filtro: 'todos', cargando: false };
const fotosMem = {};       // 'p:versión' (miniatura) o 'g:versión' (ficha) -> data URL

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
  // Con cuentasExternas (solo en pruebas) decide el servidor, que admite únicamente las cuentas de su lista
  if (!C.cuentasExternas && payload.hd !== C.dominio) { vLogin('Entra con tu cuenta @' + C.dominio); return; }
  store.set('token', resp.credential);
  store.set('token_exp', String(payload.exp * 1000));
  arrancar();
}
function iniciarGoogle() {
  const opciones = { client_id: C.clientId, callback: alRecibirCredencial, auto_select: true, use_fedcm_for_prompt: true };
  if (!C.cuentasExternas) opciones.hd = C.dominio;
  google.accounts.id.initialize(opciones);
}
function cerrarSesion() {
  store.del('token'); store.del('token_exp');
  if (window.google) google.accounts.id.disableAutoSelect();
  state.usuario = null; location.hash = ''; vLogin();
}

// ---------- API ----------
// Buenas prácticas aplicadas:
// - Barra de progreso fina arriba mientras hay peticiones (solo si tardan más de 150 ms: sin parpadeos).
// - Las consultas se reintentan solas. Las escrituras llevan una clave de idempotencia: si la conexión
//   falla, se reintentan con la misma clave y el servidor no las ejecuta dos veces.
// - Una escritura idéntica que ya está en marcha (doble pulsación) no se envía otra vez.
// - Tras guardar algo, las listas en memoria se marcan como desfasadas.
const SOLO_LECTURA = new Set(['yo', 'catalogo', 'fotos', 'usuarios', 'prestamos', 'buscarCodigo', 'codigos', 'solicitudes', 'incidencias']);
const enVuelo = new Map(); // escrituras en marcha: clave -> promesa
let pendientesApi = 0, temporizadorBarra = null;
function progreso(delta) {
  pendientesApi += delta;
  const barra = document.getElementById('progreso');
  if (!barra) return;
  clearTimeout(temporizadorBarra);
  if (pendientesApi > 0) temporizadorBarra = setTimeout(() => barra.classList.add('on'), 150);
  else barra.classList.remove('on');
}
const nuevaClave = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function api(accion, datos) {
  if (SOLO_LECTURA.has(accion)) return llamar(accion, datos, null);
  const clave = accion + JSON.stringify(datos || {});
  if (enVuelo.has(clave)) return enVuelo.get(clave);
  const p = llamar(accion, datos, nuevaClave()).then(r => { cacheDatos.clear(); return r; }).finally(() => enVuelo.delete(clave));
  enVuelo.set(clave, p);
  return p;
}

async function llamar(accion, datos, idem, intento = 1) {
  if (!C.apiUrl) throw new Error('Falta configurar la URL de la API en config.js');
  const token = tokenGuardado();
  if (!token) { vLogin('Tu sesión ha caducado. Vuelve a entrar.'); throw new Error('sin sesión'); }
  let res;
  progreso(1);
  try {
    const r = await fetch(C.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita la comprobación CORS previa
      body: JSON.stringify({ accion, token, datos: datos || {}, idem })
    });
    const texto = await r.text();
    try { res = JSON.parse(texto); } catch (e) {
      // A veces Google devuelve una página de error HTML (servidor saturado o reiniciándose): se reintenta
      console.warn('Respuesta no JSON de la API', accion, r.status, texto.slice(0, 200));
      throw new Error('respuesta no válida');
    }
  } catch (e) {
    // Consultas y escrituras con clave de idempotencia se pueden repetir sin riesgo de duplicar nada
    if (intento < 3 && navigator.onLine !== false) { await new Promise(ok => setTimeout(ok, 800 * intento)); return llamar(accion, datos, idem, intento + 1); }
    throw new Error(navigator.onLine === false ? 'Sin conexión. Comprueba la red e inténtalo de nuevo.'
      : idem ? 'El servidor no ha confirmado la operación. Inténtalo de nuevo: no se duplicará.'
      : 'El servidor no ha respondido. Comprueba la conexión e inténtalo de nuevo.');
  } finally { progreso(-1); }
  if (!res.ok) {
    if (res.codigo === 401 || (res.codigo === 403 && !state.usuario)) { store.del('token'); vLogin(res.error); }
    // 409: la web tenía datos desfasados (otra persona cambió algo). Se ponen al día antes de avisar.
    if (res.codigo === 409) await sincronizar();
    const err = new Error(res.error); err.codigo = res.codigo;
    throw err;
  }
  return res.datos;
}

// ---------- Datos frescos ----------
// Sin refresco por temporizador. Patrón "stale-while-revalidate":
// - Cada pantalla pinta al instante lo último que se sabe (si lo hay) y a la vez lo pide al servidor.
//   Si llega algo distinto, se repinta sin perder la posición… salvo si la persona está escribiendo
//   o editando: entonces aparece un aviso discreto «Hay datos nuevos · Actualizar».
// - El catálogo se revalida al navegar (si tiene más de 30 s), al volver a la app y al recuperar la conexión.
// - Y lo esencial: el servidor comprueba cada operación contra la hoja real (bajo bloqueo) y, si la web
//   estaba desfasada, responde 409 sin aplicar nada; la web se pone al día y lo explica.
let catalogoEn = 0, revalidando = null, ocultaDesde = 0;
const cacheDatos = new Map(); // clave -> datos ya pintados
function revalidarCatalogo(forzar) {
  if (revalidando) return revalidando;
  if (!forzar && Date.now() - catalogoEn < 30000) return Promise.resolve(false);
  revalidando = (async () => {
    try {
      const antes = JSON.stringify(state.articulos);
      state.articulos = await api('catalogo'); catalogoEn = Date.now();
      return JSON.stringify(state.articulos) !== antes;
    } finally { revalidando = null; }
  })();
  return revalidando;
}
async function sincronizar() {
  try { await revalidarCatalogo(true); } catch (e) { /* se queda el catálogo anterior */ }
  if (typeof sol !== 'undefined') sol.lista = null;
  if (typeof gs !== 'undefined') gs.lista = null;
  cacheDatos.clear();
}
const ocupadoEditando = () => {
  const el = document.activeElement;
  return (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && el.id !== 'q')
    || (typeof sol !== 'undefined' && (sol.editando || sol.respondiendo)) || (typeof gs !== 'undefined' && gs.citando);
};
function repintar() { avisoDatosNuevos(null); const y = window.scrollY; render(); window.scrollTo(0, y); }
// Repinta la pantalla actual si es una de `vistas`; si la persona está editando, solo avisa
function repintarSiSeguro(vistas) {
  if (!vistas.has(ruta()[0])) return;
  if (ocupadoEditando()) avisoDatosNuevos(repintar); else repintar();
}
function avisoDatosNuevos(accion) {
  let el = document.getElementById('datosNuevos');
  if (!accion) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('button'); el.id = 'datosNuevos'; el.className = 'aviso-nuevos'; el.textContent = 'Hay datos nuevos · Actualizar'; document.body.appendChild(el); }
  el.onclick = accion;
}
// Pinta los datos de una pantalla con stale-while-revalidate. `cargar` los pide al servidor y `pintar`
// los dibuja en su contenedor. Si la persona cambia de pantalla mientras tanto, no se pinta nada.
async function datosAlDia(clave, cargar, pintar) {
  const hash = location.hash, previos = cacheDatos.get(clave);
  if (previos !== undefined) pintar(previos);
  let nuevos;
  try { nuevos = await cargar(); }
  catch (e) { if (previos === undefined) throw e; toast(e.message); return previos; }
  cacheDatos.set(clave, nuevos);
  if (location.hash !== hash) return nuevos;
  if (previos === undefined) pintar(nuevos);
  else if (JSON.stringify(previos) !== JSON.stringify(nuevos)) {
    if (ocupadoEditando()) avisoDatosNuevos(() => { avisoDatosNuevos(null); pintar(nuevos); });
    else { const y = window.scrollY; pintar(nuevos); window.scrollTo(0, y); }
  }
  return nuevos;
}
// Filas grises mientras llega algo que nunca se había cargado (en lugar de un "Cargando…")
const esqueleto = (n = 3) => `<div class="list">${Array.from({ length: n }, () => '<div class="li esq"><div class="esq-b" style="width:40px;height:40px;border-radius:50%"></div><div class="grow"><div class="esq-b" style="width:60%"></div><div class="esq-b" style="width:35%;margin-top:6px"></div></div></div>').join('')}</div>`;

// Tras un error: avisa y, si era un conflicto (409), repinta con los datos ya actualizados
function fallo(e) {
  toast(e.message);
  if (e.codigo === 409) repintar();
}

// ---------- Fotos ----------
// Si las fotos son públicas por enlace (lo normal), se cargan directamente de los servidores de imágenes
// de Google: es lo más rápido y el navegador las guarda en su caché. Si alguna falla (o no son públicas),
// se piden a la API como antes, con tres niveles: memoria, IndexedDB (este dispositivo) y servidor.
// La clave lleva la versión de la foto (su ID en Drive), así que al sustituirla la antigua deja de usarse.
const urlPublica = (a, tam = 'p') => state.fotosPublicas && a && a.foto ? `https://lh3.googleusercontent.com/d/${encodeURIComponent(a.foto)}=w${tam === 'g' ? 1000 : 320}` : null;
function pintarPublica(el, url) {
  if (el.querySelector('img')) return;
  const img = new Image(); img.alt = ''; img.decoding = 'async';
  img.onerror = () => { img.remove(); el.dataset.sinPublica = '1'; pedirFoto(el.dataset.foto); };
  img.src = url; el.appendChild(img);
}
const claveFoto = (a, tam = 'p') => a && a.foto ? tam + ':' + a.foto : null;
const artDe = id => state.articulos.find(a => a.id === id);

const bdFotos = {
  _db: null,
  abrir() {
    if (!this._db) this._db = new Promise(ok => {
      try {
        const r = indexedDB.open('utileria-fotos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('fotos');
        r.onsuccess = () => ok(r.result);
        r.onerror = r.onblocked = () => ok(null);
      } catch (e) { ok(null); }
    });
    return this._db;
  },
  async leer(claves) {
    const res = {}, db = await this.abrir();
    if (!db || !claves.length) return res;
    return new Promise(ok => {
      try {
        const t = db.transaction('fotos'), s = t.objectStore('fotos');
        claves.forEach(k => { const r = s.get(k); r.onsuccess = () => { if (r.result) res[k] = r.result; }; });
        t.oncomplete = t.onerror = t.onabort = () => ok(res);
      } catch (e) { ok(res); }
    });
  },
  async guardar(pares) {
    const db = await this.abrir();
    if (!db) return;
    try { const t = db.transaction('fotos', 'readwrite'), s = t.objectStore('fotos'); Object.keys(pares).forEach(k => s.put(pares[k], k)); } catch (e) { /* sin espacio: no pasa nada */ }
  },
  // Borra las fotos de versiones que ya no están en el catálogo
  async limpiar(validas) {
    const db = await this.abrir();
    if (!db) return;
    try {
      const s = db.transaction('fotos', 'readwrite').objectStore('fotos');
      const r = s.getAllKeys(); r.onsuccess = () => r.result.forEach(k => { if (!validas.has(k)) s.delete(k); });
    } catch (e) { /* nada */ }
  }
};

const colaFotos = new Map(); // id de artículo -> clave
let temporizador = null, descargando = 0;
const observador = 'IntersectionObserver' in window ? new IntersectionObserver(entradas => {
  entradas.forEach(e => { if (e.isIntersecting) { observador.unobserve(e.target); cargarFotoDe(e.target); } });
}, { rootMargin: '400px' }) : null;

function pedirFoto(id) {
  const k = claveFoto(artDe(id));
  if (!k) return;
  if (fotosMem[k]) return pintarFotosDe(id);
  colaFotos.set(id, k);
  clearTimeout(temporizador);
  temporizador = setTimeout(procesarCola, 30);
}
async function procesarCola() {
  const lote = [...colaFotos]; colaFotos.clear();
  if (!lote.length) return;
  const guardadas = await bdFotos.leer(lote.map(([, k]) => k));
  Object.assign(fotosMem, guardadas);
  lote.forEach(([id, k]) => guardadas[k] && pintarFotosDe(id));
  const faltan = lote.filter(([, k]) => !guardadas[k]);
  for (let i = 0; i < faltan.length; i += 40) descargarFotos(faltan.slice(i, i + 40));
}
async function descargarFotos(lote, tam = 'p') {
  descargando++;
  try {
    const res = await api('fotos', { ids: lote.map(([id]) => id), tam });
    const nuevas = {};
    lote.forEach(([id, k]) => { if (res[id]) { fotosMem[k] = nuevas[k] = res[id]; pintarFotosDe(id); } });
    bdFotos.guardar(nuevas);
  } catch (e) { console.warn('Fotos', e); } finally { descargando--; }
}
function pintarFotosDe(id) {
  const url = fotosMem[claveFoto(artDe(id))];
  if (url) document.querySelectorAll(`[data-foto="${CSS.escape(id)}"]`).forEach(el => el.id !== 'fotoGrande' && pintarFoto(el, url));
}
function pintarFoto(el, url) {
  const img = el.querySelector('img');
  if (img) { if (img.src !== url) img.src = url; return; }
  const n = new Image(); n.alt = ''; n.src = url; el.appendChild(n);
}
// Foto que se acerca a la pantalla: la URL pública si la hay; si no (o si falla), a través de la API
function cargarFotoDe(el) {
  const a = artDe(el.dataset.foto), k = claveFoto(a), url = urlPublica(a);
  if (k && fotosMem[k]) pintarFoto(el, fotosMem[k]);
  else if (url && !el.dataset.sinPublica) pintarPublica(el, url);
  else pedirFoto(el.dataset.foto);
}
function observarFotos() {
  document.querySelectorAll('[data-foto]').forEach(el => {
    if (el.id === 'fotoGrande') return;
    const k = claveFoto(artDe(el.dataset.foto));
    if (k && fotosMem[k]) pintarFoto(el, fotosMem[k]);
    else if (observador) observador.observe(el); else cargarFotoDe(el);
  });
}
// Precarga en segundo plano el resto de miniaturas (una petición cada vez, sin estorbar a las visibles)
async function precargarFotos() {
  if (navigator.connection && navigator.connection.saveData) return;
  const todas = state.articulos.filter(a => a.foto);
  if (state.fotosPublicas) {
    // Se descargan en reposo para que el catálogo salga al instante al desplazarse
    const urls = todas.map(a => urlPublica(a));
    const siguiente = () => { const u = urls.shift(); if (!u) return; const i = new Image(); i.decoding = 'async'; i.onload = i.onerror = () => (window.requestIdleCallback || setTimeout)(siguiente); i.src = u; };
    for (let n = 0; n < 4; n++) siguiente();
    return;
  }
  bdFotos.limpiar(new Set(todas.flatMap(a => [claveFoto(a), claveFoto(a, 'g')])));
  const guardadas = await bdFotos.leer(todas.map(a => claveFoto(a)).filter(k => !fotosMem[k]));
  Object.assign(fotosMem, guardadas);
  const faltan = todas.filter(a => !fotosMem[claveFoto(a)]).map(a => [a.id, claveFoto(a)]);
  for (let i = 0; i < faltan.length; i += 40) {
    while (descargando) await new Promise(ok => setTimeout(ok, 300));
    await descargarFotos(faltan.slice(i, i + 40).filter(([, k]) => !fotosMem[k]));
  }
}
// Foto que acaba de hacer un docente: se guarda ya en este dispositivo para no esperar a Drive
async function fotoLocal(version, dataUrl) {
  const reducir = max => new Promise(ok => {
    const img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); ok(cv.toDataURL('image/jpeg', 0.8)); };
    img.onerror = () => ok(null); img.src = dataUrl;
  });
  const [p, g] = await Promise.all([reducir(320), reducir(1000)]);
  const pares = {};
  if (p) fotosMem['p:' + version] = pares['p:' + version] = p;
  if (g) fotosMem['g:' + version] = pares['g:' + version] = g;
  bdFotos.guardar(pares);
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
        ${doc && a.observaciones ? `<div class="small"><span class="muted">Observaciones:</span> ${esc(a.observaciones)}</div>` : ''}
        ${info}
        ${doc ? `<a class="btn ghost block" href="#editar/${encodeURIComponent(a.id)}">✎ Editar foto y datos</a>` : ''}
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
async function cargarFotoGrande(id, sinPublica) {
  const a = artDe(id);
  if (!a || !a.foto) return;
  const pintarGrande = url => { const el = $('#fotoGrande'); if (el && el.dataset.foto === id) pintarFoto(el, url); };
  const k = claveFoto(a, 'g');
  // Mientras llega la grande, se ve la miniatura (si ya está)
  if (fotosMem[claveFoto(a)]) pintarGrande(fotosMem[claveFoto(a)]);
  if (fotosMem[k]) return pintarGrande(fotosMem[k]);
  if (state.fotosPublicas && !sinPublica) {
    if (!fotosMem[claveFoto(a)]) pintarGrande(urlPublica(a));
    const grande = new Image();
    grande.onload = () => pintarGrande(grande.src);
    grande.onerror = () => cargarFotoGrande(id, true); // si no es pública, se pide a la API
    grande.src = urlPublica(a, 'g');
    return;
  }
  if (!fotosMem[k]) Object.assign(fotosMem, await bdFotos.leer([k]));
  if (fotosMem[k]) return pintarGrande(fotosMem[k]);
  try {
    const res = await api('fotos', { ids: [id], tam: 'g' });
    if (res[id]) { fotosMem[k] = res[id]; bdFotos.guardar({ [k]: res[id] }); pintarGrande(res[id]); }
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
    state.usuario = yo.usuario; state.maestros = yo.maestros; state.fotosPublicas = !!yo.fotosPublicas;
    await revalidarCatalogo(true);
    render();
    setTimeout(precargarFotos, 1500);
  } catch (e) {
    if (e.message !== 'sin sesión' && state.usuario !== null) toast(e.message);
    if (!tokenGuardado()) return;
    $('#root').innerHTML = `<div class="login azulejo"><div class="box stack"><h1>No se ha podido cargar</h1><p class="muted">${esc(e.message)}</p><button class="btn" onclick="arrancar()">Reintentar</button><button class="btn ghost" onclick="cerrarSesion()">Cerrar sesión</button></div></div>`;
  }
}
// Al navegar: el catálogo se revalida en segundo plano si tiene más de 30 s y, si ha cambiado,
// se repintan las pantallas que lo muestran. Las demás piden sus datos al montarse.
const VISTAS_CATALOGO = new Set(['catalogo', 'articulo']);
// Al volver a la app tras un rato fuera: se repintan también las listas (que se vuelven a pedir)
const VISTAS_CONSULTA = new Set(['catalogo', 'articulo', 'inicio', 'solicitudes', 'solicitud', 'mis', 'activos', 'incidencias', 'prestamo']);
window.addEventListener('hashchange', () => {
  if (state.usuario) revalidarCatalogo().then(cambio => { if (cambio) repintarSiSeguro(VISTAS_CATALOGO); }).catch(() => {});
});
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { ocultaDesde = Date.now(); return; }
  if (!state.usuario || Date.now() - ocultaDesde < 60000) return;
  // Sin vaciar nada: la pantalla sigue visible y se actualiza al llegar los datos (stale-while-revalidate)
  try { await revalidarCatalogo(true); repintarSiSeguro(VISTAS_CONSULTA); } catch (e) { /* sin conexión: se intentará al navegar */ }
});

// Sin conexión: aviso fijo; al volver, se ponen al día los datos
function avisoConexion() {
  let el = document.getElementById('sinConexion');
  if (navigator.onLine !== false) { if (el) { el.remove(); revalidarCatalogo(true).then(() => repintarSiSeguro(VISTAS_CONSULTA)).catch(() => {}); } return; }
  if (!el) { el = document.createElement('div'); el.id = 'sinConexion'; el.className = 'aviso-red'; el.textContent = 'Sin conexión: puedes consultar lo cargado, pero no guardar cambios'; document.body.appendChild(el); }
}
window.addEventListener('online', avisoConexion);
window.addEventListener('offline', avisoConexion);

async function recargar() {
  try { await revalidarCatalogo(true); render(); toast('Catálogo actualizado'); } catch (e) { toast(e.message); }
}

function arranque() { if (tokenGuardado()) arrancar(); else vLogin(); }
