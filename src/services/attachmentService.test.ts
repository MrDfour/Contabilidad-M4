/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  planEscalera,
  limitesBinaria,
  comprimirAnexoCheque,
  sha256Hex,
  guardarAnexo,
  cargarAnexo,
  borrarAnexo,
  listarHuerfanos,
  borrarHuerfanosAntiguos,
  borrarAnexosHuerfanosDePoliza,
  diasDesdeCaptura,
  OBJETIVO_BYTES,
  CAP_BYTES
} from './attachmentService';
import { loadFromStorage, saveToStorage } from './storageService';
import { clavePorEmpresa } from '../lib/empresas';
import type { ChequeAnexo, Poliza } from '../types';

const REGISTRO = clavePorEmpresa('contasis_anexos', 'e1');
const registroLeer = async (): Promise<ChequeAnexo[]> => (await loadFromStorage(REGISTRO)) ?? [];
const registroEscribir = (lista: ChequeAnexo[]) => saveToStorage(REGISTRO, lista);

const blobWebp = (contenido = 'binario-de-prueba', type = 'image/webp') =>
  new Blob([contenido], { type });

/** Póliza mínima con (o sin) anexos del cheque. */
const poliza = (id: string, anexos: ChequeAnexo[] = []): Poliza => ({
  id,
  tipo: 'cheque',
  folio: 1,
  fecha: '2026-03-07',
  concepto: 'Pago con cheque',
  cheque: anexos.length > 0 ? { numero: '1042', anexos } : { numero: '1042' },
  partidas: [],
  totalDebe: 0,
  totalHaber: 0
});

const metadatoViejo = (sha: string, dias: number): ChequeAnexo => ({
  id: sha,
  sha256: sha,
  bytes: 10,
  mime: 'image/webp',
  capturadoEn: new Date(Date.now() - dias * 86_400_000).toISOString()
});

describe('attachmentService — escalera CONGELADA §8.2 (CH-9/CH-13, sin endurecer)', () => {
  it('escalera A (lado menor ≥ 2500 px): 1600/.72 → 1200/.60 → 900/.45+grises', () => {
    const p = planEscalera(2500);
    expect(p).toEqual([
      { ancho: 1600, calidad: 0.72 },
      { ancho: 1200, calidad: 0.6 },
      { ancho: 900, calidad: 0.45, grises: true }
    ]);
  });

  it('escalera B (escaneo chico, 900 px): SIN downscale, 0.72 → 0.55 → grises', () => {
    const p = planEscalera(900);
    expect(p).toEqual([
      { calidad: 0.72 },
      { calidad: 0.55 },
      { calidad: 0.45, grises: true }
    ]);
  });

  it('escalera B con escaneo 2000 px: único downscale permitido → 1600 px', () => {
    expect(planEscalera(2000)[0]).toEqual({ ancho: 1600, calidad: 0.72 });
  });

  it('limites de la búsqueda binaria P4 por escalera (A .40→.28, B .50→.30)', () => {
    expect(limitesBinaria(3000)).toEqual({ desde: 0.4, hasta: 0.28 });
    expect(limitesBinaria(1200)).toEqual({ desde: 0.5, hasta: 0.3 });
  });

  it('constantes del experimento: objetivo 150 KB, cap 300 KB, umbral 2500 px', () => {
    expect(OBJETIVO_BYTES).toBe(150 * 1024);
    expect(CAP_BYTES).toBe(300 * 1024);
  });

  it('sin pipeline de canvas (jsdom): el anexo NUNCA se rechaza, va tal cual (CH-9)', async () => {
    const archivo = blobWebp('contenido-que-no-se-puede-decodificar');
    const r = await comprimirAnexoCheque(archivo);
    expect(r.sinRecompresion).toBe(true);
    expect(r.bytes).toBe(archivo.size);
    expect(r.mime).toBe('image/webp');
  });
});

