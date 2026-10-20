/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

/**
 * Configuración de la red de pruebas (Fase 5 del plan de modularización).
 * Espeja los `define`/alias de vite.config.ts para que los módulos de la app
 * (que asumen `__APP_VERSION__`) compile igual en el entorno de tests.
 */
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: {
    '__APP_VERSION__': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'worker/tests/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],

    /** Integración completa de la red: npm run lint && npm run test (criterio de salida). */
    passWithNoTests: false,
  },
});
