// Escáner de códigos: cámara en vivo y, como alternativa, escribir el código o usar un lector
// USB/Bluetooth (funciona como un teclado: escribe y pulsa Intro).
//
// Motor de lectura: el BarcodeDetector nativo del navegador (Android/Chrome, muy rápido) y ZXing-C++ en
// WebAssembly (barcode-detector), que es el único en iPhone y ordenadores y en Android entra a relevos con
// el nativo si este tarda en leer. Se pide a la cámara alta resolución, enfoque continuo y zoom ×2 (las
// etiquetas son de 50 × 10 mm: de cerca no enfocan y de lejos las barras se funden), y se analiza a
// resolución completa la parte del vídeo que se ve. Cada sesión deja un diagnóstico en el Log.
//
// Qué se da por leído (como una pistola lectora): solo el código que está bajo la línea roja del centro
// (o el único que se ve). Se leen todos los formatos habituales, como en AppSheet (cajas con ITF-14,
// UPC, Code 39…), pero si hay varios se prefiere el que tiene sentido en esa pantalla (etiqueta ARTnnn,
// artículo conocido o EAN; en el paso 1 de Prestar solo vale el QR de una persona). Modo «tocar» (por
// defecto): el marco se pone verde y enseña el código apuntado, y se lee al tocar el vídeo (o con
// Espacio/Intro en el ordenador). Modo «automático»: se lee cuando el mismo código sigue bajo la línea
// 3 fotogramas seguidos (5 si no es una etiqueta ni un artículo conocido, por si es una lectura falsa).

