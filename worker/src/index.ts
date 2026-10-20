/**
 * index.ts — Relay de Sincronización (Cloudflare Workers + KV).
 *
 * Transporte de Contabilidad M4: los dispositivos de una bóveda comparten
 * credenciales E2EE (K-3) y el relay mueve blobs opacos entre ellos
 * (K-4 carga útil = snapshot v3 del respaldo) sin poder interpretar
 * el contenido.
 *
 * Endpoints (K-13):
 * - GET  /health                      → verificación de vida.
 * - PUT  /api/vault/:vaultId/state    → publica documento + rota historial.
 * - GET  /api/vault/:vaultId/state    → documento vigente (o "noChanges" si
 *                                        ?version= ya lo tiene, K-5).
 * - WS   /ws?vaultId=...              → canal vivo: push_state/remote_state (K-6).
 * - GET  /api/vault/:vaultId/history  → metadatos del historial; con
 *                                        `?full=1` incluye los blobs (restauración de UI).
 *
 * Registro en memoria de conexiones por bóveda: retransmisión instantánea dentro
 * del runtime que acepta el socket; el sondeo pasivo (K-5) cubre clientes que
 * cayeron en otro runtime (límite conocido del modelo, mismo de Teacher-Buddy).
 */

import {
  claveActual,
  claveHistorial,
  esVaultIdValido,
  TTL_SEGUNDOS,
  HISTORIAL_MAX,
  mensajeErrorWs,
  mensajePong,
  mensajeRemoteState,
  parseDocumento,
  parseEntradaHistorial,
  planRotarHistorial,
  type DocumentoBoveda,
  type EntradaHistorial,
} from './relay';

/** Registro en memoria de sockets por bóveda (por runtime del Worker). */
const conexionesPorBoveda = new Map<string, Set<WebSocket>>();

// --- Utilidades HTTP --------------------------------------------------------

function cabecerasCors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function respuestaJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabecerasCors() },
  });
}

function respuestaError(detalle: string, status: number): Response {
  return respuestaJson({ error: detalle }, status);
}

/**
 * Publica el documento: rota historial y persiste el documento vigente.
 * Usada por el PUT HTTP y por el push_state del canal WebSocket.
 */
async function publicarDocumento(
  env: ContabilidadEnv,
  vaultId: string,
  doc: DocumentoBoveda,
): Promise<void> {
  const actual = await env.CONTABILIDAD_VAULT.get(claveActual(vaultId));

  // Historial: el documento anterior entra a la rotación (si existe).
  if (actual) {
    const anterior = parseDocumento(JSON.parse(actual));
    if (anterior) {
      const existentes: EntradaHistorial[] = [];
      for (let n = 0; n < HISTORIAL_MAX; n += 1) {
        const cruda = await env.CONTABILIDAD_VAULT.get(claveHistorial(vaultId, n));
        if (cruda) {
          const entrada = parseEntradaHistorial(JSON.parse(cruda));
          if (entrada) existentes.push(entrada);
        }
      }

      const plan = planRotarHistorial(vaultId, anterior, existentes);
      await Promise.all(
        plan.escriben.map((escritura) =>
          env.CONTABILIDAD_VAULT.put(escritura.clave, escritura.valor, {
            expirationTtl: TTL_SEGUNDOS,
          }),
        ),
      );
      await Promise.all(plan.borran.map((clave) => env.CONTABILIDAD_VAULT.delete(clave)));
    }
  }

  // Documento vigente: 1 put() con renovación del TTL de 30 días (K-5).
  await env.CONTABILIDAD_VAULT.put(claveActual(vaultId), JSON.stringify(doc), {
    expirationTtl: TTL_SEGUNDOS,
  });
}

/** Retransmite el documento a todos los sockets de la bóveda (menos el emisor). */
function avisarOtros(vaultId: string, doc: DocumentoBoveda, emisor: WebSocket | null): void {
  const sockets = conexionesPorBoveda.get(vaultId);
  if (!sockets) return;

  const texto = mensajeRemoteState(doc);
  const caidos: WebSocket[] = [];
  sockets.forEach((socket) => {
    if (socket === emisor) return;
    try {
      socket.send(texto);
    } catch {
      caidos.push(socket);
    }
  });
  caidos.forEach((socket) => sockets.delete(socket));
  if (sockets.size === 0) conexionesPorBoveda.delete(vaultId);
}

// --- Endpoints --------------------------------------------------------------

async function manejarEstadoPut(
  env: ContabilidadEnv,
  vaultId: string,
  request: Request,
): Promise<Response> {
  let crudo: unknown;
  try {
    crudo = await request.json();
  } catch {
    return respuestaError('El cuerpo no es JSON válido.', 400);
  }

  const doc = parseDocumento(crudo);
  if (!doc) {
    return respuestaError('Documento inválido: versión, fecha, etiqueta o blob incorrectos.', 422);
  }

  await publicarDocumento(env, vaultId, doc);
  // Mejor esfuerzo: si el runtime de este PUT también sostiene los sockets,
  // la retransmisión es instantánea (K-6); si no, el sondeo de K-5 cubre.
  avisarOtros(vaultId, doc, null);

  return respuestaJson({ success: true, version: doc.version, updatedAt: doc.updatedAt });
}

