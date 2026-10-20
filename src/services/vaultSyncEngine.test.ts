/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VaultSyncEngine,
  decidirFrenteDocumento,
  definirSiguienteVersion,
  parseDocumentoRemoto,
  DEBOUNCE_PUBLICACION_MS,
  GAP_ESCRITURA_MS,
  SONDEO_MS,
  type DocumentoRemoto,
  type EventoMotor,
  type PuenteBoveda,
  type SocketSimple,
} from './vaultSyncEngine';
import { generarClaveSecreta, encryptPayload } from '../lib/crypto';

// Snapshot v3 de prueba (2 clientes contables) y credencial real de prueba.
const SNAPSHOT_V3 = {
  empresas: [
    {
      id: 'e1',
      nombre: 'Mi Empresa',
      polizas: [],
      accounts: [],
      fixedAssets: [],
      finalInventories: {},
    },
    {
      id: 'e2',
      nombre: 'Comercialera',
      polizas: [],
      accounts: [],
      fixedAssets: [],
      finalInventories: {},
    },
  ],
  activaId: 'e1',
};

const FECHA = '2026-10-20T12:00:00.000Z';
const SECRETA = generarClaveSecreta();

/** Documento remoto REAL (blob cifrado con la credencial de prueba). */
async function docRemoto(version: number, deviceLabel = 'Otro'): Promise<DocumentoRemoto> {
  const sobre = await encryptPayload(JSON.stringify(SNAPSHOT_V3), SECRETA);
  return { version, updatedAt: FECHA, deviceLabel, blob: JSON.stringify(sobre) };
}

/** Almacenamiento en memoria (fake del storage multiplataforma). */
function fabricarAlmacen() {
  const datos = new Map<string, unknown>();
  return {
    datos,
    guardar: async (clave: string, valor: unknown) => {
      datos.set(clave, valor);
    },
    leer: async (clave: string) => (datos.has(clave) ? datos.get(clave) : null),
  };
}

