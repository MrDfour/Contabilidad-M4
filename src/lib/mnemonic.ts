/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * mnemonic.ts — Frase mnemónica de 6 palabras (K-9 de PLAN_SYNC_KV.md).
 *
 * Esquema adoptado de Teacher-Buddy: la frase ES la raíz de la bóveda. Se eligen
 * 6 palabras al azar y la credencial se deriva de forma determinista
 * (lib/crypto.ts): `vaultId = hash(frase)` y `secretKey = hash(vaultId:frase)`.
 * Un dispositivo que reconstruye la bóveda escribiendo la frase llega a la
 * MISMA credencial sin transporte adicional. (Nota: 6 palabras no codifican
 * reversiblemente 256 bits; por eso la frase es la fuente, no un envoltorio.)
 */

import { bytesABase64, sha256Bytes } from './crypto';

/**
 * Diccionario de 128 palabras cotidianas y positivas en español (sin tildes,
 * para teclearlas sin teclado especial). Copiado de Teacher-Buddy; la lista
 * original tenía 'estrella' repetida — la segunda entrada se cambió por
 * 'abeto' para conservar 128 valores únicos (el índice se usa módulo 128).
 */
export const DICCIONARIO = [
  'arbol', 'arena', 'barco', 'brisa', 'campo', 'canto', 'cielo', 'clavel',
  'coral', 'danza', 'delfin', 'dorado', 'estrella', 'faro', 'fiesta', 'flor',
  'fuente', 'girasol', 'hoja', 'isla', 'jardin', 'laguna', 'linda', 'lluvia',
  'luna', 'magia', 'marea', 'melodia', 'monte', 'nieve', 'nube', 'oceano',
  'olivo', 'paloma', 'parque', 'pastor', 'perla', 'piedra', 'playa', 'poema',
  'prado', 'puente', 'puerto', 'rayo', 'reina', 'rio', 'roble', 'rocio',
  'rosa', 'sabio', 'selva', 'sendero', 'sierra', 'sol', 'suave', 'tarde',
  'tierra', 'torre', 'valle', 'vela', 'viento', 'viaje', 'vida', 'vuelo',
  'alegre', 'amigo', 'aurora', 'bosque', 'calma', 'cereza', 'cisne', 'colina',
  'cristal', 'dulce', 'eco', 'esperanza', 'espiga', 'abeto', 'fruto', 'garza',
  'globo', 'gracia', 'hechizo', 'horizonte', 'ilusion', 'jazmin', 'joya', 'laurel',
  'leon', 'lienzo', 'limon', 'lirio', 'luz', 'manto', 'manantial', 'mariposa',
  'mirlo', 'miel', 'musica', 'nardo', 'navio', 'noble', 'oasis', 'ola',
  'orilla', 'palma', 'paz', 'penon', 'pinar', 'pluma', 'primavera', 'pureza',
  'quimera', 'refugio', 'remanso', 'ribera', 'sauce', 'semilla', 'serena', 'sombra',
  'sonrisa', 'sueno', 'tilo', 'trebol', 'tulipan', 'union', 'valiente', 'zafiro'
] as const;

/** Número de palabras por frase (convención del plan; Teacher-Buddy usó 6). */
export const PALABRAS_POR_FRASE = 6;

/** Aleatoriedad nativa; regresa una frase de 6 palabras separadas por guion. */
export function elegirFraseAleatoria(): string {
  if (typeof globalThis === 'undefined' || !globalThis.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues no disponible en este entorno.');
  }
  const indice = new Uint8Array(PALABRAS_POR_FRASE);
  globalThis.crypto.getRandomValues(indice);
  return Array.from(indice)
    .map((valor) => DICCIONARIO[valor % DICCIONARIO.length])
    .join('-');
}

/**
 * Normaliza la frase escrita a mano: minúsculas, tildes fuera, espacios y
 * separadores variados (espacios, guiones, comas) → guion simple.
 */
export function normalizarFrase(frase: string): string {
  return frase
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s,\-]+/)
    .filter(Boolean)
    .join('-');
}

/** Valida: exactamente 6 palabras, todas presentes en el diccionario. */
export function esFraseValida(frase: string): boolean {
  const palabras = normalizarFrase(frase).split('-');
  if (palabras.length !== PALABRAS_POR_FRASE) return false;
  return palabras.every((palabra) => (DICCIONARIO as readonly string[]).includes(palabra));
}

/** Credencial derivada de la frase (determinista en todos los dispositivos). */
export interface CredencialFrase {
  vaultId: string;
  secretKey: string;
}

/**
 * Deriva `{ vaultId, secretKey }` desde la frase (esquema Teacher-Buddy):
 * - `vaultId = vlt_<primeros 12 hex del SHA-256 de la frase>`
 * - `secretKey = Base64(SHA-256('<vaultId>:<frase>'))` — exactamente 256 bits.
 * Lanza si la frase no es válida (una vez normalizada).
 */
export async function credencialDesdeFrase(
  frase: string,
): Promise<CredencialFrase> {
  const normalizada = normalizarFrase(frase);
  if (!esFraseValida(normalizada)) {
    throw new Error(
      'La frase debe tener 6 palabras del diccionario (separadas por guion o espacio).',
    );
  }

  const hashFrase = await sha256Bytes(normalizada);
  const hex = Array.from(hashFrase)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const vaultId = `vlt_${hex.slice(0, 12)}`;

  const clave = await sha256Bytes(`${vaultId}:${normalizada}`);
  return { vaultId, secretKey: bytesABase64(clave) };
}