describe('attachmentService — dedupe y registro (CH-6/CH-10/CH-11)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('sha256Hex devuelve hex estable (Web Crypto o fallback determinista en jsdom)', async () => {
    const a = await sha256Hex(new TextEncoder().encode('polizas').buffer as ArrayBuffer);
    const b = await sha256Hex(new TextEncoder().encode('polizas').buffer as ArrayBuffer);
    expect(a).toMatch(/^[0-9a-f]+$/);
    expect(a).toBe(b);
  });

  it('sha256Hex pasa el brand check de SubtleCrypto: digest recibe un Uint8Array del realm PROPIO (regresión CI Node 20/24)', async () => {
    // En CI (Node 20/24) `crypto.subtle.digest` rechaza con TypeError los
    // ArrayBuffer forasteros — creados por jsdom en OTRO realm de VM — aunque
    // Node 26 los acepte: ahí nacieron las 11 fallas del 2026-10-23. La regla
    // que fija esta prueba: sha256Hex SIEMPRE entrega a digest un Uint8Array
    // del mismo realm que crypto (la copia del servicio); si algún día vuelve
    // a enviar el original, esta prueba revienta en TODOS los entornos.
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return; // entornos sin Web Crypto: el fallback ya cubre la ruta
    const digestoReal = subtle.digest.bind(subtle);
    const espia = vi.spyOn(subtle, 'digest')
      .mockImplementation(async (algo, datos) => {
        if (!(datos instanceof globalThis.Uint8Array)) {
          throw new TypeError("Failed to execute 'digest' on 'SubtleCrypto': 2nd argument is not instance of ArrayBuffer, Buffer, TypedArray, or DataView.");
        }
        return digestoReal(algo, datos);
      });
    try {
      const sha = await sha256Hex(new TextEncoder().encode('realm-forastero').buffer as ArrayBuffer);
      expect(sha).toMatch(/^[0-9a-f]+$/);
      expect(espia).toHaveBeenCalledTimes(1);
    } finally {
      espia.mockRestore();
    }
  });

  it('guardar → cargar redondo: metadato con bytes reales y binario local intacto', async () => {
    const guardado = await guardarAnexo('e1', blobWebp());
    expect(guardado).not.toBeNull();
    const { metadato } = guardado!;
    expect(metadato.sha256).toBe(metadato.id);
    expect(metadato.bytes).toBe('binario-de-prueba'.length);
    expect(metadato.mime).toBe('image/webp');
    expect(metadato.capturadoEn).toBeTruthy();

    const registro = await registroLeer();
    expect(registro).toHaveLength(1);
    expect(registro[0].sha256).toBe(metadato.sha256);

    const binario = await cargarAnexo('e1', metadato.sha256);
    expect(binario).not.toBeNull();
    expect(await binario!.text()).toBe('binario-de-prueba');
  });

  it('dedupe: la MISMA imagen guardada dos veces produce UN solo binario (CH-10)', async () => {
    const binario = blobWebp('misma-hoja-del-cheque');
    const uno = await guardarAnexo('e1', binario);
    const dos = await guardarAnexo('e1', binario);
    expect(uno!.yaExistia).toBe(false);
    expect(dos!.yaExistia).toBe(true);
    expect(dos!.metadato.sha256).toBe(uno!.metadato.sha256);
    expect(await registroLeer()).toHaveLength(1);
  });

  it('otro cliente tiene SU propio registro y binarios (clave por cliente, C-2)', async () => {
    await guardarAnexo('e1', blobWebp('solo-del-cliente-uno'));
    await guardarAnexo('e2', blobWebp('solo-del-cliente-dos'));
    expect((await registroLeer())).toHaveLength(1); // REGISTRO = e1
    const seo = await cargarAnexo('e1', 'no-existe');    expect(seo).toBeNull();
    const delDos = await guardarAnexo('e2', blobWebp('solo-del-cliente-dos'));
    expect(delDos!.yaExistia).toBe(true); // su propio dedupe
  });

  it('borrarAnexo saca binario Y entrada del registro', async () => {
    const { metadato } = (await guardarAnexo('e1', blobWebp('para-borrar')))!;
    await borrarAnexo('e1', metadato.sha256);
    expect(await registroLeer()).toHaveLength(0);
    expect(await cargarAnexo('e1', metadato.sha256)).toBeNull();
  });
});

describe('attachmentService — huérfanos (CH-14: aviso día 4, purga día 5)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('listarHuerfanos: el anexo SIN póliza que lo referencie ES huérfano', async () => {
    const guardadoA = (await guardarAnexo('e1', blobWebp('referenciado')))!;
    const guardadoB = (await guardarAnexo('e1', blobWebp('no-referenciado')))!;
    const p = poliza('p1', [guardadoA.metadato]);
    const huerfanos = await listarHuerfanos('e1', [p]);
    expect(huerfanos.map(a => a.sha256)).toEqual([guardadoB.metadato.sha256]);
  });

  it('purga día 5: borra los huérfanos con edad ≥ 5 días y respeta los frescos', async () => {
    const viejo = metadatoViejo('sha-viejo', 6);
    const fresco = metadatoViejo('sha-fresco', 4);
    await registroEscribir([viejo, fresco]);
    const borrados = await borrarHuerfanosAntiguos('e1', []);
    expect(borrados).toBe(1);
    const registro = await registroLeer();
    expect(registro.map(a => a.sha256)).toEqual(['sha-fresco']);
    // Con umbral 0 el día-4 también saldría (parámetro explícito de la UI).
    expect(await borrarHuerfanosAntiguos('e1', [], 0)).toBe(1);
    expect(await registroLeer()).toHaveLength(0);
  });

  it('la purga NUNCA toca un anexo referenciaDO', async () => {
    const guardado = (await guardarAnexo('e1', blobWebp('está-referenciado')))!;
    const viejo = { ...guardado.metadato, capturadoEn: metadatoViejo(guardado.metadato.sha256, 30).capturadoEn };
    await registroEscribir([viejo]);
    expect(await borrarHuerfanosAntiguos('e1', [poliza('p1', [guardado.metadato])])).toBe(0);
    expect(await registroLeer()).toHaveLength(1);
  });

  it('borrado en CASCADA: el anexo compartido por dedupe SOBREVIVE a la baja de una póliza', async () => {
    const { metadato } = (await guardarAnexo('e1', blobWebp('compartido')))!;
    const polizaA = poliza('pa', [metadato]);
    const polizaB = poliza('pb', [metadato]);
    // A se elimina, B sigue viva → el archivo queda.
    await borrarAnexosHuerfanosDePoliza('e1', polizaA, [polizaB]);
    expect(await registroLeer()).toHaveLength(1);
    expect(await cargarAnexo('e1', metadato.sha256)).not.toBeNull();
    // B también se elimina → última referencia perdida → binario + registro fuera.
    await borrarAnexosHuerfanosDePoliza('e1', polizaB, []);
    expect(await registroLeer()).toHaveLength(0);
    expect(await cargarAnexo('e1', metadato.sha256)).toBeNull();
  });

  it('diasDesdeCaptura mide días completos (materia prima del aviso/purga)', () => {
    const hoy = Date.now();
    expect(diasDesdeCaptura(new Date(hoy - 36 * 3_600_000).toISOString(), hoy)).toBe(1);
    expect(diasDesdeCaptura(new Date(hoy - 4 * 86_400_000).toISOString(), hoy)).toBe(4);
  });
});