const MOTOR_ZXING = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.1/dist/iife/ponyfill.js';
// Todos los formatos de producto y logística. Las lecturas falsas de textos cercanos (sobre todo Code 39)
// ya no molestan: solo se lee al tocar o, en automático, si el código se mantiene bajo la línea.
const FORMATOS = ['code_128', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_39', 'code_93', 'codabar', 'data_matrix'];
const CANDIDATO_MS = 700; // un código apuntado sigue valiendo para «tocar» hasta 0,7 s después de verlo…
// …o hasta 4 fotogramas en equipos lentos, donde cada fotograma tarda más (si no, nunca llegaría a ESTABLE)
const vigencia = a => Math.max(CANDIDATO_MS, (a.msZxing || 0) * 4);
const ESTABLE = 3;        // modo automático: fotogramas seguidos con el mismo código bajo la línea…
const ESTABLE_OTRO = 5;   // …o con un código que no es etiqueta, EAN ni artículo conocido

const Escaner = {
  activo: null,   // { flujo, video, pista, detectores, temporizador, vuelta, fallos, est }
  ultimo: '',
  ultimoT: 0,
  alLeer: null,
  encendiendo: false,
  pendiente: false,
  zoom: 1,
  camaras: [],    // cámaras del dispositivo, traseras primero (se conocen tras dar permiso)
  tipo: 'articulo', // qué códigos valen en la pantalla actual: 'articulo' o 'persona'
  modo: (() => { try { return localStorage.getItem('camaraModo') === 'auto' ? 'auto' : 'tocar'; } catch (e) { return 'tocar'; } })(),

  // Marcado del escáner. Tras pintarlo hay que llamar a Escaner.montar(alLeer, tipo).
  html(pista) {
    return `<div class="camara" id="camara"><div class="camara-off"><button class="btn" onclick="Escaner.encender()">Activar cámara</button><div class="small" style="color:#fff;margin-top:8px">${esc(pista)}</div></div></div>
      <form class="row" onsubmit="event.preventDefault();Escaner.manual()">
        <input class="input" id="codigoManual" placeholder="O escribe el código / usa el lector" autocomplete="off" autocapitalize="characters">
        <button class="btn ghost" type="submit">Añadir</button>
      </form>`;
  },

  montar(alLeer, tipo = 'articulo') {
    this.alLeer = alLeer; this.tipo = tipo;
    try { if (localStorage.getItem('camara') === 'si') this.encender(); } catch (e) { /* sin almacenamiento */ }
  },

  async encender() {
    const caja = document.getElementById('camara');
    // Una cámara cuyo vídeo ya no está en la página es huérfana: se apaga antes de abrir otra
    if (this.activo && !document.body.contains(this.activo.video)) this.apagar(false);
    if (this.encendiendo) { this.pendiente = true; return; } // se repetirá al acabar el encendido en curso
    if (this.activo || !caja) return;
    this.encendiendo = true;
    caja.innerHTML = '<div class="camara-off"><div class="small" style="color:#fff">Iniciando cámara…</div></div>';
    let flujo;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('este navegador no permite usar la cámara (¿la página no es https?)');
      const motor = prepararDetector(); // se carga a la vez que se abre la cámara
      flujo = await conLimite(abrirCamara(), 10000, 'la cámara no responde. Ciérrala en otras aplicaciones o pestañas y reintenta');
      this.camaras = await camarasDisponibles();
      flujo = await conLimite(camaraConEnfoque(flujo, this.camaras), 15000, 'la cámara no responde. Ciérrala en otras aplicaciones o pestañas y reintenta');
      if (!document.body.contains(caja)) { detener(flujo); return; } // se cambió de pantalla mientras tanto
      const pista = flujo.getVideoTracks()[0];
      await ajustarCamara(pista);
      caja.innerHTML = `<video id="camaraVideo" playsinline muted autoplay></video><div class="camara-marco" id="camaraMarco"><div class="camara-mira"></div></div>
        <button class="camara-apunta" id="camaraApunta" onclick="Escaner.disparar()"></button>
        <div class="camara-botones"><button class="btn ghost sm" id="camaraModo" onclick="Escaner.cambiarModo()"></button><button class="btn ghost sm" id="camaraLente" hidden onclick="Escaner.cambiarCamara()">Cámara 1</button><button class="btn ghost sm" id="camaraLuz" hidden onclick="Escaner.luz()">Linterna</button><button class="btn ghost sm" id="camaraZoom" hidden onclick="Escaner.cambiarZoom()">Zoom ×1</button><button class="btn ghost sm" onclick="Escaner.apagar()">Parar</button></div>
        <div class="camara-info" id="camaraInfo"></div>`;
      const video = caja.querySelector('video');
      video.srcObject = flujo;
      await conLimite(video.play(), 5000, 'el vídeo de la cámara no arranca');
      const detectores = await conLimite(motor, 20000, 'no se ha podido cargar el lector de códigos. Revisa la conexión');
      if (!document.body.contains(video)) { detener(flujo); return; }
      this.activo = { flujo, video, pista, detectores, temporizador: 0, vuelta: 0, fallos: 0,
        est: { inicio: Date.now(), fotogramas: 0, ms: 0, lecturas: 0, primera: 0, nativo: 0, zxing: 0, vistos: {} } };
      if (!detectores.zxing) cargarZxing(detectores); // refuerzo listo por si el nativo no lee
      await this.ponerZoom(zoomPreferido(pista));
      // Tocar el vídeo: lee el código apuntado (modo tocar) o, si no hay ninguno, enfoca en ese punto
      video.onclick = ev => { if (this.modo === 'tocar' && this.candidatoVigente()) this.disparar(); else this.enfocar(ev); };
      this.mostrarControles();
      try { localStorage.setItem('camara', 'si'); } catch (e) { /* sin almacenamiento */ }
      this.analizar();
    } catch (e) {
      if (flujo && !this.activo) detener(flujo);
      if (document.body.contains(caja)) caja.innerHTML = `<div class="camara-off"><div class="small" style="color:#fff">No se puede usar la cámara: ${esc(mensajeCamara(e))}</div><button class="btn ghost sm" style="margin-top:8px" onclick="Escaner.encender()">Reintentar</button></div>`;
    } finally {
      this.encendiendo = false;
      if (this.pendiente) { this.pendiente = false; if (!this.activo && document.getElementById('camara')) this.encender(); }
    }
  },

  // Bucle de lectura: un fotograma cada vez, sin solapar análisis.
  async analizar() {
    const a = this.activo;
    if (!a || this.activo !== a) return;
    if (!document.body.contains(a.video)) { this.apagar(false); return; }
    let espera = 60;
    if (!document.hidden && a.video.readyState >= 2 && a.video.videoWidth) {
      try {
        const d = a.detectores, n = ++a.vuelta;
        // Con lector nativo, ZXing solo entra un fotograma de cada cuatro cuando el nativo lleva un rato sin leer
        const usarZxing = !d.nativo || (a.fallos > 10 && n % 4 === 0 && !!d.zxing);
        const detector = usarZxing ? d.zxing : d.nativo;
        if (detector) {
          // ZXing solo lee códigos de barras casi horizontales: prueba también con el fotograma girado
          // En equipos lentos (p. ej. Surface Go) se analiza menos imagen y se prueban menos giros
          const giros = a.ligero ? GIROS_LIGERO : GIROS;
          const giro = usarZxing ? giros[Math.floor(n / (d.nativo ? 4 : 1)) % giros.length] : 0;
          const t0 = performance.now();
          const lienzo = recorteVisible(a.video, giro, a.ligero ? ANCHO_LIGERO : MAX_ANCHO);
          const codigos = await detector.detect(lienzo);
          const ms = performance.now() - t0;
          a.est.fotogramas++; a.est.ms += ms;
          if (usarZxing) {
            a.msZxing = a.msZxing ? a.msZxing * 0.8 + ms * 0.2 : ms;
            if (!a.ligero && !d.nativo && a.est.fotogramas >= 6 && a.msZxing > LENTO_MS) { a.ligero = true; a.est.ligero = true; this.mostrarControles(); }
          }
          anotarVistos(a.est, codigos);
          const cand = elegirCandidato(codigos, lienzo.width, lienzo.height, this.tipo);
          if (cand && this.activo === a) {
            a.fallos = 0; a.est[usarZxing ? 'zxing' : 'nativo']++;
            if (this.verCandidato(a, cand)) espera = 400;
          } else a.fallos++;
        }
      } catch (e) { espera = 300; /* un fotograma que no se pudo leer: se sigue con el siguiente */ }
    } else espera = 200;
    if (a.cand && Date.now() - a.cand.t > vigencia(a)) { a.cand = null; this.pintarCandidato(); }
    if (this.activo === a) a.temporizador = setTimeout(() => this.analizar(), espera);
  },

  // Un código apuntado en este fotograma. Devuelve true si se ha dado por leído (modo automático).
  verCandidato(a, cand) {
    const ahora = Date.now();
    if (a.cand && a.cand.valor === cand.valor) { a.cand.veces++; a.cand.t = ahora; a.cand.centrado = cand.centrado; }
    else a.cand = { valor: cand.valor, veces: 1, t: ahora, centrado: cand.centrado, conocido: cand.conocido };
    this.pintarCandidato();
    if (this.modo === 'auto' && cand.centrado && a.cand.veces >= (cand.conocido ? ESTABLE : ESTABLE_OTRO)) { this.aceptar(a, a.cand.valor, false); return true; }
    return false;
  },
  candidatoVigente() { const a = this.activo; return a && a.cand && Date.now() - a.cand.t < vigencia(a) ? a.cand : null; },
  // Gatillo: lee el código que está apuntado ahora mismo
  disparar() {
    const a = this.activo, c = this.candidatoVigente();
    if (!c) { toast('Apunta la línea roja al código'); return; }
    this.aceptar(a, c.valor, true);
  },
  aceptar(a, valor, gatillo) {
    a.est.lecturas++;
    if (!a.est.primera) a.est.primera = Date.now() - a.est.inicio;
    a.cand = null; this.pintarCandidato();
    this.leido(valor, false, gatillo);
  },
  pintarCandidato() {
    const a = this.activo, c = a && a.cand, marco = document.getElementById('camaraMarco'), b = document.getElementById('camaraApunta');
    if (marco) marco.classList.toggle('apunta', !!c);
    if (!b) return;
    b.classList.toggle('on', !!c);
    b.textContent = c ? c.valor + (this.modo === 'tocar' ? ' · Toca para leer' : '')
      : this.modo === 'tocar' ? 'Apunta la línea roja al código y toca' : 'Apunta la línea roja al código';
  },
  cambiarModo() {
    this.modo = this.modo === 'tocar' ? 'auto' : 'tocar';
    try { localStorage.setItem('camaraModo', this.modo); } catch (e) { /* sin almacenamiento */ }
    this.mostrarControles();
  },

  mostrarControles() {
    const a = this.activo; if (!a) return;
    const cap = capacidades(a.pista), ajustes = a.pista.getSettings ? a.pista.getSettings() : {};
    const luz = document.getElementById('camaraLuz'), zoom = document.getElementById('camaraZoom');
    if (luz) luz.hidden = !cap.torch;
    const modo = document.getElementById('camaraModo');
    if (modo) modo.textContent = this.modo === 'tocar' ? 'Modo: tocar' : 'Modo: automático';
    this.pintarCandidato();
    const lente = document.getElementById('camaraLente'), n = this.camaras.length;
    if (lente && n > 1) { lente.hidden = false; lente.textContent = 'Cámara ' + (indiceCamara(this.camaras, ajustes.deviceId) + 1) + '/' + n; }
    if (zoom && cap.zoom && cap.zoom.max >= 2) { zoom.hidden = false; zoom.textContent = 'Zoom ×' + redondo(this.zoom); }
    const info = document.getElementById('camaraInfo');
    if (info) info.textContent = (ajustes.width || a.video.videoWidth) + '×' + (ajustes.height || a.video.videoHeight) + ' · ' + nombreMotor(a.detectores) + (a.ligero ? ' ligero' : '') + (cap.zoom ? ' · ×' + redondo(this.zoom) : '');
  },

  async luz() {
    const a = this.activo; if (!a) return;
    a.linterna = !a.linterna;
    try { await a.pista.applyConstraints({ advanced: [{ torch: a.linterna }] }); } catch (e) { a.linterna = false; }
    const b = document.getElementById('camaraLuz'); if (b) b.classList.toggle('activo', !!a.linterna);
  },

  // Con zoom se puede alejar el móvil: muchas cámaras no enfocan a menos de 10–20 cm. Rota ×1 → ×2 → ×3
  // (según lo que admita la cámara) y recuerda la elección en este dispositivo.
  async cambiarZoom() {
    const a = this.activo; if (!a) return;
    const cap = capacidades(a.pista).zoom; if (!cap) return;
    const niveles = [1, 2, 3].filter(z => z <= cap.max);
    const nuevo = niveles[(niveles.indexOf(Math.round(this.zoom)) + 1) % niveles.length] || 1;
    await this.ponerZoom(nuevo);
    try { localStorage.setItem('camaraZoom', String(nuevo)); } catch (e) { /* sin almacenamiento */ }
    this.mostrarControles();
  },

  // Los móviles con varias cámaras traseras (gran angular, ultra gran angular, tele) no siempre abren la
  // mejor para leer de cerca: este botón pasa a la siguiente y el dispositivo recuerda la elección.
  async cambiarCamara() {
    const a = this.activo; if (!a || this.camaras.length < 2) return;
    const actual = indiceCamara(this.camaras, (a.pista.getSettings ? a.pista.getSettings() : {}).deviceId);
    const siguiente = this.camaras[(actual + 1) % this.camaras.length];
    guardarCamara(siguiente.deviceId);
    this.apagar(false);
    await this.encender();
  },

  async ponerZoom(z) {
    const a = this.activo; if (!a) return;
    const cap = capacidades(a.pista).zoom; if (!cap || !z) return;
    const valor = Math.min(Math.max(z, cap.min || 1), cap.max);
    try { await a.pista.applyConstraints({ advanced: [{ zoom: valor }] }); this.zoom = valor; } catch (e) { /* sin zoom */ }
  },

  // Tocar el vídeo enfoca en ese punto (si la cámara lo admite) y vuelve después al enfoque continuo.
  async enfocar(ev) {
    const a = this.activo; if (!a) return;
    const modos = capacidades(a.pista).focusMode || [];
    if (!modos.includes('single-shot')) return;
    const r = a.video.getBoundingClientRect();
    const punto = { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    try {
      await a.pista.applyConstraints({ advanced: [{ focusMode: 'single-shot', pointsOfInterest: [punto] }] });
      setTimeout(() => { if (this.activo === a && modos.includes('continuous')) a.pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}); }, 1500);
    } catch (e) { /* no lo admite */ }
  },

  apagar(recordar = true) {
    const a = this.activo; this.activo = null;
    if (recordar) { try { localStorage.setItem('camara', 'no'); } catch (e) { /* sin almacenamiento */ } }
    if (a) { clearTimeout(a.temporizador); enviarDiagnostico(a, this.zoom); detener(a.flujo); a.video.srcObject = null; }
    const caja = document.getElementById('camara');
    if (caja && recordar) caja.innerHTML = '<div class="camara-off"><button class="btn" onclick="Escaner.encender()">Activar cámara</button></div>';
  },

  // Al cambiar de pantalla se apaga sin olvidar la preferencia de la persona.
  parar() { this.pendiente = false; if (this.activo) this.apagar(false); },

  manual() {
    const el = document.getElementById('codigoManual');
    const v = el.value.trim();
    if (v) { this.leido(v, true); el.value = ''; el.focus(); }
  },

  // manual: escrito o con lector USB. gatillo: la persona ha tocado para leerlo (vale aunque se repita).
  leido(txt, manual, gatillo) {
    const codigo = String(txt).trim().toUpperCase();
    const ahora = Date.now();
    if (!manual && !gatillo && codigo === this.ultimo && ahora - this.ultimoT < 2500) return; // misma etiqueta aún delante de la cámara
    this.ultimo = codigo; this.ultimoT = ahora;
    pitido();
    const marco = document.getElementById('camaraMarco');
    if (marco && !manual) { marco.classList.remove('leido'); void marco.offsetWidth; marco.classList.add('leido'); }
    if (this.alLeer) this.alLeer(codigo);
  }
};

