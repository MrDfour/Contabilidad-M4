/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Setup global de la red de pruebas.
 * - Archivos *.test.* descubiertos por vitest.config.ts (src/**).
 * - jsdom como entorno DOM para render/RTL.
 */

// 3. Node 22+ trae su propio `localStorage` global nativo que puede **ocultar o
//    sustituir al de jsdom** (con `--localstorage-file` sin ruta, sus métodos no
//    funcionan). Rebindeamos: preferimos el storage de jsdom; de no existir,
//    proveemos un storage en memoria funcional para los tests.
function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    setItem: (k: string, v: string) => { data.set(String(k), String(v)); },
    getItem: (k: string) => (data.has(String(k)) ? (data.get(String(k)) as string) : null),
    removeItem: (k: string) => { data.delete(String(k)); },
    clear: () => { data.clear(); },
    key: (i: number) => (Array.from(data.keys())[i] ?? null),
    get length() { return data.size; }
  };
}

const globalAny = globalThis as any;
const jsdomStorage = (globalAny.window ?? globalAny)?.localStorage;
const workingStorage =
  (jsdomStorage && typeof jsdomStorage.clear === 'function')
    ? jsdomStorage
    : createMemoryStorage();

if (typeof globalAny.localStorage?.clear !== 'function') {
  try { globalAny.localStorage = workingStorage; } catch { /* no reasignable: se usa tal cual */ }
}

// 4. Limpieza de storage entre tests (ahora sí con storage funcional)
beforeEach(() => {
  globalAny.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// 2. jsdom no expone todo el DOM del navegador: puentes mínimos
// 2a. crypto.randomUUID (lo usan useJournals, useBackup y parseJournalImport)
const cryptoAny = globalThis.crypto as unknown as { randomUUID?: () => string };
if (!cryptoAny.randomUUID) {
  cryptoAny.randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
}

// 2b. URL.createObjectURL/revokeObjectURL (respaldo JSON, exportaciones)
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => `blob:mock-${Math.random().toString(16).slice(2)}`;
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => undefined;
}
