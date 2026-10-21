/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Temas de la interfaz (v0.9.9): oscuro (por defecto, el actual), claro y dos
 * variantes de ALTO CONTRASTE (sobre negro y sobre blanco) para accesibilidad
 * visual. Los colores viven SOLO en CSS (`src/temas.css`, remapeo de las
 * variables `--color-*` de Tailwind v4 bajo `html[data-theme]`) — ningún
 * componente cambia de clase al cambiar de tema.
 */

export type TemaApp = 'oscuro' | 'claro' | 'contrasteOscuro' | 'contrasteClaro';

/** Clave GLOBAL (no por cliente): preferencia de APARIENCIA del dispositivo. */
export const CLAVE_TEMA = 'contasis_tema';

export interface OpcionTema {
  id: TemaApp;
  etiqueta: string;
  detalle: string;
}

/** Menú de temas (AppHeader + MobileMenu usan esta única lista). */
export const TEMAS_APP: OpcionTema[] = [
  { id: 'oscuro', etiqueta: 'Oscuro', detalle: 'Tema actual de la app' },
  { id: 'claro', etiqueta: 'Claro', detalle: 'Superficies blancas para ambientes iluminados' },
  { id: 'contrasteOscuro', etiqueta: 'Contraste alto oscuro', detalle: 'Negro puro, texto blanco y acentos saturados' },
  { id: 'contrasteClaro', etiqueta: 'Contraste alto claro', detalle: 'Blanco puro, texto negro y contornos gruesos' }
];

/** Color de la barra del sistema Android/PWA (meta theme-color) por tema. */
export const COLOR_BARRA_TEMA: Record<TemaApp, string> = {
  oscuro: '#0a0f1d',
  claro: '#f1f5f9',
  contrasteOscuro: '#000000',
  contrasteClaro: '#ffffff'
};

const ES_TEMA = (v: unknown): v is TemaApp =>
  v === 'oscuro' || v === 'claro' || v === 'contrasteOscuro' || v === 'contrasteClaro';

/** Normaliza lo leído del storage (incluye valores corruptos/perdidos) al
 *  tema válido. Defecto SIEMPRE 'oscuro' (el tema histórico de la app). */
export const temaValido = (v: unknown): TemaApp => (ES_TEMA(v) ? v : 'oscuro');
