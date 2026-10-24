/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { ChequeAnexo, Poliza } from '../types';
import { saveToStorage, loadFromStorage } from './storageService';
import { clavePorEmpresa } from '../lib/empresas';

/**
 * attachmentService (Fase 4 de PLAN_CHEQUES.md) — pieza OWNER del binario del
 * anexo del cheque (anti-R1): los componentes NUNCA guardan, cargan ni borran
 * binarios por su cuenta.
 *
 * Modelo (CH-6/CH-11): la póliza viaja con la REFERENCIA `ChequeAnexo`
 * (sha + bytes + mime + fecha); el binario vive 100% LOCAL al dispositivo y
 * NUNCA entra a la bóveda (§6: el blob de sync no da para fotos).
 *
 * Backends (mismo orden de detección que storageService):
 *   Electron  → IPC `save-attachment`/`load-attachment`/`delete-attachment`
 *               (archivos en `userData/attachments/`).
 *   APK nativo→ Plugin Filesystem, `Directory.Data` (como storageService).
 *   Web/PWA   → IndexedDB `contasis_anexos` / store `anexos` (localStorage es
 *               demasiado chico para imágenes). Sin IndexedDB (pruebas jsdom)
 *               degrada a una caché de memoria de sesión.
 *
 * Metadatos del registro: clave POR CLIENTE `contasis_anexos_<empresaId>`
 * (C-2, vía `clavePorEmpresa`) — lista pequeña JSON `ChequeAnexo[]`.
 */

const DB_NOMBRE = 'contasis_anexos';
const DB_STORE = 'anexos';
const REGISTRO_KEY = 'contasis_anexos';

/* ============================================================
 * ESCALERA DE COMPRESIÓN (CH-9/CH-13) — parámetros CONGELADOS
 * por el experimento §8.2 (gate superado 2026-10-23, sin endurecer).
 * ============================================================ */

export interface PasoEscalera {
  /** Ancho destino del LARGO lado (px); ausente = conservar el original. */
  ancho?: number;
  /** Calidad WebP del paso. */
  calidad: number;
  /** Convertir a grises (P3 de la escalera A). */
  grises?: boolean;
}

/** Objetivo cómodo del experimento y CAP duro antes de buscar más calidad. */
export const OBJETIVO_BYTES = 150 * 1024;
export const CAP_BYTES = 300 * 1024;
/** Umbral del lado MENOR del original: foto de cámara → escalera agresiva. */
export const UMBRAL_LADO_A = 2500;

/**
 * P1–P3 de la escalera según el lado MENOR del original (§8.1):
 *   A (≥ 2500 px): 1600/.72 → 1200/.60 → 900/.45+grises.
 *   B (< 2500 px): original/.72 (downscale SOLO si el lado > 1600, el
 *                  escaneo chico jamás pierde px) → −20% calidad (.55) →
 *                  grises sin bajar px.
 * La P4 (búsqueda binaria) corre aparte con `limitesBinaria`.
 */
export const planEscalera = (ladoMenor: number): PasoEscalera[] => {
  if (ladoMenor < 0) return [];
  if (ladoMenor >= UMBRAL_LADO_A) {
    return [
      { ancho: 1600, calidad: 0.72 },
      { ancho: 1200, calidad: 0.6 },
      { ancho: 900, calidad: 0.45, grises: true }
    ];
  }
  const pasos: PasoEscalera[] = [];
  pasos.push(ladoMenor > 1600 ? { ancho: 1600, calidad: 0.72 } : { calidad: 0.72 });
  pasos.push({ calidad: 0.55 });
  pasos.push({ calidad: 0.45, grises: true });
  return pasos;
};

/** P4 (búsqueda binaria de calidad, mismos px): límites por escalera. */
export const limitesBinaria = (ladoMenor: number): { desde: number; hasta: number } =>
  ladoMenor >= UMBRAL_LADO_A ? { desde: 0.4, hasta: 0.28 } : { desde: 0.5, hasta: 0.3 };

export interface ResultadoAnexo {
  blob: Blob;
  mime: ChequeAnexo['mime'];
  bytes: number;
  /** true = el entorno no tiene pipeline de canvas (pruebas jsdom): se
   *  devuelve el ORIGINAL tal cual — nunca se rechaza un anexo (CH-9). */
  sinRecompresion?: boolean;
}

/* ==================== utilidades binarias ==================== */

const aBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => reject(lector.error ?? new Error('No se pudo leer el anexo'));
    lector.readAsDataURL(blob);
  });

