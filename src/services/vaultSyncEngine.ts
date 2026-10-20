/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * vaultSyncEngine.ts — Motor de auto-sync de la bóveda E2EE (Fase 4 de
 * PLAN_SYNC_KV.md). Máquina de estados "sucias" (K-7) sobre el relay de la
 * Fase 1 y la criptografía de la Fase 2:
 *
 * - PUSH: App dispara `schedulePublicacion()` al confirmar cada persistencia
 *   (debounce 1.5 s + coalescing 120 s, K-5). El contenido es el snapshot v3
 *   de `getSnapshot()` cifrado con AES-GCM (K-4).
 * - PULL: sondeo pasivo de 60 s (1 get; `?version=` barato) + WebSocket en
 *   vivo (K-6; degradación natural cuando el socket cae).
 * - CONFLICTO: remoto != última versión conocida Y local sucio → evento al
 *   modal (resolverConflicto). Solo un lado cambió → se auto-aplica (K-7).
 * - PUERTAS (K-11): nada se aplica si `puedeEscribir()` es falso (recarga
 *   C-4); el documento remoto queda en cola hasta `aplicarPendiente()`.
 * - ANTI-ECO: mientras `aplicandoRemoto`, `schedulePublicacion()` se suprime.
 *
 * El motor NO toca claves de dominio: solo lee el snapshot y pide la
 * restauración a través del puente (el orquestador `App` es el dueño, Fase 5).
 */

import { decryptPayload, encryptPayload } from '../lib/crypto';
import { esBackupV3, type RestorableBackup } from '../hooks/useBackup';
import { loadFromStorage, saveToStorage } from './storageService';
import type { CredencialesBoveda } from './vaultService';

// --- Constantes de disciplina temporal (K-5) ---------------------------------

export const DEBOUNCE_PUBLICACION_MS = 1500;
export const GAP_ESCRITURA_MS = 120000;
export const SONDEO_MS = 60000;
export const LATIDO_WS_MS = 25000;
export const RECONEXION_WS_MS = 5000;

/** Claves de storage del estado del motor (K-7). */
export const CLAVE_ULTIMA_VERSION = 'contasis_vault_last_version';
export const CLAVE_SUCIO = 'contasis_vault_dirty';

// --- Tipos -------------------------------------------------------------------

/** Estados del motor para UI (indicador del AppHeader, Fase 5). */
export type EstadoMotor
  = 'inactivo'
    | 'al dia'
    | 'publicando'
    | 'sucio'
    | 'aplicando'
    | 'conflicto'
    | 'error';

/** Documento remoto del relay (espejo del `DocumentoBoveda` del worker). */
export interface DocumentoRemoto {
  version: number;
  updatedAt: string;
  deviceLabel: string;
  blob: string; // JSON.stringify(SobreCifrado)
}

/** Eventos que el motor notifica a la UI/App. */
export type EventoMotor = {
  tipo: 'cambio' | 'publicado' | 'aplicado' | 'recibido';
  version?: number;
  detalle?: string;
} | {
  tipo: 'conflicto';
  version: number;
  deviceLabel: string;
  updatedAt: string;
  detalle?: string;
} | {
  tipo: 'error';
  detalle: string;
};

/** Decisión frente a un documento remoto (K-7; función pura). */
export type DecisionRemota = 'ignorar' | 'aplicar' | 'conflicto';

export function decidirFrenteDocumento(params: {
  versionRemota: number;
  versionLocal: number | null;
  sucio: boolean;
}): DecisionRemota {
  const { versionRemota, versionLocal, sucio } = params;
  if (versionLocal !== null && versionRemota <= versionLocal) return 'ignorar';
  return sucio ? 'conflicto' : 'aplicar';
}

/** Versión siguiente de publicación: siempre supera lo conocido (K-7). */
export function definirSiguienteVersion(
  versionLocal: number | null,
  versionEnConflicto: number | null = null,
): number {
  const base = Math.max(versionLocal ?? 0, versionEnConflicto ?? 0);
  return base + 1;
}

/** Parceo y validación del documento remoto (espejo del worker). */
export function parseDocumentoRemoto(crudo: unknown): DocumentoRemoto | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const d = crudo as Record<string, unknown>;
  if (typeof d.version !== 'number' || !Number.isInteger(d.version) || d.version < 1) return null;
  if (typeof d.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(d.updatedAt)) return null;
  if (typeof d.deviceLabel !== 'string' || d.deviceLabel.length < 1 || d.deviceLabel.length > 64) return null;
  if (typeof d.blob !== 'string' || d.blob.length < 16) return null;
  return { version: d.version, updatedAt: d.updatedAt, deviceLabel: d.deviceLabel, blob: d.blob };
}