/** Puente fake con spies de restauración y puerta canSave mutable. */
function fabricarPuente(
  sobrescribir: Partial<PuenteBoveda> = {},
): PuenteBoveda & { registro: { aplicados: unknown[]; puede: boolean } } {
  const registro = { aplicados: [] as unknown[], puede: true };
  const base: PuenteBoveda = {
    getSnapshot: async () => JSON.parse(JSON.stringify(SNAPSHOT_V3)),
    restaurar: async (snapshot: unknown) => {
      registro.aplicados.push(snapshot);
      return true;
    },
    puedeEscribir: () => registro.puede,
    credenciales: async () => ({
      vaultId: 'vlt_abcd1234ef56',
      secretKey: SECRETA,
      frase: '',
      deviceLabel: 'Escritorio',
      createdAt: FECHA,
    }),
    relayUrl: () => 'http://localhost:8787',
  };
  return Object.assign(base, sobrescribir, {
    get registro() {
      return registro;
    },
  }) as PuenteBoveda & { registro: { aplicados: unknown[]; puede: boolean } };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Funciones puras ---------------------------------------------------------

describe('vaultSyncEngine: decisiones puras (K-7)', () => {
  it('decidirFrenteDocumento: ignorar/aplicar/conflicto según versión y suciedad', () => {
    expect(decidirFrenteDocumento({ versionRemota: 3, versionLocal: 3, sucio: false })).toBe('ignorar');
    expect(decidirFrenteDocumento({ versionRemota: 2, versionLocal: 3, sucio: true })).toBe('ignorar');
    expect(decidirFrenteDocumento({ versionRemota: 5, versionLocal: 3, sucio: false })).toBe('aplicar');
    expect(decidirFrenteDocumento({ versionRemota: 5, versionLocal: 3, sucio: true })).toBe('conflicto');
  });

  it('definirSiguienteVersion: nunca repite ni regresa', () => {
    expect(definirSiguienteVersion(null)).toBe(1);
    expect(definirSiguienteVersion(4)).toBe(5);
    expect(definirSiguienteVersion(4, 9)).toBe(10);
    expect(definirSiguienteVersion(null, 9)).toBe(10);
  });

  it('parseDocumentoRemoto acepta la forma del relay y rechaza inválidas', () => {
    const doc = {
      version: 2,
      updatedAt: FECHA,
      deviceLabel: 'Escritorio',
      blob: 'una-clave-larga-de-blob-1234',
    };
    expect(parseDocumentoRemoto(doc)).toEqual(doc);
    expect(parseDocumentoRemoto({ ...doc, version: 0 })).toBeNull();
    expect(parseDocumentoRemoto({ ...doc, updatedAt: 'ayer' })).toBeNull();
    expect(parseDocumentoRemoto(null)).toBeNull();
  });
});

// --- PUSH (K-5) ---------------------------------------------------------------

describe('vaultSyncEngine: push con debounce y coalescing', () => {
  it('schedulePublicacion publica tras el debounce; el blob descifra al snapshot v3', async () => {
    const puente = fabricarPuente();
    const almacen = fabricarAlmacen();
    // Puntero local pre-cargado: lo publicado por otro dispositivo llegó antes.
    await almacen.guardar('contasis_vault_last_version', 1);

    const pasesPut: DocumentoRemoto[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      pasesPut.push(JSON.parse(String(init?.body)) as DocumentoRemoto);
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;

    const motor = new VaultSyncEngine(puente, {
      fetchImpl,
      guardar: almacen.guardar,
      leer: almacen.leer,
    });
    await motor.activar();
    expect(motor.getVersionLocal()).toBe(1);

    motor.schedulePublicacion();
    expect(motor.getSucio()).toBe(true);
    expect(motor.getEstado()).toBe('sucio');

    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(pasesPut).toHaveLength(1));

    expect(pasesPut).toHaveLength(1);
    expect(pasesPut[0].version).toBe(2);
    expect(almacen.datos.get('contasis_vault_last_version')).toBe(2);
    expect(almacen.datos.get('contasis_vault_dirty')).toBe(false);
    expect(motor.getSucio()).toBe(false);
    expect(motor.getVersionLocal()).toBe(2);

    const snapshotVuelta = JSON.parse(
      await (await import('../lib/crypto')).decryptPayload(JSON.parse(pasesPut[0].blob), SECRETA),
    );
    expect(snapshotVuelta).toEqual(SNAPSHOT_V3);

    motor.parar();
  });

  it('dos eventos dentro del gap de 120 s → 1 sola publicacion', async () => {
    const puente = fabricarPuente();
    let puestas = 0;
    const fetchImpl = vi.fn(async (_url: string | Request, init?: RequestInit) => {
      if (init?.method === 'PUT') puestas += 1;
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(puestas).toBe(1));
    const trasPrimero = puestas;
    expect(trasPrimero).toBe(1);

    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    expect(puestas).toBe(trasPrimero); // el gap retiene

    await vi.advanceTimersByTimeAsync(GAP_ESCRITURA_MS);
    await vi.waitFor(() => expect(puestas).toBe(trasPrimero + 1));

    motor.parar();
  });

  it('publicarAhora DENTRO del gap publica ya (el coalescing no censura el flush)', async () => {
    // BUG hallado en producción 0.9.6: el botón "Publicar ahora" caía en el
    // coalescing de 120 s y regresaba false — el modal lo mostraba como
    // "El relay no respondió" cuando la publicación previa había triunfado.
    const puente = fabricarPuente();
    let puestas = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') puestas += 1;
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(puestas).toBe(1));

    // Edición dentro del gap: el flujo automático queda retenido…
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    expect(puestas).toBe(1);

    // …pero el flush explícito del usuario atraviesa el coalescing.
    const ok = await motor.publicarAhora();
    expect(ok).toBe(true);
    await vi.waitFor(() => expect(puestas).toBe(2));

    motor.parar();
  });

  it('publicarAhora mientras vuela una publicación espera su desenlace, no se rinde', async () => {
    const puente = fabricarPuente();
    let resolver: ((respuesta: Response) => void) | null = null;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        // El PRIMER PUT queda en vuelo a mano (deferred); los siguientes
        // responden al instante (el anti-eco vale para ediciones, no aquí).
        if (!resolver) {
          return new Promise<Response>((res) => {
            resolver = res;
          });
        }
        return new Response('{"success":true}', { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(resolver).not.toBeNull()); // PUT en vuelo

    // Pulsar el botón con el PUT en vuelo: la llamada se acopla a la promesa
    // del vuelo (antes regresaba false de pura gana — "relay no respondió").
    const manual = motor.publicarAhora();
    resolver?.(new Response('{"success":true}', { status: 200 }));
    expect(await manual).toBe(true);

    motor.parar();
  });

  it('puedeEscribir=false (recarga C-4) → no agenda ni marca sucio', async () => {
    const puente = fabricarPuente();
    puente.registro.puede = false;
    let puestas = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') puestas += 1;
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    motor.schedulePublicacion();
    expect(motor.getSucio()).toBe(false);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS * 3);
    await vi.waitFor(() => expect(motor.getEstado()).toBe('al dia'));
    expect(puestas).toBe(0); // el sondeo GET es legítimo; ningún PUT salió

    motor.parar();
  });

  it('chequeo pre-publicación: flujo normal (remoto acorde) no altera el PUT', async () => {
    // GET devuelve el "actual" ALINEADO con lo local (v = 2 tras la 1.ª puesta):
    // el chequeo respeta el floor y la cronología queda intacta.
    const puente = fabricarPuente();
    const puestas: number[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const cuerpo = JSON.parse(String(init.body)) as { version: number };
        puestas.push(cuerpo.version);
        return new Response('{"success":true}', { status: 200 });
      }
      const vigente = puestas.length > 0
        ? { payload: { version: puestas.length, updatedAt: FECHA, deviceLabel: 'Escritorio', blob: 'zz' } }
        : { noChanges: true };
      return new Response(JSON.stringify({ success: true, ...vigente }), { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(puestas).toEqual([1]));

    motor.parar();
  });

  it('chequeo pre-publicación: LIMPIO con remoto más nuevo absorbe y NO repite versión', async () => {
    // El flush del modal sobre un dispositivo limpio con remoto v5 existente:
    // se absorbe el contenido y el anti-eco suprime el PUT (nada nuevo que dar).
    const puente = fabricarPuente();
    const doc = await docRemoto(5);
    let puts = 0;
    let gets = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts += 1;
        return new Response('{"success":true}', { status: 200 });
      }
      gets += 1;
      return gets === 1
        ? new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 })
        : new Response(JSON.stringify({ success: true, noChanges: false, payload: doc }), { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    const ok = await motor.publicarAhora();
    expect(ok).toBe(true);
    expect(puente.registro.aplicados).toHaveLength(1); // se absorbió el remoto
    expect(motor.getVersionLocal()).toBe(5); // el puntero subió al remoto
    expect(puts).toBe(0); // anti-eco: el contenido absorbido no se repite al PUT

    motor.parar();
  });

  it('chequeo pre-publicación: SUCIO con remoto más nuevo → conflicto K-7, sin PUT a tientas', async () => {
    // El fusible del escenario "batería": el motor DESCUBRE por sí mismo la
    // colisión de versión ANTES del PUT y abre el modal en vez de pisar el blob.
    const puente = fabricarPuente();
    const doc = await docRemoto(5);
    let puts = 0;
    let gets = 0;
    const eventos: EventoMotor[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts += 1;
        return new Response('{"success":true}', { status: 200 });
      }
      gets += 1;
      return gets === 1
        ? new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 })
        : new Response(JSON.stringify({ success: true, noChanges: false, payload: doc }), { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    motor.suscribir((evento) => eventos.push(evento));
    await motor.activar();

    motor.schedulePublicacion(); // sucio
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(motor.getEstado()).toBe('conflicto'));

    expect(puts).toBe(0); // el PUT fue ABORTADO, no publicado a ciegas
    expect(motor.getConflicto()?.version).toBe(5);
    expect(motor.getVersionLocal()).toBeNull(); // nada cumplió: ninguna versión al puntero
    expect(eventos.some((e) => e.tipo === 'conflicto')).toBe(true);

    // Resolver conservando lo local: publica ENCIMA (v6, conflicto v5 informado)
    const ok = await motor.resolverConflicto(true);
    expect(ok).toBe(true);
    await vi.waitFor(() => expect(puts).toBe(1));
    // (la versión 6 = max(null, conflicto 5) + 1: por encima del remoto, nunca IGUAL)
    motor.parar();
  });

  it('restaurarVersionHistorica: aplica el HISTORIAL sin retroceder el puntero ni alterar la huella', async () => {
    const puente = fabricarPuente();
    const puestas: number[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const cuerpo = JSON.parse(String(init.body)) as { version: number };
        puestas.push(cuerpo.version);
        return new Response('{"success":true}', { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    // Dos publicaciones: el local quedó en v2.
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(puestas).toEqual([1]));
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(GAP_ESCRITURA_MS + DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(puestas).toEqual([1, 2]));
    expect(motor.getVersionLocal()).toBe(2);

    // El historial guarda una versión ANTERIOR (v1). La UI la restaura:
    const historica = await docRemoto(1);
    const ok = await motor.restaurarVersionHistorica(historica);
    expect(ok).toBe(true);
    expect(puente.registro.aplicados).toHaveLength(1); // contenido v1 aplicado
    expect(motor.getVersionLocal()).toBe(2); // ⚠ el puntero NO retrocedió

    // El estado restaurado se re-publica como NUEVA versión (no eco callado);
    // antes hay que cruzar el coalescing K-5 de la publicación de arriba.
    await vi.advanceTimersByTimeAsync(GAP_ESCRITURA_MS + DEBOUNCE_PUBLICACION_MS);
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(puestas).toEqual([1, 2, 3]));

    motor.parar();
  });
});

// --- PULL y manos sucias (K-6/K-7) --------------------------------------------

describe('vaultSyncEngine: pull y resolución del remoto', () => {
  it('sondeo barato: noChanges no restaura y no gasta peticiones extra', async () => {
    const puente = fabricarPuente();
    let llamadas = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      llamadas += 1;
      if (String(url).includes('noChanges=true')) {
        return new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    expect(puente.registro.aplicados).toHaveLength(0);
    expect(llamadas).toBe(1); // un solo get del sondeo
    motor.parar();
  });

  it('ingresarDocumentoRemoto aplica el remoto con local limpio (auto-aplicar)', async () => {
    const puente = fabricarPuente();
    const doc = await docRemoto(7, 'Móvil del contador');
    const eventos: EventoMotor[] = [];
    const motor = new VaultSyncEngine(puente);
    motor.suscribir((e) => eventos.push(e));
    await motor.activar();

    await motor.ingresarDocumentoRemoto(doc);

    expect(puente.registro.aplicados).toEqual([SNAPSHOT_V3]);
    expect(motor.getVersionLocal()).toBe(7);
    expect(motor.getEstado()).toBe('al dia');
    expect(eventos.some((e) => e.tipo === 'aplicado')).toBe(true);
    motor.parar();
  });

  it('ingresarDocumentoRemoto con local sucio → conflicto; resolver(false) aplica remoto', async () => {
    const puente = fabricarPuente();
    const doc = await docRemoto(9, 'Móvil del contador');
    const eventos: EventoMotor[] = [];
    const motor = new VaultSyncEngine(puente);
    motor.suscribir((e) => eventos.push(e));
    await motor.activar();

    motor.schedulePublicacion();
    await motor.ingresarDocumentoRemoto(doc);

    expect(motor.getEstado()).toBe('conflicto');
    expect(eventos.some((e) => e.tipo === 'conflicto')).toBe(true);
    expect(motor.getConflicto()).toEqual(doc);
    expect(puente.registro.aplicados).toHaveLength(0);

    const ok = await motor.resolverConflicto(false);
    expect(ok).toBe(true);
    expect(motor.getVersionLocal()).toBe(9);
    expect(puente.registro.aplicados).toEqual([SNAPSHOT_V3]);
    expect(motor.getEstado()).toBe('al dia');
    expect(motor.getConflicto()).toBeNull();
    motor.parar();
  });

  it('resolverConflicto(true) conserva local con versión mayor que el remoto', async () => {
    const puente = fabricarPuente();
    const doc = await docRemoto(9);
    const pasesPut: DocumentoRemoto[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      pasesPut.push(JSON.parse(String(init?.body)) as DocumentoRemoto);
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;

    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    motor.schedulePublicacion(); // sucio
    await motor.ingresarDocumentoRemoto(doc);
    expect(motor.getEstado()).toBe('conflicto');

    const ok = await motor.resolverConflicto(true);
    expect(ok).toBe(true);
    expect(pasesPut[0].version).toBe(10); // max(0,9)+1
    expect(motor.getVersionLocal()).toBe(10);
    expect(motor.getConflicto()).toBeNull();
    motor.parar();
  });
});

// --- Puertas y anti-eco (K-11) --------------------------------------------------

describe('vaultSyncEngine: canSave, cola y anti-eco', () => {
  it('remoto con canSave=false queda en cola; aplicarPendiente aplica al liberar', async () => {
    const puente = fabricarPuente();
    puente.registro.puede = false;
    const doc = await docRemoto(6);
    const eventos: EventoMotor[] = [];
    const motor = new VaultSyncEngine(puente);
    motor.suscribir((e) => eventos.push(e));
    await motor.activar();

    await motor.ingresarDocumentoRemoto(doc);
    expect(puente.registro.aplicados).toHaveLength(0);
    expect(eventos.some((e) => e.tipo === 'recibido' && e.detalle === 'en cola (recarga)')).toBe(true);

    puente.registro.puede = true;
    await motor.aplicarPendiente();
    expect(puente.registro.aplicados).toEqual([SNAPSHOT_V3]);
    expect(motor.getVersionLocal()).toBe(6);
    motor.parar();
  });

  it('anti-eco: schedulePublicacion dentro de la restauración se suprime', async () => {
    const puente: PuenteBoveda & { registro: { aplicados: unknown[]; puede: boolean } } = fabricarPuente();
    const doc = await docRemoto(3);
    let motorRef: VaultSyncEngine | null = null;

    let puestasPut = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') puestasPut += 1;
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const restaurarLento = vi.fn(async (snapshot: unknown) => {
      // La restauración queda registrada; luego lo que haría el App al
      // persistir (debe ser ignorado por el anti-eco):
      puente.registro.aplicados.push(snapshot);
      motorRef?.schedulePublicacion();
      motorRef?.schedulePublicacion();
      return true;
    });

    const motor = new VaultSyncEngine(
      { ...puente, restaurar: restaurarLento } as unknown as PuenteBoveda,
      { fetchImpl },
    );
    motorRef = motor;
    await motor.activar();

    await motor.ingresarDocumentoRemoto(doc);

    expect(puente.registro.aplicados).toEqual([SNAPSHOT_V3]);
    expect(motor.getSucio()).toBe(false);
    expect(puestasPut).toBe(0); // el push quedó suprimido
    motor.parar();
  });
});

// --- WebSocket (K-6) ------------------------------------------------------------

function fabricarSocket(): SocketSimple & {
  envios: string[];
  listeners: Map<string, (e: { data?: unknown }) => void>;
} {
  const listeners = new Map<string, (e: { data?: unknown }) => void>();
  const socket = {
    envios: [] as string[],
    listeners,
    send(data: string) {
      socket.envios.push(data);
    },
    close() {
      listeners.get('close')?.({});
    },
    addEventListener(type: string, listener: (e: { data?: unknown }) => void) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
  };
  return socket;
}

describe('vaultSyncEngine: WebSocket en vivo', () => {
  it('remote_state por WS aplica y latidos mandan ping cada 25 s', async () => {
    const puente = fabricarPuente();
    const doc = await docRemoto(4);
    const socket = fabricarSocket();
    const motor = new VaultSyncEngine(puente, { socketFactory: () => socket });
    await motor.activar();

    socket.listeners.get('message')?.({ data: JSON.stringify({ type: 'remote_state', payload: doc }) });
    await vi.waitFor(() => expect(puente.registro.aplicados).toHaveLength(1));

    expect(puente.registro.aplicados).toEqual([SNAPSHOT_V3]);
    expect(motor.getVersionLocal()).toBe(4);

    await vi.advanceTimersByTimeAsync(25000);
    expect(socket.envios).toContain(JSON.stringify({ type: 'ping' }));

    motor.parar();
  });

  it('pong y mensajes ajenos no rompen el canal ni aplican nada', async () => {
    const puente = fabricarPuente();
    const socket = fabricarSocket();
    const motor = new VaultSyncEngine(puente, { socketFactory: () => socket });
    await motor.activar();

    socket.listeners.get('message')?.({ data: JSON.stringify({ type: 'pong' }) });
    socket.listeners.get('message')?.({ data: 'no-es-json' });
    await vi.advanceTimersByTimeAsync(0);

    expect(puente.registro.aplicados).toHaveLength(0);
    motor.parar();
  });

  it('el sondeo corre AUNQUE el WebSocket esté abierto (coherencia entre runtimes)', async () => {
    // BUG hallado para el symptom "no se ven entre sí": sondeoPasivo se
    // apagaba con socketActivo() — pero el broadcast del relay solo retransmite
    // dentro del MISMO runtime/isolate. Dispositivos servidos por runtimes
    // distintos quedaban sordos para siempre.
    const puente = fabricarPuente();
    const doc = await docRemoto(7);
    const socket = fabricarSocket();
    let gets = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('{"success":true}', { status: 200 });
      gets += 1;
      return new Response(
        JSON.stringify({ success: true, noChanges: false, payload: doc }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl, socketFactory: () => socket });
    await motor.activar();

    // El sondeo inicial barre el documento remoto aunque el socket se abra luego.
    await vi.waitFor(() => expect(puente.registro.aplicados).toHaveLength(1));
    expect(motor.getVersionLocal()).toBe(7);

    // El intervalo sigue tirando GETs con el WS vivo (antes estaba dormido).
    const trasPrimero = gets;
    await vi.advanceTimersByTimeAsync(SONDEO_MS);
    await vi.waitFor(() => expect(gets).toBeGreaterThan(trasPrimero));

    motor.parar();
  });
});

// --- Eco de la restauración (anti-eco de contenido, K-11) ---------------------

describe('vaultSyncEngine: eco de la restauración no se publica', () => {
  it('tras aplicar un remoto, el estado re-persistido idéntico no genera PUT; una edición real sí', async () => {
    const puente = fabricarPuente();
    const doc = await docRemoto(5);
    let puestas = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') puestas += 1;
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;

    let snapshotActual: unknown = SNAPSHOT_V3;
    const motor = new VaultSyncEngine(
      { ...puente, getSnapshot: async () => JSON.parse(JSON.stringify(snapshotActual)) },
      { fetchImpl },
    );
    await motor.activar();

    await motor.ingresarDocumentoRemoto(doc);
    expect(motor.getVersionLocal()).toBe(5);

    // El App re-persistió al hidratar (eco): mismo contenido → sin PUT.
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(motor.getEstado()).toBe('al dia'));
    expect(puestas).toBe(0);
    expect(motor.getSucio()).toBe(false);

    // Edición real del usuario (contenido distinto) → sí publica v6:
    snapshotActual = { ...SNAPSHOT_V3, activaId: 'e2' };
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(puestas).toBe(1));
    expect(motor.getVersionLocal()).toBe(6);

    motor.parar();
  });
});

// --- Fusión del conflicto (PLAN_FUSION_BOVEDA.md, Fase B / F-7) ------------------

describe('vaultSyncEngine: fusión del conflicto (contenidoConflicto + aplicarSnapshotFusionado)', () => {
  it('contenidoConflicto descifra el doc del conflicto SIN tocar estado ni restaurar', async () => {
    const puente = fabricarPuente();
    const doc = await docRemoto(9, 'Móvil del contador');
    const motor = new VaultSyncEngine(puente);
    await motor.activar();

    motor.schedulePublicacion(); // sucio
    await motor.ingresarDocumentoRemoto(doc);
    expect(motor.getEstado()).toBe('conflicto');

    const contenido = await motor.contenidoConflicto();
    expect(contenido).toEqual(SNAPSHOT_V3);
    // Solo lectura: conflicto de pie, nada restaurado, versión intacta.
    expect(motor.getEstado()).toBe('conflicto');
    expect(motor.getConflicto()).toEqual(doc);
    expect(puente.registro.aplicados).toHaveLength(0);
    motor.parar();

    // Sin conflicto → null (motor nuevo, sin entrar documento).
    const fresco = new VaultSyncEngine(fabricarPuente());
    await fresco.activar();
    expect(await fresco.contenidoConflicto()).toBeNull();
    fresco.parar();
  });

  it('contenidoConflicto devuelve null con error cuando el blob no descifra', async () => {
    const puente = fabricarPuente();
    const eventos: EventoMotor[] = [];
    const docRoto: DocumentoRemoto = {
      version: 3,
      updatedAt: FECHA,
      deviceLabel: 'Móvil',
      blob: '{"no-es-un-sobre- valido": true }',
    };
    const motor = new VaultSyncEngine(puente);
    motor.suscribir((e) => eventos.push(e));
    await motor.activar();

    motor.schedulePublicacion();
    await motor.ingresarDocumentoRemoto(docRoto);
    expect(motor.getEstado()).toBe('conflicto');

    expect(await motor.contenidoConflicto()).toBeNull();
    expect(eventos.some((e) => e.tipo === 'error')).toBe(true);
    motor.parar();
  });

  it('aplicarSnapshotFusionado: restaura, publica max(local, conflicto)+1 y despeja el conflicto', async () => {
    const puente = fabricarPuente();
    const doc = await docRemoto(5, 'Móvil del contador');
    const SNAPSHOT_FUSIONADO = { ...SNAPSHOT_V3, activaId: 'e2' };
    let snapshotActual: unknown = SNAPSHOT_V3;
    const pasesPut: DocumentoRemoto[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        pasesPut.push(JSON.parse(String(init?.body)) as DocumentoRemoto);
        return new Response('{"success":true}', { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const motor = new VaultSyncEngine(
      {
        ...fabricarPuente({
          restaurar: async (snapshot: unknown) => {
            snapshotActual = snapshot;
            puente.registro.aplicados.push(snapshot);
            return true;
          },
        }),
        getSnapshot: async () => JSON.parse(JSON.stringify(snapshotActual)),
      },
      { fetchImpl },
    );
    await motor.activar();

    motor.schedulePublicacion(); // sucio → conflicto contra el doc v5
    await motor.ingresarDocumentoRemoto(doc);
    expect(motor.getEstado()).toBe('conflicto');

    const ok = await motor.aplicarSnapshotFusionado(SNAPSHOT_FUSIONADO);
    expect(ok).toBe(true);
    expect(puente.registro.aplicados[0]).toEqual(SNAPSHOT_FUSIONADO);
    expect(motor.getConflicto()).toBeNull();
    expect(motor.getEstado()).toBe('al dia');
    expect(motor.getVersionLocal()).toBe(6); // max(0, conflicto 5) + 1: nunca colisionado
    expect(pasesPut).toHaveLength(1);
    expect(pasesPut[0].version).toBe(6);
    // El contenido publicado es EXACTAMENTE el fusionado.
    expect(pasesPut[0].blob.length).toBeGreaterThan(16);

    // Anti-eco post-fusión: la re-persistencia del MISMO contenido no repite PUT
    // (debounce + coalescing de 120 s + silencio por huella al dispararse).
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.advanceTimersByTimeAsync(GAP_ESCRITURA_MS);
    await vi.waitFor(() => expect(motor.getSucio()).toBe(false));
    expect(pasesPut).toHaveLength(1);
    motor.parar();
  });

  it('el anti-eco NO silencia la fusión cuando el merged es idéntico al conflicto (F-7, F-8)', async () => {
    // Caso de esquina del plan: local sin altas propias → el snapshot fusionado
    // coincide byte a byte con el contenido del conflicto; aun así sale como
    // versión nueva (el anti-eco jamás censa la orden explícita del usuario).
    const puente = fabricarPuente();
    const doc = await docRemoto(4);
    const pasesPut: DocumentoRemoto[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        pasesPut.push(JSON.parse(String(init?.body)) as DocumentoRemoto);
        return new Response('{"success":true}', { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();

    motor.schedulePublicacion();
    await motor.ingresarDocumentoRemoto(doc);
    expect(motor.getEstado()).toBe('conflicto');

    const ok = await motor.aplicarSnapshotFusionado(SNAPSHOT_V3);
    expect(ok).toBe(true);
    expect(pasesPut).toHaveLength(1); // huella igual al conflicto: sin ignorarHuella NO saldría
    expect(pasesPut[0].version).toBe(5);
    motor.parar();
  });

  it('restauración fallida deja el conflicto de pie (F-8); sin conflicto devuelve false', async () => {
    const doc = await docRemoto(7);
    const eventos: EventoMotor[] = [];

    // restaurar false → ok=false y el conflicto sigue disponible.
    const puenteFallo = fabricarPuente({ restaurar: async () => false });
    const motorFallo = new VaultSyncEngine(puenteFallo);
    motorFallo.suscribir((e) => eventos.push(e));
    await motorFallo.activar();
    motorFallo.schedulePublicacion();
    await motorFallo.ingresarDocumentoRemoto(doc);
    const ok = await motorFallo.aplicarSnapshotFusionado(SNAPSHOT_V3);
    expect(ok).toBe(false);
    expect(motorFallo.getConflicto()).toEqual(doc); // queda de pie para reintentar/otro camino
    expect(motorFallo.getEstado()).toBe('conflicto');
    motorFallo.parar();

    // Sin conflicto: rechaza SIN restaurar ni publicar.
    const puente = fabricarPuente();
    let puestas = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') puestas += 1;
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    motor.suscribir((e) => eventos.push(e));
    await motor.activar();
    expect(await motor.aplicarSnapshotFusionado(SNAPSHOT_V3)).toBe(false);
    expect(puente.registro.aplicados).toHaveLength(0);
    expect(puestas).toBe(0);
    expect(eventos.some((e) => e.detalle === 'No hay conflicto que fusionar.')).toBe(true);
    motor.parar();
  });

  it('PUT fallido tras la fusión: el estado queda sucio y el reintento publica el fusionado', async () => {
    const puente = fabricarPuente();
    const doc = await docRemoto(5);
    const SNAPSHOT_FUSIONADO = { ...SNAPSHOT_V3, activaId: 'e2' };
    let snapshotActual: unknown = SNAPSHOT_V3;
    let puestas = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puestas += 1;
        // Solo el PRIMER PUT falla; el reintento sale.
        return puestas === 1
          ? new Response(' relay saturado ', { status: 500 })
          : new Response('{"success":true}', { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, noChanges: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const motor = new VaultSyncEngine(
      {
        ...fabricarPuente({
          restaurar: async (snapshot: unknown) => {
            snapshotActual = snapshot;
            puente.registro.aplicados.push(snapshot);
            return true;
          },
        }),
        getSnapshot: async () => JSON.parse(JSON.stringify(snapshotActual)),
      },
      { fetchImpl },
    );
    await motor.activar();

    motor.schedulePublicacion();
    await motor.ingresarDocumentoRemoto(doc);

    expect(await motor.aplicarSnapshotFusionado(SNAPSHOT_FUSIONADO)).toBe(false);
    // conflicto de pie: es el cimiento del número del reenviado (coherencia K-7).
    expect(motor.getConflicto()).toEqual(doc);
    expect(motor.getSucio()).toBe(true); // marcado para reenvío
    expect(puestas).toBe(1); // solo el intento que falló

    // El reintento natural (schedule + debounce) SÍ publica el contenido
    // fusionado: la huella se limpió y el conflicto informa max(local, conflicto)+1.
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    // El reintento corre dentro de los timers falsos: bombear timers/microtareas
    // hasta el desenlace (vi.waitFor con timers falsos no siempre bombea aquí).
    for (let i = 0; i < 200 && motor.getVersionLocal() === null; i += 1) {
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(puestas).toBe(2);
    expect(motor.getVersionLocal()).toBe(6);
    expect(motor.getConflicto()).toBeNull(); // la publicación triunfa: conflicto despejado
    expect(motor.getEstado()).toBe('al dia');
    motor.parar();
  });
});

// --- Persistencia del puntero (K-7) ---------------------------------------------

describe('vaultSyncEngine: persistencia de versión/suciedad', () => {
  it('versión publicada y bandera limpia sobreviven a un motor nuevo', async () => {

    const puente = fabricarPuente();
    let llamadasPut = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') llamadasPut += 1;
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const motor = new VaultSyncEngine(puente, { fetchImpl });
    await motor.activar();
    motor.schedulePublicacion();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_PUBLICACION_MS);
    await vi.waitFor(() => expect(llamadasPut).toBe(1));
    motor.parar();

    const motor2 = new VaultSyncEngine(puente);
    await motor2.activar();
    expect(motor2.getVersionLocal()).toBe(1);
    expect(motor2.getSucio()).toBe(false);
    motor2.parar();
  });
});