const desdeBase64 = (base64: string, mime: string): Blob => {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

const extensionDe = (mime: string): string => (mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp');

/**
 * Cinturón de seguridad contra entornos donde canvas/decodificador existen
 * como stubs pero NUNCA responden (jsdom). En navegadores reales nunca
 * dispara. El catch del pipeline cae al fallback "tal cual" (CH-9).
 */
/** Techo de la CODIFICACIÓN (ciclos de canvas). La decodificación usa uno corto: en
 *  jsdom el <img> jamás responde y 4/wait*4 pasos reventarían el presupuesto de tests. */
const TIEMPO_IMAGEN_MS = 4000;
const TIEMPO_DECODE_MS = 800;
const conTiempoLimite = <T>(promesa: Promise<T>, ms: number, errorAlVencer: Error): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const reloj = setTimeout(() => reject(errorAlVencer), ms);
    promesa.then(
      valor => { clearTimeout(reloj); resolve(valor); },
      falla => { clearTimeout(reloj); reject(falla); }
    );
  });

/** Nombre del binario en disco (nativo/Electron): anexo_<empresaId>_<sha>.<ext>. */
const nombreBinario = (empresaId: string, sha: string, mime: string): string =>
  `anexo_${empresaId}_${sha}.${extensionDe(mime)}`;

/**
 * SHA-256 del binario (CH-10) con Web Crypto. Sin `crypto.subtle`
 * (pruebas jsdom) usa un hash FNV-1a determinista y compacto para que el
 * dedupe siga siendo comprobable en el entorno de pruebas.
 */
export const sha256Hex = async (datos: ArrayBuffer): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    // Copia al realm ACTUAL: en pruebas los ArrayBuffer llegan del realm de
    // jsdom (otra VM) y el brand check del SubtleCrypto de Node viejo (CI,
    // Node 20/24) los rechaza — «2nd argument is not instance of ArrayBuffer,
    // Buffer, TypedArray, or DataView». El Uint8Array propio (con su buffer
    // copiado) pasa esa validación en cualquier Node o navegador.
    const bytes = new Uint8Array(new Uint8Array(datos));
    const digesto = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digesto), b => b.toString(16).padStart(2, '0')).join('');
  }
  const bytes = new Uint8Array(datos);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/* ==================== decodificación + canvas ==================== */

type OrigenImagen = ImageBitmap | HTMLImageElement;

const ladoDe = (origen: OrigenImagen): { largo: number; ladoMenor: number } => {
  const w = 'width' in origen ? origen.width : 0;
  const h = 'height' in origen ? origen.height : 0;
  return { largo: Math.max(w, h), ladoMenor: Math.min(w, h) };
};

const decodificar = async (archivo: Blob): Promise<OrigenImagen> => {
  const sinImagen = new Error('Decodificación de imagen no disponible en este entorno');
  if (typeof window.createImageBitmap === 'function') {
    return await conTiempoLimite(window.createImageBitmap(archivo), TIEMPO_DECODE_MS, sinImagen);
  }
  if (typeof URL.createObjectURL !== 'function' || typeof window.Image !== 'function') {
    throw sinImagen;
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new window.Image();
    await conTiempoLimite(
      new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('No se pudo decodificar la imagen del cheque'));
        img.src = url;
      }),
      TIEMPO_DECODE_MS,
      sinImagen
    );
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const canvasABlob = (canvas: HTMLCanvasElement, calidad: number): Promise<Blob> =>
  conTiempoLimite(
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => { blob ? resolve(blob) : reject(new Error('No se pudo codificar la imagen del cheque')); },
        'image/webp',
        calidad
      );
    }),
    TIEMPO_IMAGEN_MS,
    new Error('Codificación WebP no disponible en este entorno')
  );

const renderizar = async (origen: OrigenImagen, paso: PasoEscalera): Promise<ResultadoAnexo> => {
  const { largo } = ladoDe(origen);
  const escala = paso.ancho !== undefined ? Math.min(1, paso.ancho / largo) : 1;
  const w = Math.max(1, Math.round(('width' in origen ? origen.width : 0) * escala));
  const h = Math.max(1, Math.round(('height' in origen ? origen.height : 0) * escala));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible para la escalera');
  if (paso.grises) ctx.filter = 'grayscale(100%)';
  ctx.drawImage(origen as CanvasImageSource, 0, 0, w, h);

  let blob = await canvasABlob(canvas, paso.calidad);
  // Fallback JPEG si el navegador no codifica WebP (CH-9; §8.3 cobertura).
  if (blob.type !== 'image/webp') {
    blob = await conTiempoLimite(
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => { b ? resolve(b) : reject(new Error('No se pudo codificar la imagen (JPEG)')); },
          'image/jpeg',
          paso.calidad
        );
      }),
      TIEMPO_IMAGEN_MS,
      new Error('Codificación JPEG no disponible en este entorno')
    );
  }
  return {
    blob,
    mime: blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
    bytes: blob.size
  };
};