// --- Puente con el orquestador (K-11) ----------------------------------------

/** Contrato que `App` entrega al motor (única puerta con el resto del sistema). */
export interface PuenteBoveda {
  /** Snapshot v3 completo de todos los clientes (useBackup.getSnapshot). */
  getSnapshot(): Promise<unknown>;
  /** Restauración v3 por DV-C-3 (App.restore). true = aplicada. */
  restaurar(snapshot: unknown): Promise<boolean>;
  /** Puerta canSave del boot/recarga C-4. */
  puedeEscribir(): boolean;
  /** Credenciales vigentes (null = dispositivo desalistado). */
  credenciales(): Promise<CredencialesBoveda | null>;
  /** URL base del relay ('' si sin configuración). */
  relayUrl(): string;
}

/** Inyecciones de prueba (fetch/WebSocket/almacenamiento fake). */
export interface OpcionesMotor {
  fetchImpl?: typeof fetch;
  socketFactory?: (url: string) => SocketSimple;
  guardar?: (clave: string, valor: unknown) => Promise<void>;
  leer?: (clave: string) => Promise<unknown>;
  hayGlobal?: () => boolean; // existencia de window/document (defensive p/ tests)
}

/** Mínimo de WebSocket que el motor necesita (igual a la api real). */
export interface SocketSimple {
  send(data: string): unknown;
  close(): void;
  addEventListener(event_type: string, listener: (evento: { data?: unknown }) => void): void;
  removeEventListener(event_type: string, listener: (evento: { data?: unknown }) => void): void;
}

interface CuerpoEstadoRemoto {
  success?: boolean;
  noChanges?: boolean;
  payload?: unknown;
}

// --- Motor -------------------------------------------------------------------

export class VaultSyncEngine {
  private puente: PuenteBoveda;
  private opciones: OpcionesMotor;

  private estado: EstadoMotor = 'inactivo';
  private credencial: CredencialesBoveda | null = null;
  private versionLocal: number | null = null;
  private sucio = false;
  private activo = false;

  private pendiente: DocumentoRemoto | null = null;
  private conflicto: DocumentoRemoto | null = null;
  private aplicandoRemoto = false;
  private ultimaPublicacion = 0;

  private socket: SocketSimple | null = null;
  private temporizadorDebounce: ReturnType<typeof setTimeout> | null = null;
  private temporizadorGap: ReturnType<typeof setTimeout> | null = null;
  private temporizadorSondeo: ReturnType<typeof setInterval> | null = null;
  private temporizadorLatido: ReturnType<typeof setInterval> | null = null;
  private temporizadorReconexion: ReturnType<typeof setTimeout> | null = null;

  private listeners = new Set<(e: EventoMotor) => void>();

  constructor(puente: PuenteBoveda, opciones: OpcionesMotor = {}) {
    this.puente = puente;
    this.opciones = opciones;
  }

