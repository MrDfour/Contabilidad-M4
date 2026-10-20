/**
 * relay.ts — Lógica pura del relay de sincronización (bóveda E2EE).
 * Puntos de diseño (PLAN_SYNC_KV.md):
 * - K-4/K-5: documento ÚNICO por bóveda (`vlt:<vaultId>:actual`) con
 *   { version, updatedAt, deviceLabel, blob }; un push = 1 put() del documento
 *   (+ 1 put() por entrada de historial, K-8).
 * - K-6: broadcast WebSocket del mensaje `remote_state` con el documento nuevo.
 * - K-8: historial rotativo `vlt:<vaultId>:hist:<n>` (máx HISTORIAL_MAX, TTL común).
 * - Validación estricta de entrada: el relay es agnóstico (solo blobs opacos).
 */

// --- Constantes del relay -------------------------------------------------

/** TTL del documento e historial (30 días; se renueva en cada put). */
export const TTL_SEGUNDOS = 60 * 60 * 24 * 30;

/** Máximo de entradas del historial rotativo (K-8). */
export const HISTORIAL_MAX = 5;

/** Límite defensivo del blob opaco (los snapshots contables van del orden de KB). */
export const BLOB_MAX_BYTES = 5 * 1024 * 1024;

/** Prefijo de la clave del documento vigente. */
export const PREFIJO_VAULT = 'vlt';

/** Sufijo fijo del documento vigente. */
export const SUFIJO_ACTUAL = 'actual';

/** Documento vigente de una bóveda (estructura persistida en KV). */
export interface DocumentoBoveda {
  version: number;
  updatedAt: string;
  deviceLabel: string;
  blob: string; // sobre cifrado (K-3): { ciphertext, iv, salt, algorithm, version } serializado
}

/** Entrada de historial (estructura persistida en KV). */
export interface EntradaHistorial {
  version: number;
  updatedAt: string;
  deviceLabel: string;
  blob: string;
}

// --- Claves ---------------------------------------------------------------

/**
 * Clave del documento vigente: `vlt:<vaultId>:actual`.
 * Una sola clave → el sondeo de "¿hay cambios?" cuesta 1 get() (K-5), sin list().
 */
export function claveActual(vaultId: string): string {
  return `${PREFIJO_VAULT}:${vaultId}:${SUFIJO_ACTUAL}`;
}

/** Clave de entrada del historial (n = 0..HISTORIAL_MAX-1; 0 = la más nueva). */
export function claveHistorial(vaultId: string, n: number): string {
  return `${PREFIJO_VAULT}:${vaultId}:hist:${n}`;
}

/** Valida la forma del identificador de bóveda (escudo defensivo, no secreto). */
export function esVaultIdValido(vaultId: unknown): vaultId is string {
  return typeof vaultId === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(vaultId);
}

// --- Validación del documento ---------------------------------------------

/** Fecha ISO estricta (el documento solo viaja con fechas del propio cliente). */
function esFechaIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !valor) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(valor)) return false;
  return !Number.isNaN(Date.parse(valor));
}

/**
 * Valida el cuerpo crudo de un push (HTTP o mensaje `push_state` por WS).
 * Regresa el documento tipado o `null` si la forma es inválida.
 */
export function parseDocumento(crudo: unknown): DocumentoBoveda | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const d = crudo as Record<string, unknown>;

  if (typeof d.version !== 'number' || !Number.isInteger(d.version) || d.version < 1) {
    return null;
  }
  if (!esFechaIso(d.updatedAt)) return null;

  if (typeof d.deviceLabel !== 'string' || d.deviceLabel.length < 1 || d.deviceLabel.length > 64) {
    return null;
  }

  if (typeof d.blob !== 'string' || d.blob.length < 16) return null;

  // Límite defensivo en bytes (los cuerpos reales van en KB).
  if (new TextEncoder().encode(d.blob).length > BLOB_MAX_BYTES) return null;

  return {
    version: d.version,
    updatedAt: d.updatedAt,
    deviceLabel: d.deviceLabel,
    blob: d.blob,
  };
}

/**
 * Versión pura de la rotación de historial (K-8): recibe la lista de entradas
 * existentes ordenadas de más nueva a más vieja (posición 0 = la nueva que salió
 * del documento) y regresa el plan de escrituras listo para el runtime.
 * La entrada `anterior` siempre entra en la posición 0; cada existente se
 * desplaza una posición; la que salga del tope HISTORIAL_MAX se borra.
 */
export function planRotarHistorial(
  vaultId: string,
  anterior: DocumentoBoveda,
  existentes: EntradaHistorial[],
): { escriben: { clave: string; valor: string }[]; borran: string[] } {
  const lista: EntradaHistorial[] = [anterior, ...existentes]
    .slice(0, HISTORIAL_MAX)
    .map((e) => ({
      version: e.version,
      updatedAt: e.updatedAt,
      deviceLabel: e.deviceLabel,
      blob: e.blob,
    }));

  const escriben = lista.map((entrada, indice) => ({
    clave: claveHistorial(vaultId, indice),
    valor: JSON.stringify(entrada),
  }));

  const borran: string[] = [];
  // Si el historial estaba lleno, la entrada más vieja (n = HISTORIAL_MAX-1) se
  // desplaza fuera del tope: queda descartada y su clave se borra.
  if (existentes.length >= HISTORIAL_MAX) {
    borran.push(claveHistorial(vaultId, HISTORIAL_MAX - 1));
  }

  return { escriben, borran };
}

/** Parsea la entrada cruda del historial; regresa null si la forma es inválida. */
export function parseEntradaHistorial(crudo: unknown): EntradaHistorial | null {
  return parseDocumento(crudo);
}

// --- Mensajes del canal WebSocket (K-6) -------------------------------------

/** Mensaje cliente → relay: ping de mantenimiento. */
export function mensajePing(): string {
  return JSON.stringify({ type: 'ping' });
}

/** Mensaje relay → cliente: respuesta al ping. */
export function mensajePong(): string {
  return JSON.stringify({ type: 'pong', ts: Date.now() });
}

/** Mensaje cliente → relay: publica el documento por el canal vivo (latencia 0). */
export function mensajePushState(doc: DocumentoBoveda): string {
  return JSON.stringify({ type: 'push_state', payload: doc });
}

/** Mensaje relay → clientes: retransmisión del documento nuevo. */
export function mensajeRemoteState(doc: DocumentoBoveda): string {
  return JSON.stringify({ type: 'remote_state', payload: doc });
}

/** Mensaje relay → cliente: advertencia de fallo de validación o de uso del canal. */
export function mensajeErrorWs(detalle: string): string {
  return JSON.stringify({ type: 'error', detalle });
}