async function manejarEstadoGet(
  env: ContabilidadEnv,
  vaultId: string,
  url: URL,
): Promise<Response> {
  const docCrudo = await env.CONTABILIDAD_VAULT.get(claveActual(vaultId));
  if (!docCrudo) {
    return respuestaJson({ success: true, noChanges: true });
  }

  const doc = parseDocumento(JSON.parse(docCrudo));
  if (!doc) {
    return respuestaError('Documento de bóveda corrupto (forma inválida).', 500);
  }

  // Sondeo barato (K-5): 1 get() y respuesta corta si el cliente conoce la versión.
  const versionCliente = url.searchParams.get('version');
  if (versionCliente !== null) {
    const n = Number(versionCliente);
    if (Number.isInteger(n) && doc.version <= n) {
      return respuestaJson({ success: true, noChanges: true });
    }
  }

  return respuestaJson({ success: true, noChanges: false, payload: doc });
}

/** Historial: SOLO metadatos por defecto (K-8, listado barato); con `?full=1`
 *  incluye los blobs cifrados para la restauración desde UI del cliente. */
async function manejarHistorialGet(
  env: ContabilidadEnv,
  vaultId: string,
  url: URL,
): Promise<Response> {
  const conBlobs = url.searchParams.get('full') === '1';
  const entradas: { version: number; updatedAt: string; deviceLabel: string; blob?: string }[] = [];
  for (let n = 0; n < HISTORIAL_MAX; n += 1) {
    const cruda = await env.CONTABILIDAD_VAULT.get(claveHistorial(vaultId, n));
    if (!cruda) continue;
    const entrada = parseEntradaHistorial(JSON.parse(cruda));
    if (entrada) {
      const metadatos = {
        version: entrada.version,
        updatedAt: entrada.updatedAt,
        deviceLabel: entrada.deviceLabel,
      };
      entradas.push(conBlobs ? { ...metadatos, blob: entrada.blob } : metadatos);
    }
  }
  return respuestaJson({ success: true, entradas });
}

/** Canal WebSocket en vivo (K-6): registro, ping y push_state. */
function manejarWebSocket(env: ContabilidadEnv, vaultId: string): Response {
  const webSocketPair = new WebSocketPair() as unknown as [
    WebSocket & WebSocketServerSide,
    WebSocket & WebSocketServerSide,
  ];
  const [cliente, servidor] = webSocketPair;

  servidor.accept();

  if (!conexionesPorBoveda.has(vaultId)) conexionesPorBoveda.set(vaultId, new Set());
  conexionesPorBoveda.get(vaultId)!.add(servidor);

  const liberar = () => {
    const sockets = conexionesPorBoveda.get(vaultId);
    if (!sockets) return;
    sockets.delete(servidor);
    if (sockets.size === 0) conexionesPorBoveda.delete(vaultId);
  };

  servidor.addEventListener('message', async (evento: MessageEvent) => {
    const rawData = typeof evento.data === 'string' ? evento.data : '';
    if (!rawData) return;

    try {
      const datos = JSON.parse(rawData) as { type?: unknown; payload?: unknown };
      if (datos.type === 'ping') {
        servidor.send(mensajePong());
        return;
      }
      if (datos.type === 'push_state' && datos.payload) {
        const doc = parseDocumento(datos.payload);
        if (!doc) {
          servidor.send(mensajeErrorWs('Documento push_state inválido.'));
          return;
        }
        await publicarDocumento(env, vaultId, doc);
        avisarOtros(vaultId, doc, servidor);
        servidor.send(
          JSON.stringify({ type: 'push_ack', version: doc.version, updatedAt: doc.updatedAt }),
        );
        return;
      }
      servidor.send(mensajeErrorWs('Mensaje no soportado en el canal.'));
    } catch {
      // Cuerpo no-JSON: el canal sigue vivo, el mensaje se ignora.
    }
  });

  servidor.addEventListener('close', liberar);
  servidor.addEventListener('error', liberar);

  return new Response(null, {
    status: 101,
    webSocket: cliente,
    headers: cabecerasCors(),
  } as ResponseInit & ResponseInitWorkers);
}

// --- Router -----------------------------------------------------------------

export default {
  async fetch(request: Request, env: ContabilidadEnv): Promise<Response> {
    const url = new URL(request.url);
    const ruta = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cabecerasCors() });
    }

    // Verificación de vida (informativa, sin datos de bóveda).
    if (ruta === '/health' || ruta === '/') {
      return respuestaJson({
        status: 'online',
        servicio: 'Relay de Sincronización Contabilidad M4',
        version: '1.0.0',
        ts: new Date().toISOString(),
      });
    }

    if (!env.CONTABILIDAD_VAULT) {
      return respuestaError('El espacio de nombres CONTABILIDAD_VAULT no está enlazado.', 503);
    }

    const coincidencia = ruta.match(/^\/api\/vault\/([^/]+)\/(state|history)$/);
    if (coincidencia) {
      const vaultId = coincidencia[1];
      if (!esVaultIdValido(vaultId)) {
        return respuestaError('Identificador de bóveda inválido.', 400);
      }
      const recurso = coincidencia[2];

      if (recurso === 'state') {
        if (request.method === 'PUT') return manejarEstadoPut(env, vaultId, request);
        if (request.method === 'GET') return manejarEstadoGet(env, vaultId, url);
      }
      if (recurso === 'history' && request.method === 'GET') {
        return manejarHistorialGet(env, vaultId, url);
      }
      return respuestaError('Método no soportado para este recurso.', 405);
    }

    if (ruta === '/ws') {
      const upgrade = request.headers.get('Upgrade');
      if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
        return respuestaError('Se esperaba actualización a WebSocket.', 426);
      }
      const vaultId = url.searchParams.get('vaultId');
      if (!esVaultIdValido(vaultId)) {
        return respuestaError('Parámetro vaultId requerido e inválido.', 400);
      }
      return manejarWebSocket(env, vaultId);
    }

    return respuestaError('Ruta no encontrada.', 404);
  },
};