// Qué código del fotograma se toma: el que cruza el centro (la línea roja) o, si no lo cruza ninguno, el
// único que haya. Si hay varios, mandan los «conocidos» (etiqueta ARTnnn, EAN o artículo del catálogo).
// En la pantalla de personas solo vale el QR con un correo. Los de menos de 4 caracteres se ignoran:
// suelen ser lecturas falsas de textos.
const EAN = /^\d{8}$|^\d{12,14}$/;
function codigoConocido(v) {
  return /^ART\d{3,}$/i.test(v) || EAN.test(v) || (typeof state !== 'undefined' && state.articulos.some(a => a.id.toUpperCase() === v.toUpperCase()));
}
function elegirCandidato(codigos, w, h, tipo) {
  // El ITF de las cajas es de 14 cifras: uno más corto suele ser un trozo mal leído del mismo código
  let todos = codigos.map(c => ({ valor: String(c.rawValue || '').trim(), caja: c.boundingBox, itf: c.format === 'itf' }))
    .filter(c => c.valor.length >= 4 && (!c.itf || c.valor.length >= 14))
    .map(c => ({ ...c, conocido: tipo === 'persona' ? /^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(c.valor) : codigoConocido(c.valor) }));
  if (tipo === 'persona') todos = todos.filter(c => c.conocido);
  if (!todos.length) return null;
  const conocidos = todos.filter(c => c.conocido), validos = conocidos.length ? conocidos : todos;
  const cx = w / 2, cy = h / 2, margen = Math.min(w, h) * 0.06;
  const cruza = c => c.caja && cx >= c.caja.x - margen && cx <= c.caja.x + c.caja.width + margen && cy >= c.caja.y - margen && cy <= c.caja.y + c.caja.height + margen;
  const dist = c => Math.hypot(c.caja.x + c.caja.width / 2 - cx, c.caja.y + c.caja.height / 2 - cy);
  // Primero los que cruzan la línea (conocidos antes que el resto) y, de esos, el más cercano al centro
  const centrados = todos.filter(cruza).sort((x, y) => (y.conocido - x.conocido) || dist(x) - dist(y));
  if (centrados.length) return { valor: centrados[0].valor, centrado: true, conocido: centrados[0].conocido };
  const distintos = [...new Set(validos.map(c => c.valor))];
  return distintos.length === 1 ? { valor: distintos[0], centrado: !validos[0].caja, conocido: validos[0].conocido } : null;
}

