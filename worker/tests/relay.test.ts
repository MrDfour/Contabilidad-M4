/**
 * relay.test.ts — Red de pruebas del relay (Fase 1 de PLAN_SYNC_KV.md).
 * Verifica la lógica pura de claves/rotación/validación y el comportamiento HTTP
 * del router con un KV simulado (nunca KV real, según el convenio de ejecución:
 * el despliegue real ocurre al final del plan vía GitHub Actions).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index';
import {
  claveActual,
  claveHistorial,
  esVaultIdValido,
  HISTORIAL_MAX,
  mensajePong,
  mensajeRemoteState,
  parseDocumento,
  planRotarHistorial,
  TTL_SEGUNDOS,
  type DocumentoBoveda,
} from '../src/relay';

// --- Utilidades de prueba ---------------------------------------------------

function docValido(version: number, mezcla = ''): DocumentoBoveda {
  return {
    version,
    updatedAt: '2026-10-20T12:00:00.000Z',
    deviceLabel: mezcla ? `Escritorio ${mezcla}` : 'Escritorio',
    blob: `{"ciphertext":"${mezcla || 'abc'}"}-${version}` + '-'.repeat(8),
  };
}

/** KV simulado mínimo (get/put/delete con TTL ignorado salvo registro). */
function crearKvSimulado() {
  const datos = new Map<string, string>();
  const tlles: Record<string, number> = {};
  return {
    datos,
    tlles,
    async get(clave: string) {
      return datos.has(clave) ? datos.get(clave)! : null;
    },
    async put(clave: string, valor: string, opciones?: { expirationTtl: number }) {
      datos.set(clave, valor);
      if (opciones?.expirationTtl) tlles[clave] = opciones.expirationTtl;
    },
    async delete(clave: string) {
      datos.delete(clave);
    },
  };
}

type KvSimulado = ReturnType<typeof crearKvSimulado>;

