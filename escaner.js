// Escáner de códigos: cámara en vivo (html5-qrcode) y, como alternativa, escribir el código
// o usar un lector de códigos USB/Bluetooth (funciona como un teclado: escribe y pulsa Intro).

const Escaner = {
  lector: null,
  ultimo: '',
  ultimoT: 0,
  alLeer: null,
  encendiendo: false,
  pendiente: false,
  apagando: Promise.resolve(), // la cámara no se puede volver a abrir hasta que la anterior se haya cerrado

  // Marcado del escáner. Tras pintarlo hay que llamar a Escaner.montar(alLeer).
  html(pista) {
    return `<div class="camara" id="camara"><div class="camara-off"><button class="btn" onclick="Escaner.encender()">Activar cámara</button><div class="small" style="color:#fff;margin-top:8px">${esc(pista)}</div></div></div>
      <form class="row" onsubmit="event.preventDefault();Escaner.manual()">
        <input class="input" id="codigoManual" placeholder="O escribe el código / usa el lector" autocomplete="off" autocapitalize="characters">
        <button class="btn ghost" type="submit">Añadir</button>
      </form>`;
  },

  montar(alLeer) {
    this.alLeer = alLeer;
    try { if (localStorage.getItem('camara') === 'si') this.encender(); } catch (e) { /* sin almacenamiento */ }
  },

  async encender() {
    const caja = document.getElementById('camara');
    // Una cámara cuyo vídeo ya no está en la página es huérfana: se apaga antes de abrir otra
    if (this.lector && !document.getElementById('camaraVideo')) this.apagar(false);
    if (this.encendiendo) { this.pendiente = true; return; } // se repetirá al acabar el encendido en curso
    if (this.lector || !caja) return;
    this.encendiendo = true;
    caja.innerHTML = '<div class="camara-off"><div class="small" style="color:#fff">Iniciando cámara…</div></div>';
    try {
      await Promise.race([this.apagando, espera(300)]); // la cámara ya se liberó al cortar el vídeo; solo se da margen a la librería
      if (!document.body.contains(caja)) return; // se cambió de pantalla mientras tanto
      caja.innerHTML = '<div id="camaraVideo"></div><div class="camara-marco"></div><button class="btn ghost sm camara-parar" onclick="Escaner.apagar()">Parar</button>';
      const F = Html5QrcodeSupportedFormats;
      const lector = new Html5Qrcode('camaraVideo', { formatsToSupport: [F.CODE_128, F.EAN_13, F.EAN_8, F.QR_CODE, F.CODE_39], verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      const arranque = lector.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(h * 0.5) }) }, txt => this.leido(txt), () => {});
      const ok = await Promise.race([arranque.then(() => true), espera(10000).then(() => false)]);
      if (!ok) throw new Error('la cámara no responde. Ciérrala en otras aplicaciones o pestañas y reintenta');
      this.lector = lector;
      if (!document.body.contains(caja)) { this.apagar(false); return; }
      try { localStorage.setItem('camara', 'si'); } catch (e) { /* sin almacenamiento */ }
    } catch (e) {
      if (document.body.contains(caja)) caja.innerHTML = `<div class="camara-off"><div class="small" style="color:#fff">No se puede usar la cámara: ${esc(e.message || e)}</div><button class="btn ghost sm" style="margin-top:8px" onclick="Escaner.encender()">Reintentar</button></div>`;
    } finally {
      this.encendiendo = false;
      if (this.pendiente) { this.pendiente = false; if (!this.lector && document.getElementById('camara')) this.encender(); }
    }
  },

  apagar(recordar = true) {
    const l = this.lector; this.lector = null;
    if (recordar) { try { localStorage.setItem('camara', 'no'); } catch (e) { /* sin almacenamiento */ } }
    // Se libera la cámara al instante cortando todos los flujos abiertos; la librería se limpia después,
    // con límite de tiempo, porque si su vídeo ya no está en la página puede quedarse esperando para siempre.
    cortarCamaras();
    if (l) this.apagando = Promise.race([l.stop().then(() => { try { l.clear(); } catch (e) { /* ya limpia */ } }), espera(1500)]).catch(() => {});
    const caja = document.getElementById('camara');
    if (caja && recordar) caja.innerHTML = '<div class="camara-off"><button class="btn" onclick="Escaner.encender()">Activar cámara</button></div>';
    return this.apagando;
  },

  // Al cambiar de pantalla se apaga sin olvidar la preferencia de la persona.
  parar() { this.pendiente = false; if (this.lector) this.apagar(false); },

  manual() {
    const el = document.getElementById('codigoManual');
    const v = el.value.trim();
    if (v) { this.leido(v, true); el.value = ''; el.focus(); }
  },

  leido(txt, manual) {
    const codigo = String(txt).trim().toUpperCase();
    const ahora = Date.now();
    if (!manual && codigo === this.ultimo && ahora - this.ultimoT < 2500) return; // misma etiqueta aún delante de la cámara
    this.ultimo = codigo; this.ultimoT = ahora;
    pitido();
    if (this.alLeer) this.alLeer(codigo);
  }
};

const espera = ms => new Promise(ok => setTimeout(ok, ms));

// Registro de todos los flujos de cámara que abre la página, para poder cerrarlos aunque la
// librería del escáner pierda la referencia (p. ej. si se cambia de pantalla mientras arranca).
const flujos = new Set();
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const abrir = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async restricciones => { const f = await abrir(restricciones); flujos.add(f); return f; };
}
function cortarCamaras() {
  flujos.forEach(f => f.getTracks().forEach(t => t.stop()));
  flujos.clear();
}

let audio;
function pitido() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 1150; g.gain.value = 0.08;
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.09);
  } catch (e) { /* sin audio */ }
  if (navigator.vibrate) navigator.vibrate(50);
}
