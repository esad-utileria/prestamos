// Ayuda: cómo funciona la aplicación, una guía para el alumnado y otra para el profesorado.
// #ayuda abre la del rol de cada persona; el profesorado puede ver también la del alumnado (#ayuda/alumno).

// Cada tema: [título, contenido en HTML]. Se pliegan para que en el móvil se encuentre rápido lo que se busca.
const AYUDA_ALUMNO = [
  ['Qué es y cómo entrar', `
    <p>Es la web del almacén de utilería de la ESAD: aquí ves todo el material que hay, lo pides para tus ensayos y montajes y sigues tus préstamos.</p>
    <ul><li>Entra con <b>Iniciar sesión con Google</b> usando tu cuenta <b>@esadsevilla.es</b>. Otras cuentas no pueden entrar.</li>
      <li>Funciona en el móvil y en el ordenador. En el móvil puedes añadirla a la pantalla de inicio desde el menú del navegador.</li></ul>`],
  ['El catálogo', `
    <p>En <b>Catálogo</b> está todo el material. Busca por nombre o código, o filtra por categoría. Cada artículo lleva una etiqueta con su estado:</p>
    <ul><li><span class="badge b-ok">Disponible</span> está en el almacén y nadie lo ha pedido.</li>
      <li><span class="badge b-violet">Reservado</span> alguien lo ha pedido para unas fechas (debajo salen cuáles). Si eres tú, pone «En tu solicitud»; si es otra persona, «Ya solicitado». Puedes pedirlo para otros días.</li>
      <li><span class="badge b-warn">Prestado</span> lo tiene otra persona. En su ficha ves cuándo vuelve y desde qué día puedes pedirlo.</li>
      <li><span class="badge b-info">En tu préstamo</span> lo tienes tú.</li>
      <li><span class="badge b-danger">Mantenimiento</span> no se puede pedir de momento.</li></ul>
    <p>Pulsa un artículo para ver su foto en grande y sus solicitudes. Con <b>Actualizar</b> traes los últimos cambios.</p>`],
  ['Pedir material (hacer una solicitud)', `
    <ol><li>En el catálogo, abre cada artículo y pulsa <b>Añadir a mi solicitud</b>. Si estás en el almacén, usa <b>Escanear</b> y pasa la cámara por las etiquetas: se van añadiendo solos.</li>
      <li>Pulsa <b>Ver mi solicitud</b> (abajo).</li>
      <li>Elige <b>desde</b> qué día y <b>hasta</b> qué día lo necesitas. Las fechas son por <b>días enteros</b>, sin horas: el préstamo ocupa el día de inicio y el de devolución completos.</li>
      <li>Elige la <b>asignatura o motivo</b>. Si no está en la lista, elige «Otra» y escríbela; el docente la revisará.</li>
      <li>Añade un comentario si hace falta y pulsa <b>Enviar solicitud</b>.</li></ol>
    <p>La solicitud la revisa y aprueba siempre <b>un docente</b>. Te avisamos por correo.</p>`],
  ['Fechas: material prestado y cola', `
    <ul><li><b>Si el artículo está prestado</b>, solo puedes pedirlo <b>a partir del día siguiente a su devolución</b>. El calendario no deja elegir días anteriores.</li>
      <li><b>Si otra persona lo pidió antes</b> para fechas que se solapan con las tuyas, te avisa: «En cola… queda libre a partir del…». Puedes:
        <ul><li>pulsar <b>Usar esas fechas</b>: pone las primeras fechas libres para todo lo de tu solicitud, con la misma duración; o</li>
          <li>enviarla igualmente: irás <b>detrás en la cola</b> y solo te lo darán si queda libre (por ejemplo, si la otra persona cancela).</li></ul></li>
      <li>Si dos personas envían a la vez, va primero quien llegó antes. A la segunda se le avisa al enviar.</li>
      <li>No puedes pedir lo mismo dos veces para fechas que se solapan.</li></ul>`],
  ['Mis solicitudes', `
    <p>En <b>Solicitudes</b> ves las tuyas y su estado:</p>
    <ul><li><span class="badge b-warn">Pendiente de revisión</span> aún no la ha visto un docente. Puedes <b>editarla</b> (artículos, fechas, motivo) o <b>cancelarla</b>. Si pone «En cola», ábrela para elegir otras fechas.</li>
      <li><span class="badge b-violet">Cita para recoger</span> un docente te ha dado día y hora para pasar por el almacén.</li>
      <li><span class="badge b-ok">Entregada</span> ya tienes el material: está en Mis préstamos.</li>
      <li><span class="badge b-danger">Rechazada</span> no se ha podido atender; verás el motivo.</li></ul>
    <p>Si ya no necesitas el material, cancela la solicitud para que quede libre para otra persona.</p>`],
  ['La cita para recoger', `
    <p>Cuando te citan, recibes un correo con tres botones (también están en la solicitud):</p>
    <ul><li><b>Acepto la cita</b>: confirmas que irás.</li>
      <li><b>Proponer otra fecha</b>: eliges día y hora y el docente la confirma.</li>
      <li><b>No puedo ir</b>: explicas por qué y el docente te propondrá otra.</li></ul>
    <p>El día de la cita también te llega un recordatorio. <b>Si no vas</b>, la cita aparece como «Cita con retraso» ese día y como «Cita pasada» desde el día siguiente: propón otra fecha o cancela la solicitud. Si no haces nada, el docente puede anularla.</p>`],
  ['Recoger y devolver', `
    <ul><li>En el almacén, el docente te entrega el material y registra el préstamo. Te llega un correo con lo que te llevas y el <b>día de devolución</b>.</li>
      <li>El día antes de la devolución te llega un recordatorio. Devuelve el material <b>en el almacén</b>, a un docente, como muy tarde ese día.</li>
      <li>Si te retrasas, el préstamo pasa a <span class="badge b-danger">Devolución con retraso</span> y recibirás avisos cada pocos días hasta que lo devuelvas.</li>
      <li>Si algo se rompe o se estropea, díselo al docente al devolverlo.</li></ul>`],
  ['Mis préstamos', `
    <p>En <b>Mis préstamos</b> ves tus citas, lo que tienes ahora (con el día de devolución y su estado: «En curso» o «Devolución con retraso») y el historial de lo que ya devolviste.</p>`],
  ['Mi perfil y el código QR', `
    <ul><li>En <b>Mi perfil</b> tienes tu <b>código QR</b>: enséñalo en el almacén y el docente te selecciona al momento para prestarte material.</li>
      <li>Indica tu <b>especialidad</b> y <b>curso</b>, y si quieres recibir los recordatorios por correo.</li>
      <li>Desde aquí también cierras la sesión.</li></ul>`],
  ['Si algo no va', `
    <ul><li><b>No puedo entrar:</b> comprueba que usas tu cuenta @esadsevilla.es.</li>
      <li><b>No veo un cambio reciente:</b> pulsa <b>Actualizar</b> en el catálogo o vuelve a abrir la pantalla.</li>
      <li><b>Me dice que los datos han cambiado:</b> alguien hizo algo a la vez que tú (por ejemplo, pidió el mismo artículo). La web se pone al día sola; revisa y vuelve a intentarlo.</li>
      <li>Para cualquier otra cosa, pregunta en el almacén o escribe a <b>almacen@esadsevilla.es</b>.</li></ul>`]
];

