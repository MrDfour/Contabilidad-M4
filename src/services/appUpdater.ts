/**
 * Envoltura tipada del plugin nativo AppUpdater (Android): descarga in-app del
 * APK con progreso real e instalacion via el instalador del sistema.
 * Inspirado en el actualizador de Mihon (NewUpdateScreenModel).
 *
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface ProgresoDescarga {
  /** 0-100 */
  porcentaje: number;
  bytesDescargados: number;
  bytesTotales: number;
}

interface AppUpdaterPlugin {
  descargarApk(options: { url: string }): Promise<void>;
  cancelarDescarga(): Promise<void>;
  instalarApk(): Promise<void>;
  puedeInstalar(): Promise<{ valor: boolean }>;
  solicitarPermisoInstalacion(): Promise<void>;
  addListener(
    evento: 'progreso',
    listener: (datos: ProgresoDescarga) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    evento: 'completado',
    listener: (datos: { ruta: string; bytes: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    evento: 'error',
    listener: (datos: { mensaje: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

/** Solo en APK Android; en escritorio/web el updater es otro mecanismo. */
export const esAndroidNativo =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/**
 * Descarga el APK escuchando el progreso; resuelve cuando termina y rechaza si
 * falla o se cancela. Deja el APK listo en la cache interna para instalarApk().
 */
export async function descargarApkConProgreso(
  url: string,
  alProgreso: (porcentaje: number) => void
): Promise<void> {
  const suscripciones: PluginListenerHandle[] = [];
  const subProgreso = await AppUpdater.addListener('progreso', (datos) =>
    alProgreso(datos.porcentaje)
  );
  suscripciones.push(subProgreso);
  const termino = new Promise<void>((resolve, reject) => {
    void AppUpdater.addListener('completado', () => resolve()).then((h) =>
      suscripciones.push(h)
    );
    void AppUpdater.addListener('error', (datos) => reject(new Error(datos.mensaje))).then((h) =>
      suscripciones.push(h)
    );
  });
  try {
    await AppUpdater.descargarApk({ url });
    await termino;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (/not implemented|unimplemented/i.test(mensaje)) {
      // El plugin nativo no está registrado en la APK instalada (u otra
      // plataforma): da el aviso explícito en vez de un fallo críptico.
      throw new Error(
        `El plugin nativo AppUpdater no está registrado en esta APK (${mensaje})`
      );
    }
    throw e;
  } finally {
    for (const sub of suscripciones) {
      await sub.remove();
    }
  }
}
