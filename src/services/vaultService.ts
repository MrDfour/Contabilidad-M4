/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * vaultService.ts — Credenciales y ciclo de vida de la bóveda (K-9/K-10 de
 * PLAN_SYNC_KV.md). Cada dispositivo guarda su propia copia local de
 * `{ vaultId, secretKey, frase, deviceLabel, createdAt }` bajo
 * `contasis_vault_creds` via la infraestructura de storage existente
 * (Electron→archivo, Capacitor→Filesystem, web→localStorage).
 *
 * El servicio NO conoce el snapshot ni la restauración (K-11): solo
 * credenciales, verificación del relay y alistamiento QR/frase.
 */

import { bytesDesdeBase64 } from '../lib/crypto';
import { credencialDesdeFrase, elegirFraseAleatoria, normalizarFrase } from '../lib/mnemonic';
import { loadFromStorage, saveToStorage } from './storageService';

/** Clave de storage local de las credenciales de bóveda (K-9). */
export const CLAVE_CREDS = 'contasis_vault_creds';

/** Credenciales locales del dispositivo (copia por dispositivo). */
export interface CredencialesBoveda {
  vaultId: string;
  secretKey: string;
  /** Frase mnemónica de origen (la raíz de la bóveda); para papel y QR. */
  frase: string;
  deviceLabel: string;
  createdAt: string;
}

/** Valores mínimos constantes del servicio. */
export const ETIQUETA_DESKTOP = 'Escritorio';
export const ETIQUETA_MOVIL = 'Móvil';

// --- Validaciones (puras, testeables) ----------------------------------------

/** Fecha ISO estricta (igual regla que el relay). */
function esFechaIso(valor: unknown): valor is string {
  return (
    typeof valor === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(valor)
  );
}

/** Forma mínima valida de credenciales leídas (o pegadas/escaneadas). */
export function esCredencialesValidas(crudo: unknown): crudo is CredencialesBoveda {
  if (typeof crudo !== 'object' || crudo === null) return false;
  const c = crudo as Record<string, unknown>;
  if (typeof c.vaultId !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(c.vaultId)) return false;
  if (typeof c.secretKey !== 'string' || c.secretKey.length === 0) return false;
  try {
    if (bytesDesdeBase64(c.secretKey).length !== 32) return false;
  } catch {
    return false;
  }
  if (typeof c.frase !== 'string' || c.frase.length > 120) return false;
  if (typeof c.deviceLabel !== 'string' || c.deviceLabel.length < 1 || c.deviceLabel.length > 64) return false;
  return esFechaIso(c.createdAt);
}

/**
 * Payload del QR de alistamiento (K-9): el relay URL viaja adentro para que el
 * móvil no dependa de una env var propia.
 */
export interface PayloadQr {
  v: number;
  url: string;
  vaultId: string;
  secretKey: string;
}

export const VERSION_QR = 1;/** Sufijo corto de la bóveda para mostrar en UI (últimos 6 en mayúsculas). */
export function sufijoBoveda(vaultId: string): string {
  return vaultId.slice(-6).toUpperCase();
}

/** Parsea y valida el contenido crudo de un QR; regresa null si es ajeno/roto. */
export function parsePayloadQr(crudo: unknown): PayloadQr | null {
  if (typeof crudo !== 'string') return null;
  const texto = crudo.trim();
  if (!texto.startsWith('{')) return null;
  try {
    const datos = JSON.parse(texto) as Record<string, unknown>;
    if (datos.v !== VERSION_QR) return null;
    if (typeof datos.url !== 'string' || !esUrlRelayValida(datos.url)) return null;
    if (typeof datos.vaultId !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(datos.vaultId)) return null;
    if (typeof datos.secretKey !== 'string' || datos.secretKey.length === 0) return null;
    try {
      if (bytesDesdeBase64(datos.secretKey).length !== 32) return null;
    } catch {
      return null;
    }
    return { v: datos.v, url: datos.url, vaultId: datos.vaultId, secretKey: datos.secretKey };
  } catch {
    return null;
  }
}

// --- Relay URL ---------------------------------------------------------------

/** URL del relay configurada en el bundle (K-12); '' si no existe. */
export function obtenerRelayUrl(): string {
  const cruda = import.meta.env.VITE_RELAY_URL;
  return typeof cruda === 'string' ? cruda.trim().replace(/\/+$/, '') : '';
}