const AYUDA_DOCENTE = [
  ['Cómo funciona (resumen)', `
    <ul><li>El alumnado consulta el catálogo y <b>solicita</b> material. Solo un docente puede <b>citar</b>, <b>aprobar</b> (entregar) o <b>rechazar</b>.</li>
      <li>También puedes <b>prestar directamente</b>, sin solicitud, a quien esté en el almacén.</li>
      <li>Las fechas van por <b>días enteros</b>: el préstamo ocupa el día de inicio y el de devolución completos. El material vuelve a estar libre <b>al día siguiente de la devolución</b>.</li>
      <li>No hay límite de artículos ni de duración. Los retrasos solo generan avisos y los daños solo se notifican (incidencias).</li>
      <li>Si alguien cambió algo a la vez que tú, la web te avisa y se pone al día antes de guardar nada.</li></ul>`],
  ['Inicio', `
    <p>Los contadores de arriba (solicitudes por revisar, citas de hoy, préstamos activos y devoluciones con retraso) llevan a su pantalla. Debajo aparece solo lo que pide atención, por este orden:</p>
    <ul><li><b>Citas a las que no ha acudido el alumno</b> (y citas con retraso de hoy).</li>
      <li><b>Respuestas a citas por gestionar</b>: el alumno no puede ir o propone otra fecha.</li>
      <li>Citas próximas, solicitudes por revisar, <b>devoluciones con retraso</b>, préstamos que se devuelven hoy e incidencias abiertas.</li></ul>`],
  ['Prestar (sin solicitud)', `
    <ol><li><b>¿Para quién?</b> Escanea el QR del perfil del alumno, búscalo por nombre o escribe su correo completo (si nunca ha entrado, se le da de alta como alumno).</li>
      <li><b>Artículos:</b> elige cómo añadirlos (la web recuerda tu elección):
        <ul><li><b>Elegir del catálogo</b> (lo habitual en el ordenador): busca por nombre o código, o filtra por categoría, y pulsa <b>Añadir</b>. Los disponibles salen primero; los prestados dicen hasta cuándo. Con un lector de códigos USB, lee la etiqueta en el buscador y se añade sola.</li>
        <li><b>Escanear</b> (lo habitual en el móvil): ve pasando las etiquetas por la cámara (escaneo continuo) o escribe el código.</li></ul>
        Puedes mezclar los dos. Se avisa si alguno está prestado o en mantenimiento, y lo añadido se puede quitar antes de continuar.</li>
      <li><b>Fechas y motivo:</b> día de inicio y día de devolución (atajos: Hoy, 1 semana, 2 semanas, 1 mes, Fin de curso), asignatura y notas. Pulsa <b>Confirmar préstamo</b>.</li></ol>
    <p>El alumno recibe un correo con lo prestado y el día de devolución. No se puede prestar un artículo que esté <b>citado a otra persona</b> para esos días: gestiona antes esa solicitud o acorta la devolución.</p>
    <p>Desde la ficha de un artículo disponible, <b>Prestar</b> empieza el préstamo con ese artículo ya puesto.</p>`],
  ['Devolver', `
    <ul><li>En <b>Devolver</b>, escanea cada artículo que vuelve, o elige el préstamo de la lista.</li>
      <li>Si un artículo vuelve dañado, márcalo y describe el daño: se abre una <b>incidencia</b> (Más → Incidencias).</li>
      <li>Desde un préstamo puedes devolver los artículos <b>de uno en uno</b> o <b>Devolver todo</b>.</li></ul>`],
  ['Préstamos activos', `
    <p>En Más → <b>Préstamos activos</b>, cada tarjeta muestra el alumno, la asignatura, el día de devolución, cuántos artículos se han devuelto y la <b>lista de los que faltan</b>, sin tener que abrirla. Si alguien ha solicitado alguno de esos artículos, la tarjeta lleva <span class="badge b-violet">Con cola</span> y dice quién espera y desde cuándo; si además la devolución va con retraso, <b>contacta con el alumno</b> para que lo devuelva cuanto antes (en Inicio, esos retrasos salen primero). El filtro <b>Devolución con retraso</b> deja solo los atrasados. Pulsa una tarjeta para ver el préstamo completo.</p>`],
  ['Solicitudes: revisar y la cola', `
    <p>En Más → <b>Solicitudes</b> hay dos pestañas: <b>Pendientes</b> y <b>Citadas</b>. Van por orden de llegada, con las que piden atención primero. En cada artículo de la solicitud verás:</p>
    <ul><li>«<b>1º de 2 en la cola</b>»: otras personas pidieron el mismo artículo para fechas que se solapan, por orden de llegada. Decide tú a quién atender.</li>
      <li>«<b>Ya citado para…</b>»: otra persona tiene cita con ese artículo para esas fechas. No se puede citar ni entregar a la vez; rechaza o cambia antes una de las dos.</li>
      <li>«<b>Prestado a… hasta el…</b>»: aún no ha vuelto.</li></ul>
    <p><b>Asignatura:</b> si el alumno escribió una a mano, corrígela antes de citar o aprobar. Puedes <b>añadirla a la lista</b> o usarla <b>solo en este préstamo</b>.</p>`],
  ['Citar', `
    <ul><li><b>Citar</b> (o <b>Cambiar cita</b>): elige día y hora y, si quieres, un mensaje. El alumno recibe un correo con botones para aceptarla, proponer otra fecha o decir que no puede ir.</li>
      <li>Si <b>propone otra fecha</b>: pulsa <b>Aceptar esa fecha</b> o propón otra.</li>
      <li>Si <b>no puede ir</b>: cambia la cita o rechaza la solicitud.</li>
      <li>Si el alumno <b>no viene</b>: el mismo día sale «<b>Cita con retraso</b>» y desde el día siguiente «<b>No acudió a la cita</b>». Si viene más tarde, pulsa Aprobar. Si no, cambia la cita o pulsa <b>Anular: no acudió</b>: la solicitud se anula y el alumno recibe un correo explicándolo.</li></ul>`],
  ['Aprobar = entregar el material', `
    <p>Pulsa <b>Aprobar</b> cuando el alumno esté delante para llevarse el material. Se abre el panel <b>Entregar el material ahora</b>:</p>
    <ul><li>Ves las fechas que pidió el alumno. La entrega es hoy y la devolución, la que pidió.</li>
      <li><b>Mantenlas</b> o <b>cámbialas</b>: a mano o con los atajos (Mantener la pedida, 1 semana, 2 semanas).</li>
      <li>Si el alumno llega cuando ya pasó la devolución que pidió, el panel lo avisa y propone la <b>misma duración desde hoy</b>. Revísala.</li>
      <li>Pulsa <b>Confirmar entrega</b>: se registra el préstamo y el alumno recibe el correo. Con <b>Cancelar</b> no se guarda nada.</li></ul>
    <p><b>Rechazar</b> pide un motivo, que se envía al alumno.</p>`],
  ['Catálogo y fichas de artículo', `
    <ul><li>Filtros: Disponibles, <b>Reservados</b> (con solicitudes activas), Prestados y Mantenimiento. En cada tarjeta ves quién lo tiene, hasta cuándo y quién lo ha solicitado.</li>
      <li>En la ficha: ubicación, observaciones y quién lo tiene. Desde ahí puedes <b>Prestar</b>, <b>Ver préstamo</b>, <b>Editar foto y datos</b>, cambiar su estado (<b>Bueno</b>, <b>Mantenimiento</b>, <b>Baja</b>) y <b>Registrar daño</b>.</li>
      <li>Los artículos de baja no los ve el alumnado.</li></ul>`],
  ['Alta de artículos y etiquetas', `
    <ul><li><b>Etiquetas</b> (Más): genera códigos nuevos (ARTnnn) en hojas A4 completas de 108 etiquetas de 50 × 10 mm, o reimprime los que están sin asignar o los de artículos concretos. Puedes empezar en una etiqueta concreta de una hoja ya empezada. Imprime al <b>100 %</b>, sin «ajustar a la página».</li>
      <li><b>Alta de artículo</b> (Más): pega una etiqueta en el artículo y escanéala (el código se rellena solo). Haz la foto, escribe la descripción, la categoría, la ubicación y las observaciones, y pulsa <b>Guardar</b> o <b>Guardar y siguiente</b>.</li>
      <li>Si escaneas en Alta un artículo que ya existe, se abre su edición para cambiar la foto o los datos.</li></ul>`],
  ['Incidencias, listas y usuarios', `
    <ul><li><b>Incidencias:</b> los daños registrados. Ciérralas cuando el artículo esté arreglado (y, si lo pusiste en mantenimiento, vuelve a ponerlo en «Bueno»).</li>
      <li><b>Listas:</b> categorías, asignaturas, especialidades y cursos de los desplegables.</li>
      <li><b>Usuarios y roles:</b> cualquier cuenta @esadsevilla.es entra como alumno la primera vez. Puedes dar de alta y editar alumnos (nombre, especialidad, curso). Solo un <b>administrador</b> cambia roles y añade docentes.</li></ul>`],
  ['Avisos automáticos por correo', `
    <ul><li>Al alumno: correo al registrar el préstamo, recordatorio el día antes de la devolución, aviso de retraso al día siguiente y después cada 3 días, y recordatorio el día de su cita.</li>
      <li>Al docente que citó: las respuestas del alumno a la cita y las cancelaciones.</li>
      <li>A almacen@esadsevilla.es: cada solicitud nueva (indica si va en cola), los daños registrados desde la ficha del artículo y, los lunes, un <b>resumen semanal</b> con devoluciones con retraso, incidencias abiertas, solicitudes por revisar, citas a las que no acudió el alumno y respuestas a citas.</li>
      <li>Los botones de los correos abren la web directamente en la pantalla adecuada.</li></ul>`]
];