// Para el diagnóstico: qué códigos (formato y valor) ha visto la cámara en la sesión, aunque no se leyeran
function anotarVistos(est, codigos) {
  for (const c of codigos) {
    const k = (c.format || '?') + ':' + String(c.rawValue || '').trim().slice(0, 30);
    if (est.vistos[k] || Object.keys(est.vistos).length < 15) est.vistos[k] = (est.vistos[k] || 0) + 1;
  }
}

const espera = ms => new Promise(ok => setTimeout(ok, ms));
const conLimite = (promesa, ms, mensaje) => Promise.race([promesa, espera(ms).then(() => { throw new Error(mensaje); })]);
const detener = flujo => flujo.getTracks().forEach(t => t.stop());
const capacidades = pista => { try { return pista.getCapabilities ? pista.getCapabilities() : {}; } catch (e) { return {}; } };
const redondo = z => Math.round(z * 10) / 10;
const nombreMotor = d => d.nativo ? (d.zxing ? 'lector del móvil + ZXing' : 'lector del móvil') : 'ZXing';

function mensajeCamara(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'no hay permiso. Pulsa el candado de la barra de direcciones, permite la cámara y reintenta';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'no se encuentra ninguna cámara';
  if (n === 'NotReadableError' || n === 'AbortError') return 'la cámara está ocupada por otra aplicación o pestaña';
  return (e && e.message) || String(e);
}

