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
  return Object.assign(base, {
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