  suscribir(listener: (e: EventoMotor) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getEstado(): EstadoMotor {
    return this.estado;
  }

  getVersionLocal(): number | null {
    return this.versionLocal;
  }

  getSucio(): boolean {
    return this.sucio;
  }

  getConflicto(): DocumentoRemoto | null {
    return this.conflicto;
  }

  private notificar(evento: EventoMotor): void {
    this.listeners.forEach((l) => l(evento));
  }

  private setEstado(nuevo: EstadoMotor): void {
    if (this.estado !== nuevo) {
      this.estado = nuevo;
      this.notificar({ tipo: 'cambio', detalle: nuevo });
    }
  }

  // --- Almacenamiento del puntero de versión/dirty ---------------------------

  private async persistirVersion(valor: number | null): Promise<void> {
    const guardar = this.opciones.guardar ?? saveToStorage;
    await guardar(CLAVE_ULTIMA_VERSION, valor);
  }

  private async persistirSucio(): Promise<void> {
    const guardar = this.opciones.guardar ?? saveToStorage;
    await guardar(CLAVE_SUCIO, this.sucio);
  }

  private async cargar(): Promise<void> {
    const leer = this.opciones.leer ?? loadFromStorage;
    const crudaVersion: unknown = await leer(CLAVE_ULTIMA_VERSION).catch(() => null);
    if (typeof crudaVersion === 'number' && Number.isInteger(crudaVersion) && crudaVersion >= 0) {
      this.versionLocal = crudaVersion;
    }
    const crudaSucio: unknown = await leer(CLAVE_SUCIO).catch(() => null);
    this.sucio = crudaSucio === true;
  }

  // --- Ciclo de vida ---------------------------------------------------------

  /** Innaje el motor: carga credenciales/punteros y activa sondeo + socket. */
  async activar(): Promise<void> {
    if (this.activo) return;
    this.credencial = await this.puente.credenciales();
    if (!this.credencial) {
      this.notificar({ tipo: 'cambio', detalle: 'sin bóveda' });
      return;
    }
    await this.cargar();
    this.activo = true;
    this.setEstado('al dia');

    if (this.sucio) this.schedulePublicacion();

    this.temporizadorSondeo = setInterval(() => {
      void this.sondeoPasivo();
    }, SONDEO_MS);
    void this.sondeoPasivo();

    this.conectarSocket();

    window.addEventListener('online', this.alVolverConexion);
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
  }

  /** Apaga intervals/sockets/listeners (cambio cliente no apaga el motor). */
  parar(): void {
    this.activo = false;
    this.temporizadorDebounce && clearTimeout(this.temporizadorDebounce);
    this.temporizadorGap && clearTimeout(this.temporizadorGap);
    this.temporizadorSondeo && clearInterval(this.temporizadorSondeo);
    this.temporizadorLatido && clearInterval(this.temporizadorLatido);
    this.temporizadorReconexion && clearTimeout(this.temporizadorReconexion);
    this.temporizadorDebounce = null;
    this.temporizadorGap = null;
    this.temporizadorSondeo = null;
    this.temporizadorLatido = null;
    this.temporizadorReconexion = null;
    this.cerrarSocket();
    window.removeEventListener('online', this.alVolverConexion);
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
  }

  private alVolverConexion = () => {
    void this.sondeoPasivo();
  };

  private alCambiarVisibilidad = () => {
    if (!document.hidden) void this.sondeoPasivo();
  };

  // --- PUSH (K-5) ------------------------------------------------------------

  /** App lo llama al confirmar una persistencia. Anti-eco + puertas K-11. */
  schedulePublicacion(): void {
    if (this.aplicandoRemoto) return;
    if (!this.puente.puedeEscribir()) return;
    this.sucio = true;
    void this.persistirSucio();
    if (this.estado !== 'conflicto') this.setEstado('sucio');

    if (this.temporizadorDebounce) clearTimeout(this.temporizadorDebounce);
    this.temporizadorDebounce = setTimeout(() => {
      this.temporizadorDebounce = null;
      void this.publicar();
    }, DEBOUNCE_PUBLICACION_MS);
  }

  /** Publica el snapshot YA (Flush forzado/Botón del modal). Ignora el gap. */
  async publicarAhora(): Promise<boolean> {
    if (this.temporizadorDebounce) {
      clearTimeout(this.temporizadorDebounce);
      this.temporizadorDebounce = null;
    }
    return this.publicar();
  }

  private async publicar(): Promise<boolean> {
    const credencial = this.credencial;
    if (!credencial || !this.activo) return false;
    if (this.estado === 'aplicando') return false; // conflicto en curso (K-7: decide la UI)
    if (this.estado === 'publicando') return false; // anti-reingreso (void async)

    // Coalescing: si publicamos recientemente, posponer (K-5) salvo flush forzado.
    const trasDebounce = Date.now() - this.ultimaPublicacion;
    const restante = GAP_ESCRITURA_MS - trasDebounce;
    if (restante > 0 && this.ultimaPublicacion > 0) {
      if (this.temporizadorGap) clearTimeout(this.temporizadorGap);
      this.temporizadorGap = setTimeout(() => {
        this.temporizadorGap = null;
        void this.publicar();
      }, restante);
      return false;
    }

    const relayUrl = this.puente.relayUrl();
    if (!relayUrl) {
      this.notificar({ tipo: 'error', detalle: 'URL del relay no configurada.' });
      return false;
    }

    // La marca temporal se anota AL ENTRAR: publicaciones concurrentes ven un
    // timestamp fresco aunque la actual siga volando (coalescing estable).
    this.ultimaPublicacion = Date.now();

    this.setEstado('publicando');
    try {
      const snapshotV3 = await this.puente.getSnapshot();
      if (!esBackupV3(snapshotV3 as RestorableBackup)) {
        throw new Error('El snapshot no tiene formato v3 (empresas[]).');
      }
      const sobre = await encryptPayload(JSON.stringify(snapshotV3), credencial.secretKey);
      const documento = {
        version: definirSiguienteVersion(this.versionLocal, this.conflicto?.version ?? null),
        updatedAt: new Date().toISOString(),
        deviceLabel: credencial.deviceLabel,
        blob: JSON.stringify(sobre),
      };

      const fetchImpl = this.opciones.fetchImpl ?? fetch;
      const respuesta = await fetchImpl(`${relayUrl}/api/vault/${credencial.vaultId}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(documento),
      });
      if (!respuesta.ok) {
        throw new Error(`Relay respondió ${respuesta.status} al publicar.`);
      }

      this.versionLocal = documento.version;
      this.sucio = false;
      this.conflicto = null;
      await this.persistirVersion(documento.version);
      await this.persistirSucio();
      this.setEstado('al dia');
      this.notificar({ tipo: 'publicado', version: documento.version });
      return true;
    } catch (error) {
      // Nada quedó publicado: reiniciar la marca de gap para permitir
      // reintentos inmediatos con el siguiente evento (sin castigo de 120 s).
      this.ultimaPublicacion = 0;
      this.setEstado('al dia');
      this.notificar({
        tipo: 'error',
        detalle: error instanceof Error ? error.message : 'Fallo al publicar en la bóveda.',
      });
      // Reintento natural con el próximo `schedulePublicacion()`; el usuario
      // también puede forzar con publicarAhora (flush manual).
      return false;
    }
  }

  // --- PULL (K-6) ------------------------------------------------------------

  private async sondeoPasivo(): Promise<void> {
    if (!this.activo || !this.credencial) return;
    if (document.hidden) return;
    if (this.socketActivo()) return; // WebSocket vivo: actualizaciones en vivo ya cubren
    if (this.pendiente) {
      this.aplicarPendiente();
      return;
    }

    const relayUrl = this.puente.relayUrl();
    if (!relayUrl) return;

    const query = this.versionLocal !== null ? `?version=${this.versionLocal}` : '';
    try {
      const fetchImpl = this.opciones.fetchImpl ?? fetch;
      const respuesta = await fetchImpl(
        `${relayUrl}/api/vault/${this.credencial.vaultId}/state${query}`,
      );
      if (!respuesta.ok) return;
      const cuerpo = (await respuesta.json()) as CuerpoEstadoRemoto;
      if (cuerpo.noChanges || !cuerpo.payload) return;

      const doc = parseDocumentoRemoto(cuerpo.payload);
      if (doc) await this.ingresarDocumentoRemoto(doc);
    } catch {
      // Relay sin conexión o respuesta imposible de desempaquetar: el sondeo
      // calla hasta el siguiente intento.
    }
  }

  // --- Socket en vivo (K-6) ---------------------------------------------------

  private socketActivo(): boolean {
    return this.socket !== null;
  }

  private conectarSocket(): void {
    const relayUrl = this.puente.relayUrl();
    const credencial = this.credencial;
    if (!relayUrl || !credencial) return;
    try {
      const factory = this.opciones.socketFactory
        ?? ((url: string) => new WebSocket(url) as unknown as SocketSimple);
      const socketUrl = `${relayUrl.replace(/^http/, 'ws')}/ws?vaultId=${credencial.vaultId}`;
      const socket = factory(socketUrl);
      this.socket = socket;

      socket.addEventListener('message', (evento) => {
        const rawData = typeof evento.data === 'string' ? evento.data : '';
        if (!rawData) return;
        try {
          const datos = JSON.parse(rawData) as { type?: unknown; payload?: unknown };
          if (datos.type === 'remote_state' && datos.payload) {
            const doc = parseDocumentoRemoto(datos.payload);
            if (doc) void this.ingresarDocumentoRemoto(doc);
          }
        } catch {
          // Mensaje roto: el canal sigue vivo.
        }
      });

      socket.addEventListener('close', () => {
        this.reprogramarSocket();
      });
      socket.addEventListener('error', () => {
        try {
          socket.close();
        } catch {
          // ya cerrado
        }
        this.reprogramarSocket();
      });

      this.temporizadorLatido = setInterval(() => {
        try {
          socket.send(JSON.stringify({ type: 'ping' }));
        } catch {
          try {
            socket.close();
          } catch {
            // cerrado
          }
        }
      }, LATIDO_WS_MS);
    } catch {
      // Sin socket (entorno sin WebSocket): permanece el sondeo pasivo (K-6).
    }
  }

  private reprogramarSocket(): void {
    this.socket = null;
    if (this.temporizadorLatido) {
      clearInterval(this.temporizadorLatido);
      this.temporizadorLatido = null;
    }
    if (!this.activo) return;
    if (this.temporizadorReconexion) return; // ya programada
    this.temporizadorReconexion = setTimeout(() => {
      this.temporizadorReconexion = null;
      this.conectarSocket();
    }, RECONEXION_WS_MS);
  }

  private cerrarSocket(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ya cerrado
      }
      this.socket = null;
    }
    if (this.temporizadorLatido) {
      clearInterval(this.temporizadorLatido);
      this.temporizadorLatido = null;
    }
  }

  // --- Resolución del remoto (K-7) --------------------------------------------

  /**
   * Puerta única de documentos remotos (WS, sondeo y entrada del modal).
   * Cola si el motor está ocupado o `puedeEscribir()` es falso (K-11).
   */
  async ingresarDocumentoRemoto(doc: DocumentoRemoto): Promise<void> {
    const decision = decidirFrenteDocumento({
      versionRemota: doc.version,
      versionLocal: this.versionLocal,
      sucio: this.sucio && !this.aplicandoRemoto,
    });

    if (decision === 'ignorar') return;

    if (decision === 'aplicar') {
      await this.aplicarDocumento(doc);
      return;
    }

    // conflicto
    const cambiado = this.conflicto?.version !== doc.version;
    this.conflicto = doc;
    this.setEstado('conflicto');
    if (cambiado) {
      this.notificar({
        tipo: 'conflicto',
        version: doc.version,
        deviceLabel: doc.deviceLabel,
        updatedAt: doc.updatedAt,
      });
    }
  }

  /**
   * Cola cuando puedeEscribir=false (recarga C-4): el orquestador llama en el
   * momento en que canSave vuelve a verde.
   */
  async aplicarPendiente(): Promise<void> {
    if (this.pendiente) {
      const doc = this.pendiente;
      this.pendiente = null;
      await this.ingresarDocumentoRemoto(doc);
    }
  }

  /** Resolución explícita del conflicto (botones del modal, K-7). */
  async resolverConflicto(mantenerLocal: boolean): Promise<boolean> {
    const conflicto = this.conflicto;
    if (!conflicto) return false;

    if (mantenerLocal) {
      // Se publica el estado local TOMANDO en cuenta la versión del remoto:
      // quien elige local "gana" y ambos lados terminan con la misma versión nueva.
      const ok = await this.publicar();
      if (ok) {
        this.conflicto = null;
        this.setEstado('al dia');
      }
      return ok;
    }

    this.conflicto = null;
    await this.aplicarDocumento(conflicto);
    return true;
  }

  /** Descarta el conflicto (mantener estado en pantalla hasta nueva señal). */
  descartarConflicto(): void {
    this.conflicto = null;
    if (this.estado === 'conflicto') this.setEstado('al dia');
  }

  private async aplicarDocumento(doc: DocumentoRemoto): Promise<void> {
    if (this.aplicandoRemoto || this.estado === 'publicando') {
      this.pendiente = doc;
      this.notificar({ tipo: 'recibido', version: doc.version, detalle: 'en cola' });
      return;
    }
    if (!this.puente.puedeEscribir()) {
      this.pendiente = doc;
      this.notificar({ tipo: 'recibido', version: doc.version, detalle: 'en cola (recarga)' });
      return;
    }

    const credencial = this.credencial;
    if (!credencial) return;

    this.setEstado('aplicando');
    this.aplicandoRemoto = true;
    try {
      const sobre = JSON.parse(doc.blob) as unknown;
      const texto = await decryptPayload(sobre, credencial.secretKey);
      const snapshotV3 = JSON.parse(texto) as unknown;
      if (!esBackupV3(snapshotV3 as RestorableBackup)) {
        throw new Error('El documento remoto no contiene un snapshot v3 válido.');
      }
      const aplicado = await this.puente.restaurar(snapshotV3);
      if (!aplicado) {
        throw new Error('El orquestador no aplicó la restauración remota.');
      }
      await this.persistirVersion(doc.version);
      this.versionLocal = doc.version;
      this.setEstado('al dia');
      this.notificar({ tipo: 'aplicado', version: doc.version });
    } catch (error) {
      this.notificar({
        tipo: 'error',
        detalle: error instanceof Error ? error.message : 'No se pudo aplicar el remoto.',
      });
    } finally {
      this.aplicandoRemoto = false;
    }
  }
}
