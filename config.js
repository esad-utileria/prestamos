// Configuración pública de la web (no contiene secretos).
window.CONFIG = {
  clientId: '456149668008-n67ep2eqqjm6snr51p7g3oj92u787hvt.apps.googleusercontent.com',
  dominio: 'esadsevilla.es',
  // true solo permitiría elegir cuentas de fuera del dominio en PRUEBAS (además haría falta la pantalla de
  // consentimiento OAuth en "Externo" y el correo en CUENTAS_PRUEBAS). En producción, siempre false.
  cuentasExternas: false,
  // URL de la API (implementación de Apps Script de PRUEBAS). En producción se cambia por la de producción.
  apiUrl: 'https://script.google.com/macros/s/AKfycbwfCrrPMD8tGctkXf1oHuB7ZK4WXJCdUK09VQPpEuSkeWJNTGyvK7t512YN61sJpjY9lQ/exec'
};
