/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bytesDesdeBase64 } from '../lib/crypto';
import { credencialDesdeFrase } from '../lib/mnemonic';
import {
  alistarDesdeFrase,
  alistarDesdeQr,
  actualizarEtiqueta,
  CLAVE_CREDS,
  construirPayloadQr,
  crearBoveda,
  desalistar,
  esCredencialesValidas,
  esUrlRelayValida,
  ETIQUETA_DESKTOP,
  obtenerCredenciales,
  parsePayloadQr,
  sufijoBoveda,
  verificarRelay,
  VERSION_QR,
  type PayloadQr,
} from './vaultService';

const URL_RELAY_DEV = 'http://localhost:8787';
/** Frases de prueba con las 6 palabras del diccionario. */
const FRASE_A = 'faro-sol-luz-rosa-nube-cielo';
const FRASE_B = 'arbol-danza-eco-faro-sol-luz';

describe('vaultService: validaciones puras (K-9)', () => {
  it('esUrlRelayValida acepta https y http solo en local; rechaza lo demás', () => {
    expect(esUrlRelayValida('https://contabilidad-relay.workers.dev')).toBe(true);
    expect(esUrlRelayValida('http://localhost:8787')).toBe(true);
    expect(esUrlRelayValida('http://127.0.0.1:8787')).toBe(true);
    expect(esUrlRelayValida('http://reléno-https.com')).toBe(false);
    expect(esUrlRelayValida('ftp://no.com')).toBe(false);
    expect(esUrlRelayValida('no-es-url')).toBe(false);
    expect(esUrlRelayValida('')).toBe(false);
  });

  it('sufijoBoveda regresa los últimos 6 en mayúsculas', () => {
    expect(sufijoBoveda('vlt_abcdefgh1234')).toBe('GH1234');
  });

  it('parsePayloadQr acepta el payload correcto y rechaja formas ajenas', () => {
    const payload: PayloadQr = {
      v: 1,
      url: URL_RELAY_DEV,
      vaultId: 'vlt_abcd1234ef56',
      secretKey: bytesABase64Prueba(),
    };
    expect(parsePayloadQr(JSON.stringify(payload))).toEqual(payload);

    expect(parsePayloadQr('no es json')).toBeNull();
    expect(parsePayloadQr(JSON.stringify({ ...payload, v: 2 }))).toBeNull();
    expect(parsePayloadQr(JSON.stringify({ ...payload, url: 'udp://relay.test' }))).toBeNull(); // protocolo no permitido
    expect(parsePayloadQr(JSON.stringify({ ...payload, vaultId: 'corto' }))).toBeNull();
    expect(parsePayloadQr(JSON.stringify({ ...payload, secretKey: 'aG9s' }))).toBeNull();
    expect(parsePayloadQr(JSON.stringify({ ...payload, secretKey: 42 }))).toBeNull();
  });

  it('esCredencialesValidas exige los campos con formas correctas', () => {
    const base = {
      vaultId: 'vlt_abcd1234ef56',
      secretKey: bytesABase64Prueba(),
      frase: FRASE_A,
      deviceLabel: ETIQUETA_DESKTOP,
      createdAt: '2026-10-20T00:00:00.000Z',
    };
    expect(esCredencialesValidas(base)).toBe(true);
    expect(esCredencialesValidas({ ...base, vaultId: 'corto' })).toBe(false);
    expect(esCredencialesValidas({ ...base, secretKey: 'aG9s' })).toBe(false);
    expect(esCredencialesValidas({ ...base, createdAt: 'ayer' })).toBe(false);
    expect(esCredencialesValidas(null)).toBe(false);
  });

  it('esCredencialesValidas tolera frase vacía (dispositivo alinado por QR, K-9)', () => {
    const sinFrase = {
      vaultId: 'vlt_abcd1234ef56',
      secretKey: bytesABase64Prueba(),
      frase: '',
      deviceLabel: 'Móvil',
      createdAt: '2026-10-20T00:00:00.000Z',
    };
    expect(esCredencialesValidas(sinFrase)).toBe(true);
  });
});