// Abre la cámara elegida en este dispositivo o, si no hay ninguna (o ya no existe), la trasera por defecto.
// Se pide 1080p: en 4K un móvil corriente tarda más de medio segundo por fotograma (medido en un Samsung),
// y con la cámara principal y zoom ×2–×3 las barras ya se ven con detalle de sobra.
const TAM_VIDEO = { width: { ideal: 1920 }, height: { ideal: 1080 } };
const camaraGuardada = () => { try { return localStorage.getItem('camaraId'); } catch (e) { return null; } };
const guardarCamara = id => { try { if (id) localStorage.setItem('camaraId', id); else localStorage.removeItem('camaraId'); } catch (e) { /* sin almacenamiento */ } };
const abrirId = id => navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: id }, ...TAM_VIDEO } });
async function abrirCamara() {
  const id = camaraGuardada();
  if (id) {
    try { return await abrirId(id); }
    catch (e) { if (e && e.name === 'NotAllowedError') throw e; guardarCamara(null); }
  }
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, ...TAM_VIDEO } });
}

// Muchos Android (p. ej. Samsung) abren por defecto una cámara trasera secundaria con enfoque fijo, que de
// cerca ve la etiqueta borrosa (medido: 0–1 lecturas en 30 s frente a 20 lecturas con la principal). La
// primera vez, si la cámara abierta no tiene autoenfoque, se prueban las demás traseras y se queda la
// primera que lo tenga (mejor si además tiene linterna, que suele indicar la principal). Se recuerda.
// En ordenadores (p. ej. Surface) la cámara por defecto suele ser la frontal aunque se pida la trasera:
// si se sabe cuál es la trasera por su nombre, se cambia a ella. iPhone y Firefox no informan del modo de
// enfoque: ahí no se prueban cámaras (abrirlas una a una solo haría esperar).
const tieneAutoenfoque = pista => (capacidades(pista).focusMode || []).includes('continuous');
async function camaraConEnfoque(flujo, camaras) {
  let pista = flujo.getVideoTracks()[0];
  let actual = (pista.getSettings ? pista.getSettings() : {}).deviceId;
  if (camaraGuardada() || !camaras.length) return flujo;
  if (actual && camaras.some(esTrasera) && !camaras.some(c => esTrasera(c) && c.deviceId === actual)) {
    detener(flujo);
    try { flujo = await abrirId(camaras[0].deviceId); } catch (e) { return abrirId(actual); }
    pista = flujo.getVideoTracks()[0]; actual = camaras[0].deviceId;
  }
  const traseras = camaras.filter(esTrasera);
  if (traseras.length < 2 || !capacidades(pista).focusMode || tieneAutoenfoque(pista)) return flujo;
  detener(flujo); // en Android no se pueden abrir dos cámaras a la vez
  let elegido = null, elegidoId = null;
  for (const c of traseras.filter(c => c.deviceId !== actual)) {
    let otro;
    try { otro = await abrirId(c.deviceId); } catch (e) { continue; }
    const p = otro.getVideoTracks()[0];
    if (tieneAutoenfoque(p) && (!elegido || capacidades(p).torch)) {
      if (elegido) detener(elegido);
      elegido = otro; elegidoId = c.deviceId;
      if (capacidades(p).torch) break;
    } else detener(otro);
  }
  if (elegido) { guardarCamara(elegidoId); return elegido; }
  return actual ? abrirId(actual) : abrirCamara(); // ninguna tiene autoenfoque: se vuelve a la de antes
}