function vAyuda(cual) {
  const doc = esDocente();
  const deAlumno = !doc || cual === 'alumno';
  const temas = deAlumno ? AYUDA_ALUMNO : AYUDA_DOCENTE;
  return `<div class="stack ayuda"><h1>Ayuda</h1>
    ${doc ? `<div class="chips"><a class="chip ${deAlumno ? '' : 'on'}" href="#ayuda">Para el profesorado</a><a class="chip ${deAlumno ? 'on' : ''}" href="#ayuda/alumno">Para el alumnado</a></div>` : ''}
    <p class="muted small">${deAlumno ? (doc ? 'Lo que ve y puede hacer el alumnado. Útil para explicárselo.' : 'Cómo consultar el catálogo, pedir material y seguir tus préstamos.') : 'Cómo gestionar préstamos, solicitudes, citas y artículos.'} Pulsa un tema para abrirlo.</p>
    ${temas.map(([t, html], i) => `<details class="card"${i === 0 ? ' open' : ''}><summary>${t}</summary><div class="small stack" style="margin-top:10px">${html}</div></details>`).join('')}
    <p class="hint">¿Dudas o algo que no funciona? Escribe a almacen@esadsevilla.es.</p></div>`;
}

VISTAS.ayuda = arg => vAyuda(arg);