/** Valida la forma de una URL de relay (https o http local para desarrollo). */
export function esUrlRelayValida(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    // Dev local (wrangler dev) acepta http solo en localhost/127.0.0.1.
    if (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Verifica vida del relay (/health); nunca lanza. */
export async function verificarRelay(relayUrl: string): Promise<{ ok: boolean; detalle: string }> {
  if (!esUrlRelayValida(relayUrl)) {
    return { ok: false, detalle: 'URL del relay inválida o no configurada.' };
  }
  try {
    const respuesta = await fetch(`${relayUrl}/health`);
    if (!respuesta.ok) return { ok: false, detalle: `Relay respondió ${respuesta.status}.` };
    const cuerpo = (await respuesta.json()) as { status?: unknown };
    return cuerpo.status === 'online'
      ? { ok: true, detalle: 'Relay en línea.' }
      : { ok: false, detalle: 'Relay no reportó estado online.' };
  } catch {
    return { ok: false, detalle: 'Relay inaccesible (sin conexión o URL errónea).' };
  }
}

// --- Ciclo de vida de credenciales -------------------------------------------

async function guardarCredenciales(credenciales: CredencialesBoveda): Promise<void> {
  await saveToStorage(CLAVE_CREDS, credenciales);
}

/** Lee la credencial local; regresa null si no existe o está corrupta. */
export async function obtenerCredenciales(): Promise<CredencialesBoveda | null> {
  let crudo: unknown = null;
  try {
    crudo = await loadFromStorage(CLAVE_CREDS);
  } catch {
    return null; // JSON corrupto en storage (o medio no accesible)
  }
  return esCredencialesValidas(crudo) ? crudo : null;
}

/**
 * Crea una bóveda NUEVA en este dispositivo: elige la frase aleatoria y deriva
 * la credencial determinista (DV-K-3). La frase queda guardada junto con la
 * credencial (es la raíz; para papel).
 */
export async function crearBoveda(deviceLabel: string): Promise<CredencialesBoveda> {
  const frase = elegirFraseAleatoria();
  const { vaultId, secretKey } = await credencialDesdeFrase(frase);
  const credenciales: CredencialesBoveda = {
    vaultId,
    secretKey,
    frase,
    deviceLabel: deviceLabel.trim() || ETIQUETA_DESKTOP,
    createdAt: new Date().toISOString(),
  };
  await guardarCredenciales(credenciales);
  return credenciales;
}

/** Regenera credenciales y las guarda (mismo bóveda, etiqueta distinta). */
export async function actualizarEtiqueta(nuevaEtiqueta: string): Promise<CredencialesBoveda | null> {
  const actual = await obtenerCredenciales();
  if (!actual) return null;
  const etiqueta = nuevaEtiqueta.trim() || actual.deviceLabel;
  const actualizadas = { ...actual, deviceLabel: etiqueta.slice(0, 64) };
  await guardarCredenciales(actualizadas);
  return actualizadas;
}

/**
 * Alista este dispositivo con el contenido de un QR ({ v, url, vaultId, secretKey }).
 * GUARDA la credencial compartida; la frase queda vacía (solo el creador la tiene).
 */
export async function alistarDesdeQr(
  payloadTexto: string,
  deviceLabel: string,
): Promise<CredencialesBoveda | null> {
  const payload = parsePayloadQr(payloadTexto);
  if (!payload) return null;

  const credenciales: CredencialesBoveda = {
    vaultId: payload.vaultId,
    secretKey: payload.secretKey,
    frase: '',
    deviceLabel: deviceLabel.trim() || ETIQUETA_MOVIL,
    createdAt: new Date().toISOString(),
  };
  await guardarCredenciales(credenciales);
  return credenciales;
}

/**
 * Alista este dispositivo desde la FRASE (6 palabras): deriva la credencial
 * determinista y confirma que coincide con la bóveda que se pretende usar.
 * `vaultIdEsperado` (opcional) protege contra teclear una frase de otra bóveda.
 */
export async function alistarDesdeFrase(
  fraseCruda: string,
  deviceLabel: string,
  vaultIdEsperado?: string,
): Promise<{ ok: boolean; credenciales?: CredencialesBoveda; detalle: string }> {
  const normalizada = normalizarFrase(fraseCruda);
  if (!normalizada) {
    return { ok: false, detalle: 'Escribe la frase de 6 palabras de la bóveda.' };
  }

  let derivada: { vaultId: string; secretKey: string };
  try {
    derivada = await credencialDesdeFrase(normalizada);
  } catch {
    return { ok: false, detalle: 'La frase no es válida (deben ser 6 palabras del diccionario).' };
  }

  if (vaultIdEsperado && derivada.vaultId !== vaultIdEsperado) {
    return {
      ok: false,
      detalle: 'La frase pertenece a otra bóveda. Solicita el QR o la frase correcta.',
    };
  }

  const credenciales: CredencialesBoveda = {
    vaultId: derivada.vaultId,
    secretKey: derivada.secretKey,
    frase: normalizada,
    deviceLabel: deviceLabel.trim() || ETIQUETA_MOVIL,
    createdAt: new Date().toISOString(),
  };
  await guardarCredenciales(credenciales);
  return { ok: true, credenciales, detalle: 'Bóveda alineada en este dispositivo.' };
}

/** Quita la credencial local (el relay conserva la bóveda; K-14 vía de desalistado). */
export async function desalistar(): Promise<void> {
  await saveToStorage(CLAVE_CREDS, null);
}

/** Arma el payload del QR desde credenciales existentes (el creador lo muestra). */
export function construirPayloadQr(
  credenciales: CredencialesBoveda,
  relayUrl: string,
): string | null {
  if (!esUrlRelayValida(relayUrl)) return null;
  return JSON.stringify({
    v: VERSION_QR,
    url: relayUrl,
    vaultId: credenciales.vaultId,
    secretKey: credenciales.secretKey,
  });
}
