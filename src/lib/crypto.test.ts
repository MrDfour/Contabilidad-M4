/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  bytesDesdeBase64,
  bytesABase64,
  decryptPayload,
  derivarClaveDesdeFrase,
  encryptPayload,
  esSobreValido,
  generarClaveSecreta,
  CLAVE_BYTES,
  IV_BYTES,
} from './crypto';

/** Clave válida de prueba: 32 bytes encadenados y predecibles. */
const CLAVE = bytesABase64(new Uint8Array(CLAVE_BYTES).map((_, i) => (i * 7 + 3) % 256));

describe('crypto: claves y utilidades Base64 (K-3)', () => {
  it('generarClaveSecreta produce Base64 de exactamente 32 bytes y no repite', () => {
    const a = generarClaveSecreta();
    const b = generarClaveSecreta();
    expect(bytesDesdeBase64(a)).toHaveLength(32);
    expect(bytesDesdeBase64(b)).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it('bytesABase64 / bytesDesdeBase64 son inversos y aguantan bloques grandes', () => {
    const originales = new Uint8Array(0x8000 + 17); // cruza el borde del desplazamiento por bloques
    originales.forEach((_, i) => {
      originales[i] = (i * 31 + 11) % 256;
    });
    const vuelta = bytesDesdeBase64(bytesABase64(originales));
    expect(Array.from(vuelta)).toEqual(Array.from(originales));
  });
});

describe('crypto: round-trip cifrado/descifrado (K-3)', () => {
  it('cifra y descifra texto en español con acentos y estructuras JSON', async () => {
    const texto = JSON.stringify({
      mensaje: 'Póliza de ingreso por venta de mercancía — enero 2026',
      monto: 1500.75,
    });
    const sobre = await encryptPayload(texto, CLAVE);

    expect(sobre.algoritmo).toBe('AES-GCM');
    expect(sobre.version).toBe(1);
    expect(bytesDesdeBase64(sobre.iv)).toHaveLength(IV_BYTES);

    await expect(decryptPayload(sobre, CLAVE)).resolves.toBe(texto);
  });

  it('misma entrada → ciphertext distinto (IV aleatorio por blob), ambos descifrables', async () => {
    const texto = 'Estado contable repetido.';
    const sobre1 = await encryptPayload(texto, CLAVE);
    const sobre2 = await encryptPayload(texto, CLAVE);

    expect(sobre1.ciphertext).not.toBe(sobre2.ciphertext);
    expect(sobre1.iv).not.toBe(sobre2.iv);
    await expect(decryptPayload(sobre1, CLAVE)).resolves.toBe(texto);
    await expect(decryptPayload(sobre2, CLAVE)).resolves.toBe(texto);
  });

  it('texto vacío se cifra y descifra sin error', async () => {
    const sobre = await encryptPayload('', CLAVE);
    await expect(decryptPayload(sobre, CLAVE)).resolves.toBe('');
  });
});

describe('crypto: fallos esperados (credencial y sobre)', () => {
  it('clave incorrecta lanza error genérico en español (jamás detalle criptográfico)', async () => {
    const sobre = await encryptPayload('secreto contable', CLAVE);
    const otraClave = generarClaveSecreta();
    await expect(decryptPayload(sobre, otraClave)).rejects.toThrow(
      'No se pudo descifrar: credencial incorrecta o sobre dañado.',
    );
  });

  it('clave con longitud equivocada rechaza el cifrado con mensaje claro', async () => {
    const corta = bytesABase64(new Uint8Array(16));
    await expect(encryptPayload('x', corta)).rejects.toThrow('256 bits');
  });

  it('sobre con bytes válidos pero contenido roto lanza el fallo genérico', async () => {
    const sobre = await encryptPayload('secreto', CLAVE);
    const roto = { ...sobre, ciphertext: bytesABase64(new Uint8Array(33)) };
    await expect(decryptPayload(roto, CLAVE)).rejects.toThrow('No se pudo descifrar');
  });

  it('ciphertext con Base64 ilegible se detecta por esSobreValido (sobre inválido)', async () => {
    const sobre = await encryptPayload('secreto', CLAVE);
    const roto = { ...sobre, ciphertext: ':::no-base64:::' };
    await expect(decryptPayload(roto, CLAVE)).rejects.toThrow('Sobre cifrado inválido');
  });

  it('sobre con campos ausentes o versión extraña se detecta por esSobreValido', () => {
    expect(esSobreValido(null)).toBe(false);
    expect(esSobreValido('texto')).toBe(false);
    expect(esSobreValido({ ciphertext: 'a', iv: 'b', algoritmo: 'AES-GCM', version: 1 })).toBe(false);
    expect(esSobreValido({ ciphertext: 'a', algoritmo: 'AES-GCM', version: 1 })).toBe(false);
    expect(esSobreValido({ ciphertext: 'a', iv: 'b', algoritmo: 'AES-256-CBC', version: 1 })).toBe(false);
    expect(esSobreValido({ ciphertext: 'a', iv: 'b', algoritmo: 'AES-GCM', version: 2 })).toBe(false);

    const sobreValido = { ciphertext: 'YWFh', iv: 'YmJi', algoritmo: 'AES-GCM', version: 1 };
    expect(esSobreValido(sobreValido)).toBe(true);
  });

  it('encryptPayload rechaza entrada no-string', async () => {
    await expect(
      encryptPayload({ mensaje: 'objeto' } as unknown as string, CLAVE),
    ).rejects.toThrow('texto');
  });
});

describe('crypto: derivación desde frase (respaldos cifrados futuros)', () => {
  it('derivarClaveDesdeFrase es determinista y produce 32 bytes', async () => {
    const claveA = await derivarClaveDesdeFrase('Repaldo Fiscal 2026', bytesABase64(new Uint8Array(16).fill(9)));
    const claveB = await derivarClaveDesdeFrase('Repaldo Fiscal 2026', bytesABase64(new Uint8Array(16).fill(9)));

    expect(claveA).toBe(claveB);
    expect(bytesDesdeBase64(claveA)).toHaveLength(32);
  });

  it('salt distinto deriva claves distintas (la derivación no colapsa)', async () => {
    const claveA = await derivarClaveDesdeFrase('frase', bytesABase64(new Uint8Array(16).fill(1)));
    const claveB = await derivarClaveDesdeFrase('frase', bytesABase64(new Uint8Array(16).fill(2)));
    expect(claveA).not.toBe(claveB);
  });

  it('la clave derivada funciona como credencial de encrypt/decrypt', async () => {
    const clave = await derivarClaveDesdeFrase('contabilidad', bytesABase64(new Uint8Array(16).fill(5)));
    const sobre = await encryptPayload('blob derivado', clave);
    await expect(decryptPayload(sobre, clave)).resolves.toBe('blob derivado');
  });
});
