/**
 * env.d.ts — Tipado mínimo del runtime Workers para el relay.
 * Se declaran solo las piezas que el relay usa (K-1: sin dependencias nuevas):
 * `KVNamespace` (get/put/delete), `WebSocketPair`, el socket servidor
 * (con `accept`, inexistente en la librería DOM) y el extra de la
 * `ResponseInit` de Workers (`webSocket`), que permite devolver el extremo
 * cliente del par directo en la Response del handshake.
 */

/** Contrato mínimo de Workers KV usado por el relay. */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Par de sockets del runtime Workers para aceptar WebSockets servidor (dedicados).
 * Sintaxis nativa del runtime (equivalente a la de Teacher-Buddy).
 */
declare class WebSocketPair {
  [0]: unknown; // extremo cliente (devuelto en la Response)
  [1]: unknown; // extremo servidor (se acepta en el relay)
  [Symbol.iterator](): IterableIterator<unknown>;
}

/** Extensión del socket de Workers: aceptación del lado servidor. */
interface WebSocketServerSide {
  accept(): void;
}

/** Extensión de `ResponseInit` del runtime Workers: devolver el extremo cliente. */
interface ResponseInitWorkers {
  webSocket?: unknown;
}

/** Variables de entorno del relay. */
interface ContabilidadEnv {
  CONTABILIDAD_VAULT: KVNamespace;
}