describe('vaultService: ciclo de vida de credenciales (web/localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('crearBoveda genera frase válida, credencial derivada y la persiste', async () => {
    const creds = await crearBoveda('Escritorio de Fernando');

    expect(creds.deviceLabel).toBe('Escritorio de Fernando');
    expect(creds.frase.split('-')).toHaveLength(6);
    expect(creds.vaultId).toMatch(/^vlt_[0-9a-f]{12}$/);
    expect(bytesDesdeBase64(creds.secretKey)).toHaveLength(32);

    const derivada = await credencialDesdeFrase(creds.frase);
    expect(derivada.secretKey).toBe(creds.secretKey); // DV-K-3: la credencial nace de la frase

    const leidas = await obtenerCredenciales();
    expect(leidas).toEqual(creds);
  });

  it('obtenerCredenciales regresa null con storage vacío o corrupto', async () => {
    expect(await obtenerCredenciales()).toBeNull();

    localStorage.setItem(CLAVE_CREDS, '{"vaultId":"roto"');
    expect(await obtenerCredenciales()).toBeNull();

    localStorage.setItem(CLAVE_CREDS, JSON.stringify({ vaultId: 'correcto' }));
    expect(await obtenerCredenciales()).toBeNull();
  });

  it('actualizarEtiqueta cambia solo deviceLabel y preserva el resto', async () => {
    const creds = await crearBoveda('Original');
    const editada = await actualizarEtiqueta('  Tablet de oficina  ');
    const leidas = await obtenerCredenciales();

    expect(editada?.deviceLabel).toBe('Tablet de oficina');
    expect(leidas?.vaultId).toBe(creds.vaultId);
    expect(leidas?.secretKey).toBe(creds.secretKey);
    expect(leidas?.frase).toBe(creds.frase);
  });

  it('alistarDesdeQr guarda la credencial compartida sin frase (el creador la tiene)', async () => {
    const creada = await crearBoveda(ETIQUETA_DESKTOP);
    const payloadQr = construirPayloadQr(creada, URL_RELAY_DEV);
    expect(payloadQr).not.toBeNull();

    const alistada = await alistarDesdeQr(payloadQr!, 'Móvil del contador');
    expect(alistada?.vaultId).toBe(creada.vaultId);
    expect(alistada?.secretKey).toBe(creada.secretKey);
    expect(alistada?.frase).toBe('');
    expect(alistada?.deviceLabel).toBe('Móvil del contador');

    const leidas = await obtenerCredenciales();
    expect(leidas?.vaultId).toBe(creada.vaultId);
  });

  it('alistarDesdeQr con texto ajeno no toca storage', async () => {
    await alistarDesdeQr('escaneo erroneo', 'Móvil');
    expect(await obtenerCredenciales()).toBeNull();
  });

  it('alistarDesdeFrase deriva la misma credencial que la bóveda de origen', async () => {
    const creada = await crearBoveda(ETIQUETA_DESKTOP);

    // En un dispositivo "limpio" (como si fuera el móvil): frase conocida de papel.
    await desalistar();
    const resultado = await alistarDesdeFrase(creada.frase, 'Móvil sin cámara', creada.vaultId);

    expect(resultado.ok).toBe(true);
    expect(resultado.credenciales?.vaultId).toBe(creada.vaultId);
    expect(resultado.credenciales?.secretKey).toBe(creada.secretKey);
    expect(resultado.credenciales?.frase).toBe(creada.frase);
  });

  it('alistarDesdeFrase rechaza frase de otra bóveda cuando se esperaba vaultId', async () => {
    const creada = await crearBoveda(ETIQUETA_DESKTOP);
    await desalistar();

    const resultado = await alistarDesdeFrase(FRASE_B, 'Móvil', creada.vaultId);
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain('otra bóveda');
    expect(await obtenerCredenciales()).toBeNull(); // no se guardó nada
  });

  it('alistarDesdeFrase sin frase válida falla sin storage', async () => {
    await desalistar();
    const resultado = await alistarDesdeFrase('hola mundo', 'Móvil');
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toBeTruthy();
    expect(await obtenerCredenciales()).toBeNull();
  });

  it('desalistar borra la credencial local', async () => {
    await crearBoveda(ETIQUETA_DESKTOP);
    expect(await obtenerCredenciales()).not.toBeNull();

    await desalistar();
    expect(await obtenerCredenciales()).toBeNull();
  });
});

describe('vaultService: relay (health + payload del QR)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('construirPayloadQr con relay inválido regresa null', async () => {
    const creada = await crearBoveda(ETIQUETA_DESKTOP);
    expect(construirPayloadQr(creada, '')).toBeNull();
    expect(construirPayloadQr(creada, 'no es url')).toBeNull();
    expect(construirPayloadQr(creada, 'udp://relay')).toBeNull(); // protocolo ajeno
  });

  it('verificarRelay con URL inválida no lanza y reporta fallo claro', async () => {
    const resultado = await verificarRelay('no-es-url');
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain('URL del relay');
  });

  it('verificarRelay sin red reporta inaccesibilidad sin lanzar', async () => {
    const resultado = await verificarRelay('http://localhost:59999'); // puerto vacío
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain('Relay');
  });
});

// --- Utilidades de prueba ----------------------------------------------------

/** Clave de prueba válida (32 bytes deterministas) en Base64. */
function bytesABase64Prueba(): string {
  const bytes = new Uint8Array(32).map((_, i) => (i * 13 + 5) % 256);
  let binario = '';
  bytes.forEach((b) => {
    binario += String.fromCharCode(b);
  });
  return btoa(binario);
}