// Cámaras del dispositivo para el botón «Cámara n/N»: primero las traseras y después las demás (en una
// Surface apoyada en la mesa es cómodo enseñar la etiqueta a la frontal). Los nombres solo se conocen tras
// dar permiso. Se excluyen las de infrarrojos (Windows Hello).
const esTrasera = c => /back|rear|trasera|posterior|environment/i.test(c.label);
async function camarasDisponibles() {
  try {
    const todas = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId && !/\bIR\b|infrared|infrarroj/i.test(d.label));
    return [...todas.filter(esTrasera), ...todas.filter(c => !esTrasera(c))];
  } catch (e) { return []; }
}
const indiceCamara = (lista, id) => Math.max(0, lista.findIndex(c => c.deviceId === id));

// Zoom de partida: el que eligió la persona en este dispositivo o, si no, ×2.
function zoomPreferido(pista) {
  const cap = capacidades(pista).zoom; if (!cap) return 0;
  let z = 2;
  try { z = Number(localStorage.getItem('camaraZoom')) || 2; } catch (e) { /* sin almacenamiento */ }
  return Math.min(z, cap.max);
}

// Enfoque y exposición continuos si la cámara lo permite (cada móvil admite cosas distintas).
async function ajustarCamara(pista) {
  const cap = capacidades(pista);
  const avanzado = [];
  if (cap.focusMode && cap.focusMode.includes('continuous')) avanzado.push({ focusMode: 'continuous' });
  if (cap.exposureMode && cap.exposureMode.includes('continuous')) avanzado.push({ exposureMode: 'continuous' });
  for (const r of avanzado) { try { await pista.applyConstraints({ advanced: [r] }); } catch (e) { /* no lo admite */ } }
  Escaner.zoom = 1;
}