/**
 * Pipeline COMPLETO del anexo (archivo → escalera → CAPADO). NUNCA rechaza:
 * si tras P1–P3 y la búsqueda binaria sigue > 300 KB, se guarda el mejor
 * resultado obtenido (CH-9: "guardar capado").
 */
export const comprimirAnexoCheque = async (archivo: Blob): Promise<ResultadoAnexo> => {
  try {
    const origen = await decodificar(archivo);
    const { ladoMenor } = ladoDe(origen);
    const pasos = planEscalera(ladoMenor);

    let mejor: ResultadoAnexo | null = null;
    for (const paso of pasos) {
      const r = await renderizar(origen, paso);
      if (r.bytes <= OBJETIVO_BYTES) return r;
      if (!mejor || r.bytes < mejor.bytes) mejor = r;
    }
    if (mejor && mejor.bytes <= CAP_BYTES) return mejor;

    // P4: búsqueda binaria de calidad SIN cambiar px del último paso.
    const ultimoPaso = pasos[pasos.length - 1];
    const limites = limitesBinaria(ladoMenor);
    let desde = limites.desde;
    const hasta = limites.hasta;
    while (desde - hasta > 0.02) {
      const medio = (desde + hasta) / 2;
      const r = await renderizar(origen, { ancho: ultimoPaso.ancho, calidad: medio, grises: ultimoPaso.grises });
      if (r.bytes <= CAP_BYTES) return r;
      // Se sigue registrando el mejor hasta ahora (para el CAPADO).
      if (!mejor || r.bytes < mejor.bytes) mejor = r;
      // Aún grande: bajar más la calidad (bajar `desde`).
      desde = medio;
    }
    // Guardado CAPADO (CH-9): queda el MEJOR resultado obtenido, sin rechazo.
    return mejor as ResultadoAnexo;
  } catch {
    return {
      blob: archivo,
      mime: archivo.type === 'image/jpeg' || archivo.type === 'image/png' ? 'image/jpeg' : 'image/webp',
      bytes: archivo.size,
      sinRecompresion: true
    };
  }
};

/* ==================== backend del binario ==================== */

type BackendAnexos = 'electron' | 'nativo' | 'web';

const backendActivo = (): BackendAnexos => {
  if (typeof window !== 'undefined' && window.electronAPI) return 'electron';
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()) return 'nativo';
  return 'web';
};

const CLAVE_BINARIO = (empresaId: string, sha: string) => `${empresaId}_${sha}`;

/** Caché de memoria solo para entornos SIN IndexedDB (pruebas jsdom). */
const memoriaWeb = new Map<string, { blob: Blob; mime: string }>();

const abrirDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB de anexos'));
  });

const guardarBinario = async (empresaId: string, sha: string, ruta: ResultadoAnexo): Promise<void> => {
  const backend = backendActivo();
  const nombre = nombreBinario(empresaId, sha, ruta.mime);
  if (backend === 'electron') {
    await window.electronAPI?.saveAttachment?.(nombre, await aBase64(ruta.blob));
    return;
  }
  if (backend === 'nativo') {
    await Filesystem.writeFile({
      path: nombre,
      data: await aBase64(ruta.blob),
      directory: Directory.Data
    });
    return;
  }
  if (typeof indexedDB !== 'undefined') {
    const db = await abrirDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({ blob: ruta.blob, mime: ruta.mime }, CLAVE_BINARIO(empresaId, sha));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar el anexo'));
    });
    db.close();
    return;
  }
  // Sin IndexedDB (pruebas): memoria de sesión.
  memoriaWeb.set(CLAVE_BINARIO(empresaId, sha), { blob: ruta.blob, mime: ruta.mime });
};

