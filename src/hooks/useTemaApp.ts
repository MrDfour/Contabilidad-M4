/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hook del tema de la UI (v0.9.9). Carga la preferencia del DISPOSITIVO
 * (clave global contasis_tema) al montar, la aplica como `data-theme` en
 * <html> (los colores viven en src/temas.css) y actualiza la meta
 * theme-color de la barra Android/PWA.
 *
 * La persistencia SOLO ocurre cuando el usuario cambia el tema (flag
 * `tocado`): guardar en el montaje reescribiría la preferencia con el
 * defecto 'oscuro' antes de que la carga asíncrona la rescate.
 */

import { useEffect, useState } from 'react';
import { loadFromStorage, saveToStorage } from '../services/storageService';
import { CLAVE_TEMA, COLOR_BARRA_TEMA, temaValido, type TemaApp } from '../lib/temas';

export function useTemaApp() {
  const [tema, setTemaInterno] = useState<TemaApp>('oscuro');
  /** true SOLO tras una elección del usuario (es la señal de persistir). */
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void loadFromStorage(CLAVE_TEMA).then((v) => {
      if (vivo) setTemaInterno(temaValido(v));
    });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLOR_BARRA_TEMA[tema]);
  }, [tema]);

  useEffect(() => {
    if (!tocado) return;
    void saveToStorage(CLAVE_TEMA, tema).catch(console.error);
  }, [tocado, tema]);

  /** Elección del usuario: aplica Y persiste. */
  const setTema = (t: TemaApp): void => {
    setTocado(true);
    setTemaInterno(t);
  };

  return { tema, setTema };
}