// Motores de lectura: { nativo, zxing }. Si hay nativo que lea Code 128 se usa ya y ZXing se carga
// después en segundo plano (cargarZxing); si no, se espera a ZXing (se descarga una vez y queda en caché).
let detectorListo = null;
function prepararDetector() {
  return detectorListo = detectorListo || (async () => {
    const forzar = new URLSearchParams(location.search).get('motor');
    if (forzar !== 'zxing' && 'BarcodeDetector' in window) {
      try {
        const admite = await BarcodeDetector.getSupportedFormats();
        if (admite.includes('code_128')) return { nativo: new BarcodeDetector({ formats: FORMATOS.filter(f => admite.includes(f)) }), zxing: null };
      } catch (e) { /* se usa ZXing */ }
    }
    return { nativo: null, zxing: await nuevoZxing() };
  })().catch(e => { detectorListo = null; throw e; });
}
async function nuevoZxing() {
  if (!window.BarcodeDetectionAPI) await cargarScript(MOTOR_ZXING);
  const detector = new window.BarcodeDetectionAPI.BarcodeDetector({ formats: FORMATOS });
  await detector.detect(document.createElement('canvas')).catch(() => {}); // descarga y prepara el WebAssembly ya
  return detector;
}
// Carga ZXing como refuerzo en segundo plano, sin parar el escaneo.
function cargarZxing(d) {
  if (!d.cargandoZxing) d.cargandoZxing = nuevoZxing().then(z => { d.zxing = z; }).catch(() => { d.cargandoZxing = null; });
}
function cargarScript(src) {
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('no se ha podido cargar el lector de códigos. Revisa la conexión'));
    document.head.appendChild(s);
  });
}

// Al cerrar la cámara se manda al Log un resumen técnico de la sesión (sin imágenes) para poder
// depurar con datos de los móviles reales: modelo, lector, resolución, zoom, tiempos y lecturas.
function enviarDiagnostico(a, zoom) {
  try {
    const e = a.est, seg = Math.round((Date.now() - e.inicio) / 1000);
    if (seg < 3 || typeof api !== 'function') return;
    const cap = capacidades(a.pista), aj = a.pista.getSettings ? a.pista.getSettings() : {};
    api('diagnosticoEscaner', {
      dispositivo: navigator.userAgent, pantalla: location.hash, segundos: seg,
      motor: nombreMotor(a.detectores) + (a.ligero ? ' ligero' : ''), resolucion: (aj.width || a.video.videoWidth) + 'x' + (aj.height || a.video.videoHeight),
      camara: (Escaner.camaras.find(c => c.deviceId === aj.deviceId) || {}).label || '', camaras: Escaner.camaras.map(c => c.label).join(' | '),
      zoom: redondo(zoom || 1), zoomMax: cap.zoom ? cap.zoom.max : null, enfoque: (cap.focusMode || []).join('/'), linterna: !!cap.torch,
      fotogramas: e.fotogramas, msPorFotograma: e.fotogramas ? Math.round(e.ms / e.fotogramas) : null,
      lecturas: e.lecturas, porNativo: e.nativo, porZxing: e.zxing, primeraLecturaMs: e.primera || null, vistos: e.vistos }).catch(() => {});
  } catch (x) { /* el diagnóstico nunca debe molestar */ }
}