const cargarBinario = async (empresaId: string, sha: string, mimeFavorita = 'image/webp'): Promise<Blob | null> => {
  const backend = backendActivo();
  // El registro conocía el mime al guardar; si hace falta, probamos extensiones.
  const nombres = Array.from(new Set([
    nombreBinario(empresaId, sha, mimeFavorita),
    nombreBinario(empresaId, sha, 'image/webp'),
    nombreBinario(empresaId, sha, 'image/jpeg')
  ]));
  if (backend === 'electron') {
    for (const nombre of nombres) {
      const b64 = await window.electronAPI?.loadAttachment?.(nombre);
      if (b64) return desdeBase64(b64, mimeFavorita);
    }
    return null;
  }
  if (backend === 'nativo') {
    for (const nombre of nombres) {
      try {
        const r = await Filesystem.readFile({ path: nombre, directory: Directory.Data });
        return desdeBase64(r.data as string, mimeFavorita);
      } catch {
        // Siguiente extensione candidata.
      }
    }
    return null;
  }
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await abrirDb();
      const valor = await new Promise<{ blob: Blob; mime: string } | undefined>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(CLAVE_BINARIO(empresaId, sha));
        req.onsuccess = () => resolve(req.result as { blob: Blob; mime: string } | undefined);
        req.onerror = () => reject(req.error ?? new Error('No se pudo leer el anexo'));
      });
      db.close();
      return valor ? valor.blob : null;
    } catch {
      return null;
    }
  }
  return memoriaWeb.get(CLAVE_BINARIO(empresaId, sha))?.blob ?? null;
};

const borrarBinario = async (empresaId: string, sha: string): Promise<void> => {
  const backend = backendActivo();
  const nombres = Array.from(new Set([
    nombreBinario(empresaId, sha, 'image/webp'),
    nombreBinario(empresaId, sha, 'image/jpeg'),
    nombreBinario(empresaId, sha, 'image/png')
  ]));
  if (backend === 'electron') {
    for (const nombre of nombres) {
      try { await window.electronAPI?.deleteAttachment?.(nombre); } catch {
        // Sin binario bajo esa extension: nada que borrar.
      }
    }
    return;
  }
  if (backend === 'nativo') {
    for (const nombre of nombres) {
      try {
        await Filesystem.deleteFile({ path: nombre, directory: Directory.Data });
      } catch {
        // Sin binario bajo esa extension: nada que borrar.
      }
    }
    return;
  }
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await abrirDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(CLAVE_BINARIO(empresaId, sha));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('No se pudo borrar el anexo'));
      });
      db.close();
    } catch {
      // Igual que arriba: la meta manda; el binario se da por borrado.
    }
    return;
  }
  memoriaWeb.delete(CLAVE_BINARIO(empresaId, sha));
};

/* ==================== registro de metadatos ==================== */

const cargarRegistro = async (empresaId: string): Promise<ChequeAnexo[]> => {
  const datos = await loadFromStorage(clavePorEmpresa(REGISTRO_KEY, empresaId));
  return Array.isArray(datos) ? datos : [];
};

const guardarRegistro = async (empresaId: string, lista: ChequeAnexo[]): Promise<void> => {
  await saveToStorage(clavePorEmpresa(REGISTRO_KEY, empresaId), lista);
};

/** ¿Alguna póliza de la lista referencia este sha? (metadatos, CH-6). */
const referenciado = (sha: string, polizas: Poliza[]): boolean =>
  polizas.some(p => Array.isArray(p.cheque?.anexos) && p.cheque.anexos.some(a => a.sha256 === sha));

export interface AnexoGuardado {
  metadato: ChequeAnexo;
  /** true = el binario ya estaba en el cliente: dedupe CH-10 reutilizó el archivo. */
  yaExistia: boolean;
}

/**
 * Procesa + guarda el anexo de una póliza de cheque: escalera congelada →
 * sha256 → dedupe → binario local + metadato en el registro del cliente.
 * El metadato devuelto es el que entra a `Poliza.cheque.anexos[]` (CH-16).
 */
export const guardarAnexo = async (empresaId: string, binario: Blob): Promise<AnexoGuardado | null> => {
  if (!empresaId) return null;
  const resultado = await comprimirAnexoCheque(binario);
  const sha = await sha256Hex(await resultado.blob.arrayBuffer());
  const registro = await cargarRegistro(empresaId);
  const previo = registro.find(a => a.sha256 === sha);
  if (previo) return { metadato: previo, yaExistia: true };

  const metadato: ChequeAnexo = {
    id: sha,
    sha256: sha,
    bytes: resultado.bytes,
    mime: resultado.mime,
    capturadoEn: new Date().toISOString()
  };
  await guardarBinario(empresaId, sha, resultado);
  await guardarRegistro(empresaId, [...registro, metadato]);
  return { metadato, yaExistia: false };
};

