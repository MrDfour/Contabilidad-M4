/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * crypto.ts — Cifrado E2EE del relay de sincronización (K-3 de PLAN_SYNC_KV.md).
 *
 * AES-GCM 256 vía Web Crypto (crypto.subtle), nativo y sin dependencias:
 * la credential es SIEMPRE una clave de 256 bits (32 bytes, Base64) y cada sobre
 * lleva un IV aleatorio de 96 bits. Cumplimiento LFPDPPP: el contenido contable
 * sale del dispositivo solo como bloque opaco.
 *
 * La frase mnemónica (lib/mnemonic.ts) deriva esa clave con PBKDF2
 * (`derivarClaveDesdeFrase`) cuando se reconstruye la bóveda desde papel.
 */

/** Campos del sobre cifrado (contrato del relay; los blobs son opacos). */
export interface SobreCifrado {
  ciphertext: string; // Base64 del bloque cifrado
  iv: string; // Base64 del IV de 96 bits
  algoritmo: 'AES-GCM';
  version: number; // 1 = esquema AES-GCM 256 con IV de 96 bits (este archivo)
}

export const ALGORITMO_SOBRE: SobreCifrado['algoritmo'] = 'AES-GCM';
export const VERSION_SOBRE = 1;
export const IV_BYTES = 12; // 96 bits (estándar AES-GCM)
export const CLAVE_BYTES = 32; // 256 bits
export const PBKDF2_ITERACIONES = 100000;

/** Handler de Web Crypto: globalThis.crypto.subtle o error claro en español. */
function obtenerSubtle(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (crypto.subtle) no disponible en este entorno.');
}

/** Cerilla de aleatoriedad nativa (getRandomValues) con error claro. */
function azar(n: number): Uint8Array {
  if (typeof globalThis === 'undefined' || !globalThis.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues no disponible en este entorno.');
  }
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// --- Base64 (por bloques: evita desbordes de pila con blobs grandes) ---------

export function bytesABase64(bytes: Uint8Array): string {
  let binario = '';
  const PASO = 0x8000;
  for (let i = 0; i < bytes.length; i += PASO) {
    const bloque = bytes.subarray(i, i + PASO);
    binario += String.fromCharCode(...bloque);
  }
  return btoa(binario);
}

export function bytesDesdeBase64(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

/** Decodifica Base64 y regresa null si la forma es inválida (nunca lanza). */
function base64Seguro(base64: unknown): Uint8Array | null {
  if (typeof base64 !== 'string' || base64.length === 0) return null;
  try {
    return bytesDesdeBase64(base64);
  } catch {
    return null;
  }
}

// --- Claves -----------------------------------------------------------------

/** Genera una clave de 256 bits aleatoria en Base64 (K-9: raíz de la bóveda). */
export function generarClaveSecreta(): string {
  return bytesABase64(azar(CLAVE_BYTES));
}

/** Valida la clave: Base64 decodificable a exactamente 32 bytes. Lanza si no. */
async function claveDesde(claveB64: string): Promise<CryptoKey> {
  const bytes = base64Seguro(claveB64);
  if (!bytes || bytes.length !== CLAVE_BYTES) {
    throw new Error('La credencial debe ser una clave de 256 bits (32 bytes) en Base64.');
  }
  return obtenerSubtle().importKey('raw', bytes as unknown as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Deriva una clave de 256 bits desde una frase (respaldos cifrados futuros y
 * reconstrucción de la bóveda desde la frase mnemónica). Determinista:
 * misma frase + mismo salt → misma clave.
 */
export async function derivarClaveDesdeFrase(
  frase: string,
  saltB64: string,
): Promise<string> {
  const salt = base64Seguro(saltB64);
  if (!salt || salt.length < 8) {
    throw new Error('El salt de derivación debe ser Base64 válido (mínimo 8 bytes).');
  }
  const material = new TextEncoder().encode(frase);
  const raiz = await obtenerSubtle().importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
  const bits = await obtenerSubtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERACIONES },
    raiz,
    CLAVE_BYTES * 8,
  );
  return bytesABase64(new Uint8Array(bits));
}

/** Resumen SHA-256 de un texto: 32 bytes crudos (base de la credencial con frase). */
export async function sha256Bytes(texto: string): Promise<Uint8Array> {
  const material = new TextEncoder().encode(texto);
  const resumen = await obtenerSubtle().digest('SHA-256', material);
  return new Uint8Array(resumen);
}

// --- Sobre cifrado ----------------------------------------------------------

/** Valida la forma del sobre: campos presentes y Base64 legible. */
export function esSobreValido(sobre: unknown): sobre is SobreCifrado {
  if (typeof sobre !== 'object' || sobre === null) return false;
  const s = sobre as Record<string, unknown>;
  if (s.algoritmo !== ALGORITMO_SOBRE) return false;
  if (typeof s.version !== 'number' || s.version !== VERSION_SOBRE) return false;
  if (typeof s.iv !== 'string' || s.iv.length === 0) return false;
  if (typeof s.ciphertext !== 'string' || s.ciphertext.length === 0) return false;
  return base64Seguro(s.iv) !== null && base64Seguro(s.ciphertext) !== null;
}

/**
 * Cifra texto UTF-8 con la credencial: AES-GCM con IV aleatorio por blob.
 * Dos llamadas con la misma entrada producen ciphertext distinto (IV/fresh).
 *
 * Solo acepta claves de 256 bits en Base64 (`generarClaveSecreta`); para claves
 * nacidas de frases usa `derivarClaveDesdeFrase` antes de llamar aquí.
 */
export async function encryptPayload(texto: string, claveB64: string): Promise<SobreCifrado> {
  if (typeof texto !== 'string') {
    throw new Error('encryptPayload espera un texto (string) y se recibió otro tipo.');
  }
  const clave = await claveDesde(claveB64);
  const ivBytes = azar(IV_BYTES);
  const cifrado = await obtenerSubtle().encrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    clave,
    new TextEncoder().encode(texto) as unknown as BufferSource,
  );
  return {
    ciphertext: bytesABase64(new Uint8Array(cifrado)),
    iv: bytesABase64(ivBytes),
    algoritmo: ALGORITMO_SOBRE,
    version: VERSION_SOBRE,
  };
}

/**
 * Descifra el sobre con la misma credencial. Lanza un error genérico en español
 * si la credencial es incorrecta o el sobre está dañado (errores de detalle nunca
 * salen a la UI: `error.name` de crypto ya es genérico, se refuerza por claridad).
 */
export async function decryptPayload(sobre: unknown, claveB64: string): Promise<string> {
  if (!esSobreValido(sobre)) {
    throw new Error('Sobre cifrado inválido: campos ausentes o Base64 ilegible.');
  }
  const s = sobre as SobreCifrado;
  try {
    const clave = await claveDesde(claveB64);
    const plano = await obtenerSubtle().decrypt(
      { name: 'AES-GCM', iv: bytesDesdeBase64(s.iv) as unknown as BufferSource },
      clave,
      bytesDesdeBase64(s.ciphertext) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plano);
  } catch {
    throw new Error('No se pudo descifrar: credencial incorrecta o sobre dañado.');
  }
}