// Copia la zona del marco (con margen) de la parte del vídeo que se ve en pantalla (el vídeo va recortado
// con object-fit: cover). Si sale más ancha de MAX_ANCHO se reduce: analizar más píxeles no lee mejor y
// en móviles corrientes cada fotograma pasaba de 200 ms.
const lienzoEscaner = document.createElement('canvas');
const MAX_ANCHO = 1280;
// ZXing tolera unos ±7° por intento: con pasos de 10° cubre etiquetas inclinadas hasta unos ±37°
const GIROS = [0, 10, -10, 0, 20, -20, 0, 30, -30].map(g => g * Math.PI / 180);
// Modo ligero: si ZXing tarda más de LENTO_MS por fotograma, se analiza a 960 px y solo con giros de ±10°
// (con la línea de mira la etiqueta suele ir casi horizontal). Así un procesador modesto lee varias veces por segundo.
const LENTO_MS = 140, ANCHO_LIGERO = 960;
const GIROS_LIGERO = [0, 10, 0, -10].map(g => g * Math.PI / 180);
function recorteVisible(video, giro = 0, maxAncho = MAX_ANCHO) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const ew = video.clientWidth || vw, eh = video.clientHeight || vh;
  const escala = Math.max(ew / vw, eh / vh);
  const visW = Math.min(vw, ew / escala), visH = Math.min(vh, eh / escala);
  const w = Math.round(visW * 0.95), h = Math.round(visH * 0.65); // el marco ocupa el 85 % × 50 %
  const x = Math.round((vw - w) / 2), y = Math.round((vh - h) / 2);
  const k = Math.min(1, maxAncho / w), lw = Math.round(w * k), lh = Math.round(h * k);
  if (lienzoEscaner.width !== lw || lienzoEscaner.height !== lh) { lienzoEscaner.width = lw; lienzoEscaner.height = lh; }
  const ctx = lienzoEscaner.getContext('2d');
  if (!giro) ctx.drawImage(video, x, y, w, h, 0, 0, lw, lh);
  else {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lw, lh);
    ctx.save(); ctx.translate(lw / 2, lh / 2); ctx.rotate(-giro); ctx.scale(k, k); ctx.drawImage(video, -vw / 2, -vh / 2); ctx.restore();
  }
  return lienzoEscaner;
}

// Se carga el lector en segundo plano al entrar el profesorado, para que la cámara lea desde el primer momento
function precargarEscaner() {
  if (navigator.connection && navigator.connection.saveData) return;
  (window.requestIdleCallback || setTimeout)(() => prepararDetector().catch(() => {}));
}

// Lectores de códigos USB o Bluetooth (recomendados en el ordenador del almacén): escriben el código muy
// deprisa, como un teclado, y pulsan Intro. Se recoge aunque el cursor no esté en la casilla del código,
// salvo si se está escribiendo en otra casilla. Una persona no teclea tan rápido (menos de 50 ms por tecla).
const lector = { texto: '', t: 0 };
document.addEventListener('keydown', e => {
  if (!Escaner.alLeer || !document.getElementById('codigoManual')) return;
  const el = document.activeElement;
  if (el && (el.id === 'codigoManual' || /INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable)) return;
  const ahora = performance.now();
  if (ahora - lector.t > 50) lector.texto = '';
  lector.t = ahora;
  if (e.key === 'Enter' || e.key === 'Tab' || e.key === ' ') {
    if (lector.texto.length >= 3 && e.key !== ' ') { e.preventDefault(); Escaner.leido(lector.texto, true); }
    // Espacio o Intro sueltos con la cámara encendida: gatillo (lee el código apuntado)
    else if (!lector.texto && Escaner.activo && e.key !== 'Tab') { e.preventDefault(); Escaner.disparar(); }
    lector.texto = '';
  } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) lector.texto += e.key;
});

let audio;
function pitido() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 1150; g.gain.value = 0.08;
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.09);
  } catch (e) { /* sin audio */ }
  // El navegador solo deja vibrar después de que la persona haya tocado la página
  if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(50);
}