/** Devuelve el binario local del anexo o null si este equipo no lo tiene (CH-11). */
export const cargarAnexo = async (empresaId: string, sha: string): Promise<Blob | null> => {
  if (!empresaId || !sha) return null;
  const meta = (await cargarRegistro(empresaId)).find(a => a.sha256 === sha);
  return await cargarBinario(empresaId, sha, meta?.mime ?? 'image/webp');
};

const borrarDelRegistro = async (empresaId: string, sha: string): Promise<void> => {
  const registro = await cargarRegistro(empresaId);
  const filtro = registro.filter(a => a.sha256 !== sha);
  if (filtro.length !== registro.length) await guardarRegistro(empresaId, filtro);
};

/** Borra binario + entrada del registro. La póliza deja de referenciarlo por su lado. */
export const borrarAnexo = async (empresaId: string, sha: string): Promise<void> => {
  if (!empresaId || !sha) return;
  await borrarBinario(empresaId, sha);
  await borrarDelRegistro(empresaId, sha);
};

/** Días transcurridos desde la captura del anexo (materia prima de CH-14). */
export const diasDesdeCaptura = (capturadoEn: string, ahora = Date.now()): number =>
  Math.floor((ahora - new Date(capturadoEn).getTime()) / 86_400_000);

/**
 * Anexos huérfanos del cliente (CH-14): presentes en el registro y en el
 * binario local, pero NO referenciados por NINGUNA póliza. Edad ≥ 4 días →
 * banner de rescate; ≥ 5 → purga (`borrarHuerfanosAntiguos`).
 */
export const listarHuerfanos = async (empresaId: string, polizas: Poliza[]): Promise<ChequeAnexo[]> => {
  if (!empresaId) return [];
  const registro = await cargarRegistro(empresaId);
  return registro.filter(a => !referenciado(a.sha256, polizas));
};

/**
 * Purga del día 5 (CH-14): elimina huérfanos con Edad ≥ 5 días (o el umbral
 * dado). Devuelve cuántos se borraron. El binario y la entrada del registro
 * salen juntos.
 */
export const borrarHuerfanosAntiguos = async (
  empresaId: string,
  polizas: Poliza[],
  diasMinimos = 5
): Promise<number> => {
  if (!empresaId) return 0;
  const huerfanos = await listarHuerfanos(empresaId, polizas);
  const aPurgar = huerfanos.filter(a => diasDesdeCaptura(a.capturadoEn) >= diasMinimos);
  for (const a of aPurgar) await borrarBinario(empresaId, a.sha256);
  if (aPurgar.length > 0) {
    const registro = await cargarRegistro(empresaId);
    const shas = new Set(aPurgar.map(a => a.sha256));
    await guardarRegistro(empresaId, registro.filter(a => !shas.has(a.sha256)));
  }
  return aPurgar.length;
};

/**
 * Borrado en CASCADA al eliminar una póliza (Fase 4): cada anexo SE borra
 * (binario + registro) solo si pierde la ÚLTIMA referencia — otra póliza
 * puede compartir el mismo archivo por dedupe (CH-10).
 */
export const borrarAnexosHuerfanosDePoliza = async (
  empresaId: string,
  polizaEliminada: Poliza,
  restantes: Poliza[]
): Promise<void> => {
  const anexos = polizaEliminada.cheque?.anexos ?? [];
  for (const a of anexos) {
    if (!referenciado(a.sha256, restantes)) await borrarAnexo(empresaId, a.sha256);
  }
};

/**
 * Rescate del banner CH-14 ("Guardar en mi dispositivo"): descarga el binario
 * — web/Electron: `a.download`; APK: Filesystem (Cache) + Share nativo.
 * Devuelve false si este equipo no tiene el binario o no pudo entregarlo.
 */
export const descargarAnexo = async (empresaId: string, anexo: ChequeAnexo): Promise<boolean> => {
  try {
    const meta = (await cargarRegistro(empresaId)).find(a => a.sha256 === anexo.sha256);
    const mime = meta?.mime ?? anexo.mime;
    const blob = await cargarBinario(empresaId, anexo.sha256, mime);
    if (!blob) return false;
    const nombre = `anexo_cheque_${anexo.sha256.slice(0, 12)}.${extensionDe(mime)}`;
    if (backendActivo() === 'nativo') {
      const escritura = await Filesystem.writeFile({
        path: nombre,
        data: await aBase64(blob),
        directory: Directory.Cache
      });
      await Share.share({
        title: 'Imagen del cheque',
        url: escritura.uri,
        dialogTitle: 'Guardar imagen del cheque'
      });
      return true;
    }
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
};