async function putState(kv: KvSimulado, vaultId: string, doc: DocumentoBoveda): Promise<Response> {
  const request = new Request(`https://relay.test/api/vault/${vaultId}/state`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  return worker.fetch(request, { CONTABILIDAD_VAULT: kv as unknown as KVNamespace });
}

async function getState(vaultId: string, kv: KvSimulado, version?: number): Promise<Response> {
  const consulta = version !== undefined ? `?version=${version}` : '';
  const request = new Request(`https://relay.test/api/vault/${vaultId}/state${consulta}`, {
    method: 'GET',
  });
  return worker.fetch(request, { CONTABILIDAD_VAULT: kv as unknown as KVNamespace });
}

// --- Helpers puros ----------------------------------------------------------

describe('helpers puros del relay (claveTTL/rotación/validación — K-5, K-8)', () => {
  it('claveActual usa el formato vlt:<vaultId>:actual y claveHistorial el índice', () => {
    expect(claveActual('boveda-1')).toBe('vlt:boveda-1:actual');
    expect(claveHistorial('boveda-1', 0)).toBe('vlt:boveda-1:hist:0');
    expect(claveHistorial('boveda-1', 4)).toBe('vlt:boveda-1:hist:4');
  });

  it('esVaultIdValido acepta id de bóveda alfanumérico y rechaza formatos inseguros', () => {
    expect(esVaultIdValido('abcd1234ef56')).toBe(true);
    expect(esVaultIdValido('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(esVaultIdValido('abc')).toBe(false); // demasiado corto
    expect(esVaultIdValido('a'.repeat(65))).toBe(false); // demasiado largo
    expect(esVaultIdValido('con espacio')).toBe(false);
    expect(esVaultIdValido('../ruta')).toBe(false);
    expect(esVaultIdValido(42)).toBe(false);
  });

  it('TTL y tope de historial acorde a K-5/K-8', () => {
    expect(TTL_SEGUNDOS).toBe(60 * 60 * 24 * 30);
    expect(HISTORIAL_MAX).toBe(5);
  });

  it('parseDocumento acepta un documento válido y rechaza formas inválidas', () => {
    expect(parseDocumento(docValido(3))).not.toBeNull();

    expect(parseDocumento(null)).toBeNull();
    expect(parseDocumento('texto')).toBeNull();
    expect(parseDocumento({ ...docValido(3), version: 0 })).toBeNull();
    expect(parseDocumento({ ...docValido(3), version: 1.5 })).toBeNull();
    expect(parseDocumento({ ...docValido(3), updatedAt: '20-10-2026' })).toBeNull();
    expect(parseDocumento({ ...docValido(3), deviceLabel: '' })).toBeNull();
    expect(parseDocumento({ ...docValido(3), blob: 'corto' })).toBeNull();
  });

  it('parseDocumento rechaza blobs por encima del límite defensivo (5 MB)', () => {
    const enorme = 'a'.repeat(5 * 1024 * 1024 + 1);
    expect(parseDocumento({ ...docValido(1), blob: enorme })).toBeNull();
  });

  it('planRotarHistorial entra la versión anterior en posición 0 y desplaza las demás', () => {
    const anterior = docValido(10, 'ant');
    const existentes = [docValido(9, 'e0'), docValido(8, 'e1')];

    const plan = planRotarHistorial('boveda-x', anterior, existentes);

    expect(plan.escriben).toHaveLength(3);
    expect(plan.escriben[0].clave).toBe('vlt:boveda-x:hist:0');
    const entrada0 = JSON.parse(plan.escriben[0].valor);
    expect(entrada0.version).toBe(10); // el documento anterior es lo más "nuevo" del historial
    expect(plan.escriben[1].clave).toBe('vlt:boveda-x:hist:1');
    expect(JSON.parse(plan.escriben[1].valor).version).toBe(9);
    expect(plan.escriben[2].clave).toBe('vlt:boveda-x:hist:2');
    expect(JSON.parse(plan.escriben[2].valor).version).toBe(8);
    expect(plan.borran).toEqual([]); // quedan espacios libres
  });

  it('planRotarHistorial descarta la entrada más vieja cuando ya estoy ala tope', () => {
    const anterior = docValido(20, 'nuevo');
    const existentes = Array.from({ length: HISTORIAL_MAX }, (_, i) => docValido(19 - i, `v${i}`));

    const plan = planRotarHistorial('boveda-llena', anterior, existentes);

    expect(plan).toEqual({
      escriben: expect.arrayContaining([expect.objectContaining({ clave: 'vlt:boveda-llena:hist:0' })]),
      borran: ['vlt:boveda-llena:hist:4'],
    });
    expect(plan.escriben).toHaveLength(HISTORIAL_MAX); // 0..4 completo
    // la entrada más vieja (version 15, índice 4 del arreglo original) sale del tope:
    const ultimo = JSON.parse(plan.escriben[4].valor);
    expect(ultimo.version).toBe(16); // luego de encolar a "20", la pos 4 pasa de 16
  });

  it('mensajes del canal: pong y remote_state con forma esperada (K-6)', () => {
    expect(JSON.parse(mensajePong()).type).toBe('pong');

    const texto = mensajeRemoteState(docValido(7, 'ws'));
    const mensaje = JSON.parse(texto);
    expect(mensaje.type).toBe('remote_state');
    expect(mensaje.payload.version).toBe(7);
  });
});

// --- Router con KV simulado ---------------------------------------------------

describe('rutas del worker con KV simulado (K-4, K-5, K-8, K-13)', () => {
  let kv!: KvSimulado;
  const VAULT = 'boveda-prueba-1';

  beforeEach(() => {
    kv = crearKvSimulado();
  });

  it('GET /health responde online en español', async () => {
    const respuesta = await worker.fetch(
      new Request('https://relay.test/health'),
      { CONTABILIDAD_VAULT: kv as unknown as KVNamespace },
    );
    const cuerpo = (await respuesta.json()) as Record<string, unknown>;
    expect(respuesta.status).toBe(200);
    expect(cuerpo.status).toBe('online');
    expect(String(cuerpo.servicio)).toContain('Contabilidad M4');
  });

  it('PUT persiste el documento vigente en la clave correcta, con TTL derivado', async () => {
    const respuesta = await putState(kv, VAULT, docValido(1));
    expect(respuesta.status).toBe(200);

    expect(kv.datos.has(claveActual(VAULT))).toBe(true);
    const guardado = JSON.parse(kv.datos.get(claveActual(VAULT))!) as DocumentoBoveda;
    expect(guardado.version).toBe(1);
    expect(kv.tlles[claveActual(VAULT)]).toBe(TTL_SEGUNDOS);
  });

  it('PUT rechaza cuerpos inválidos con 422 y no toca el KV', async () => {
    const antes = kv.datos.size;
    const respuesta = await putState(kv, VAULT, { version: 1 } as unknown as DocumentoBoveda);
    expect(respuesta.status).toBe(422);
    expect(kv.datos.size).toBe(antes);
  });

  it('PUT con cuerpo no-JSON responde 400', async () => {
    const respuesta = await worker.fetch(
      new Request(`https://relay.test/api/vault/${VAULT}/state`, {
        method: 'PUT',
        body: '{no-json',
      }),
      { CONTABILIDAD_VAULT: kv as unknown as KVNamespace },
    );
    expect(respuesta.status).toBe(400);
  });

  it('GET sin estado guarda noChanges:true y sin payload', async () => {
    const respuesta = await getState(VAULT, kv);
    const cuerpo = (await respuesta.json()) as Record<string, unknown>;
    expect(cuerpo.noChanges).toBe(true);
    expect(cuerpo.payload).toBeUndefined();
  });

  it('GET regresa el documento; con ?version= mayor o igual regresa noChanges (sondeo barato)', async () => {
    await putState(kv, VAULT, docValido(3));

    const completo = await getState(VAULT, kv);
    const cuerpoCompleto = (await completo.json()) as Record<string, unknown>;
    expect(cuerpoCompleto.noChanges).toBe(false);
    expect((cuerpoCompleto.payload as DocumentoBoveda).version).toBe(3);

    const baratoAlDia = await getState(VAULT, kv, 3);
    const cuerpoBarato = (await baratoAlDia.json()) as Record<string, unknown>;
    expect(cuerpoBarato.noChanges).toBe(true);

    const baratoFuturo = await getState(VAULT, kv, 4);
    expect(((await baratoFuturo.json()) as Record<string, unknown>).noChanges).toBe(true);

    const requiereDatos = await getState(VAULT, kv, 2);
    expect(((await requiereDatos.json()) as Record<string, unknown>).noChanges).toBe(false);
  });

  it('el primer PUT no escribe historial (no hay documento anterior); el segundo sí', async () => {
    await putState(kv, VAULT, docValido(1));
    expect(kv.datos.get(claveHistorial(VAULT, 0))).toBeUndefined();

    await putState(kv, VAULT, docValido(2, 'segundo'));
    const entrada = JSON.parse(kv.datos.get(claveHistorial(VAULT, 0))!);
    expect(entrada.version).toBe(1); // lo nuevo queda como documento; lo viejo entra al historial
  });

  it('push consecutivo rotan el historial y el tope HISTORIAL_MAX se borra (K-8)', async () => {
    for (let version = 1; version <= 8; version += 1) {
      const respuesta = await putState(kv, VAULT, docValido(version, `v${version}`));
      expect(respuesta.status).toBe(200);
    }

    // Con 8 pushes: historial conserva las 5 versiones anteriores al vigente (7..3).
    for (let n = 0; n < HISTORIAL_MAX; n += 1) {
      const entrada = JSON.parse(kv.datos.get(claveHistorial(VAULT, n))!);
      expect(entrada.version).toBe(7 - n);
    }
    // La clave de la antigua posición HISTORIAL_MAX-1 ya no existe (borrada en rotación):
    // Los pushes consecutivos rotan el historial: las versiones 7..3 quedan en
    // las posiciones 0..4 del tope y la clave de la anterior posición 4 se borra.
    const vigente = JSON.parse(kv.datos.get(claveActual(VAULT))!) as DocumentoBoveda;
    expect(vigente.version).toBe(8);
  });

  it('GET history lista solo metadatos (sin blobs) en orden de más nuevo a más viejo', async () => {
    await putState(kv, VAULT, docValido(1));
    await putState(kv, VAULT, docValido(2, 'dos'));

    const respuesta = await worker.fetch(
      new Request(`https://relay.test/api/vault/${VAULT}/history`),
      { CONTABILIDAD_VAULT: kv as unknown as KVNamespace },
    );
    const cuerpo = (await respuesta.json()) as { entradas: { version: number; blob?: string }[] };

    expect(cuerpo.entradas).toHaveLength(1);
    expect(cuerpo.entradas[0].version).toBe(1);
    expect(cuerpo.entradas[0].blob).toBeUndefined(); // sin blob: solo metadatos
  });

  it('GET history con ?full=1 trae blobs cifrados (restauración de UI); por defecto sigue sin ellos', async () => {
    await putState(kv, VAULT, docValido(1));
    await putState(kv, VAULT, docValido(2, 'dos'));

    const respuesta = await worker.fetch(
      new Request(`https://relay.test/api/vault/${VAULT}/history?full=1`),
      { CONTABILIDAD_VAULT: kv as unknown as KVNamespace },
    );
    const cuerpo = (await respuesta.json()) as { entradas: { version: number; blob?: string }[] };

    expect(cuerpo.entradas).toHaveLength(1);
    expect(cuerpo.entradas[0].version).toBe(1);
    expect(cuerpo.entradas[0].blob).toBeTypeOf('string'); // el blob E2EE completo va al cliente
  });

  it('vaultId inválido bloquea state y history (400); método no soportado → 405', async () => {
    const r1 = await getState('corto', kv); // 'corto' (5) pasa la ruta pero falla la forma (mín 6)
    expect(r1.status).toBe(400);

    const r2 = await worker.fetch(
      new Request(`https://relay.test/api/vault/${VAULT}/history`, { method: 'PUT' }),
      { CONTABILIDAD_VAULT: kv as unknown as KVNamespace },
    );
    expect(r2.status).toBe(405);
  });

  it('ruta desconocida 404; sin binding KV 503', async () => {
    const r1 = await worker.fetch(
      new Request('https://relay.test/desconocido'),
      { CONTABILIDAD_VAULT: kv as unknown as KVNamespace },
    );
    expect(r1.status).toBe(404);

    const r2 = await worker.fetch(
      new Request('https://relay.test/api/vault/abcd1234ef56/state'),
      {} as unknown as { CONTABILIDAD_VAULT: KVNamespace },
    );
    expect(r2.status).toBe(503);
  });
});
