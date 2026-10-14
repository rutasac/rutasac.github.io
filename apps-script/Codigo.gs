/**
 * Andariegos Coseranos — recepción de carteles
 *
 * Comprueba la pregunta de control y publica el cartel en la web.
 * Las respuestas correctas viven aquí, en el servidor: quien mire el
 * código de la página web no las puede ver.
 *
 * Ajustes necesarios (Configuración del proyecto → Propiedades del script):
 *   TOKEN  → la llave de GitHub
 *   REPO   → rutasac/rutasac.github.io
 */

var CARPETA   = 'carteles';
var MAX_FALLOS = 12;   // fallos seguidos antes de cerrar un rato
var MAX_DIA    = 20;   // carteles por día, por si alguien se aburre

var PREGUNTAS = [
  { t: 'El punto de salida de las rutas está cerca de…',
    ok: 'Los Paredones',
    no: ['la piscina', 'la granja', 'el helipuerto', 'el puerto', 'la playa'] },

  { t: 'La fuente Jordana, cuando llueve…',
    ok: 'mana',
    no: ['gana', 'lana', 'sana', 'se cierra', 'se agarra'] },

  { t: '¿Cuál de estos NO es un sitio para bañarse en La Codosera?',
    ok: 'el pantano',
    no: ['la pesquera', 'el molino', 'la piscina natural', 'el charco de la Nava'] },

  { t: 'En verano nos gusta bañarnos en el molino…',
    ok: 'del Duque',
    no: ['de la Presa', 'Nuevo', 'de la Vega', 'del Fraile'] },

  { t: 'Hay una peña muy famosa que se llama la Peña…',
    ok: 'la Niña',
    no: ['Mayor', 'Gorda', 'del Águila', 'del Moro', 'Redonda'] },

  { t: '¿Qué hay encima del castillo?',
    ok: 'un santo',
    no: ['almenas', 'gárgolas', 'un reloj', 'una bandera', 'una antena'] },

  { t: '¿Qué santuario está entre La Codosera y El Marco?',
    ok: 'Chandavila',
    no: ['Guadalupe', 'Bótoa', 'La Montaña', 'Los Remedios'] },

  { t: '¿Qué ermita está entre La Codosera y Alburquerque?',
    ok: 'Carrión',
    no: ['San Blas', 'La Soledad', 'Los Mártires', 'San Isidro'] },

  { t: 'Un barrio del pueblo se llama La Quinta…',
    ok: 'del Café',
    no: ['del Agua', 'del Molino', 'de la Fuente', 'del Pilar', 'de Arriba'] },

  { t: '¿Qué hay en el barrio de la Estación?',
    ok: 'una escultura al contrabandista',
    no: ['un lavadero', 'un quiosco de música', 'una fuente de tres caños', 'un mirador'] },

  { t: '¿Cuál de estos es un barrio del pueblo?',
    ok: 'San Miguel',
    no: ['San Lázaro', 'San Lorenzo', 'Santa Susana', 'Santa Teresa', 'San Andrés'] }
];

// ---------------------------------------------------------------- utilidades

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function barajar(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function cache() { return CacheService.getScriptCache(); }

function fallos(suma) {
  var c = cache();
  var n = Number(c.get('fallos') || 0);
  if (suma) { n++; c.put('fallos', String(n), 900); }   // se olvida en 15 min
  return n;
}

// ------------------------------------------------------------------ entradas

function doGet(e) {
  if (fallos(false) >= MAX_FALLOS) {
    return responder({ error: 'cerrado' });
  }
  var i = Math.floor(Math.random() * PREGUNTAS.length);
  var p = PREGUNTAS[i];
  return responder({
    id: i,
    texto: p.t,
    opciones: barajar([p.ok].concat(p.no))
  });
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); }
  catch (err) { return responder({ error: 'peticion' }); }

  if (d.accion === 'comprobar') return comprobar(d);
  if (d.accion === 'subir')     return subir(d);
  if (d.accion === 'quitar')    return quitar(d);
  return responder({ error: 'peticion' });
}

// ------------------------------------------------------------------ acciones

function comprobar(d) {
  if (fallos(false) >= MAX_FALLOS) return responder({ error: 'cerrado' });

  var p = PREGUNTAS[d.id];
  if (!p || d.respuesta !== p.ok) {
    fallos(true);
    return responder({ ok: false });
  }
  var pase = Utilities.getUuid();
  cache().put('pase-' + pase, '1', 900);            // válido 15 minutos
  return responder({ ok: true, pase: pase });
}

function subir(d) {
  if (!d.pase || cache().get('pase-' + d.pase) !== '1') {
    return responder({ error: 'pase' });
  }
  cache().remove('pase-' + d.pase);                 // de un solo uso

  var props = PropertiesService.getScriptProperties();
  var hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyyMMdd');
  var contador = Number(props.getProperty('dia-' + hoy) || 0);
  if (contador >= MAX_DIA) return responder({ error: 'limite' });

  if (!d.imagen) return responder({ error: 'vacio' });

  var sello  = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyyMMdd-HHmmss');
  var ruta   = CARPETA + '/cartel-' + sello + '.jpg';
  var url    = 'https://api.github.com/repos/' + props.getProperty('REPO') +
               '/contents/' + ruta;

  var res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + props.getProperty('TOKEN'),
      Accept: 'application/vnd.github+json'
    },
    payload: JSON.stringify({
      message: 'Cartel subido desde la web el ' + sello,
      content: d.imagen
    }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 300) {
    return responder({ error: 'github', detalle: res.getResponseCode() });
  }

  props.setProperty('dia-' + hoy, String(contador + 1));
  return responder({ ok: true });
}

/**
 * Retira el cartel que se está mostrando. No borra el historial:
 * quita el último archivo subido, y la web deja de enseñar nada
 * hasta que alguien suba otro. No hace falta responder la pregunta.
 */
function quitar(d) {
  // A propósito NO se pide la pregunta: quitar el cartel no hace daño
  // (la web se queda sin cartel y se arregla subiendo otro), y quien
  // ve algo raro debe poder quitarlo al momento, sin exámenes.
  // Solo se limita la repetición, para que nadie se entretenga.
  var c = cache();
  var veces = Number(c.get('quitados') || 0);
  if (veces >= 5) return responder({ error: 'limite' });
  c.put('quitados', String(veces + 1), 3600);

  var props = PropertiesService.getScriptProperties();
  var repo  = props.getProperty('REPO');
  var base  = 'https://api.github.com/repos/' + repo;
  var cab   = {
    Authorization: 'Bearer ' + props.getProperty('TOKEN'),
    Accept: 'application/vnd.github+json'
  };
  var op = { headers: cab, muteHttpExceptions: true };

  // 1. último cambio en la carpeta
  var r1 = UrlFetchApp.fetch(base + '/commits?path=' + CARPETA + '&per_page=1', op);
  if (r1.getResponseCode() >= 300) return responder({ error: 'github' });
  var commits = JSON.parse(r1.getContentText());
  if (!commits.length) return responder({ error: 'nada' });

  // 2. qué archivo era
  var r2 = UrlFetchApp.fetch(base + '/commits/' + commits[0].sha, op);
  if (r2.getResponseCode() >= 300) return responder({ error: 'github' });
  var archivos = JSON.parse(r2.getContentText()).files || [];
  var destino = null;
  for (var i = 0; i < archivos.length; i++) {
    if (archivos[i].status !== 'removed' &&
        archivos[i].filename.indexOf(CARPETA + '/') === 0) {
      destino = archivos[i].filename;
      break;
    }
  }
  if (!destino) return responder({ error: 'nada' });

  // 3. su identificador, que GitHub exige para borrar
  var r3 = UrlFetchApp.fetch(base + '/contents/' + destino, op);
  if (r3.getResponseCode() >= 300) return responder({ error: 'github' });
  var sha = JSON.parse(r3.getContentText()).sha;

  // 4. fuera
  var r4 = UrlFetchApp.fetch(base + '/contents/' + destino, {
    method: 'delete',
    contentType: 'application/json',
    headers: cab,
    payload: JSON.stringify({ message: 'Cartel retirado desde la web', sha: sha }),
    muteHttpExceptions: true
  });
  if (r4.getResponseCode() >= 300) return responder({ error: 'github' });

  return responder({ ok: true });
}
