/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests del rol dual de la PWA web en SyncModal (v0.9.9): el estado inicial
 * lo sugiere el UA (`sugerirRolWeb`) y el toggle manda después. Los nativos
 * (Electron escritorio, APK Android) mantienen su rol FIJO sin toggle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { sugerirRolWeb } from './SyncModal';

const mocks = vi.hoisted(() => ({ plataforma: 'web' }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mocks.plataforma }
}));
// El módulo real no debe tocarse (permisos/cámara): stub vacío.
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({ BarcodeScanner: {} }));

import SyncModal from './SyncModal';

const fijarUA = (ua: string): void => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true
  });
};

describe('sugerirRolWeb (solo estado inicial — el toggle manda)', () => {
  it('móviles/tabletas → movil; PC/navegadores de escritorio → escritorio', () => {
    expect(sugerirRolWeb('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit')).toBe('movil');
    expect(sugerirRolWeb('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('movil');
    expect(sugerirRolWeb('Mozilla/5.0 (iPad; CPU OS 16_0)')).toBe('movil');
    expect(sugerirRolWeb('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126')).toBe('escritorio');
    expect(sugerirRolWeb('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/17')).toBe('escritorio');
    expect(sugerirRolWeb('')).toBe('escritorio'); // jsdom/WebView sin UA → escritorio
  });
});

describe('SyncModal (rol dual de la PWA web, v0.9.9)', () => {
  beforeEach(() => {
    localStorage.clear(); // sin credenciales reales: los flujos muestran alta/alineación
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderWeb = (ua: string) => {
    mocks.plataforma = 'web';
    fijarUA(ua);
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      isDesktop: false,
      onNotify: vi.fn()
    };
    render(<SyncModal {...props} />);
    return props;
  };

  it('web en PC: abre en Escritorio (UA) y el toggle permite pasar a Móvil', () => {
    renderWeb('Mozilla/5.0 (Windows NT 10.0) Chrome/126');

    expect(screen.getByText('Este dispositivo actúa como')).toBeTruthy(); // SOLO web
    expect(screen.getByText(/Modo Escritorio/)).toBeTruthy();
    expect(screen.getByText('Crear bóveda nueva')).toBeTruthy();         // ramo Escritorio

    fireEvent.click(screen.getByText('Móvil — escanea o pega'));
    expect(screen.getByText(/Modo Móvil/)).toBeTruthy();
    expect(screen.getByText(/Pegar contenido del QR o la frase/)).toBeTruthy();
    expect(screen.queryByText('Escanear QR de la bóveda')).toBeNull();   // web no escanea
    expect(screen.queryByText('Crear bóveda nueva')).toBeNull();
  });

  it('web en celular: abre en Móvil (UA) y el toggle permite volver a Escritorio', () => {
    renderWeb('Mozilla/5.0 (Linux; Android 14) AppleWebKit');

    expect(screen.getByText('Este dispositivo actúa como')).toBeTruthy();
    expect(screen.getByText(/Modo Móvil/)).toBeTruthy();
    expect(screen.queryByText('Crear bóveda nueva')).toBeNull();

    fireEvent.click(screen.getByText('Escritorio — genera el QR'));
    expect(screen.getByText(/Modo Escritorio/)).toBeTruthy();
    expect(screen.getByText('Crear bóveda nueva')).toBeTruthy();
  });

  it('escritorio NATIVO (Electron): rol fijo, SIN toggle y flujo Escritorio completo', () => {
    mocks.plataforma = 'web'; // en Electron, Capacitor reporta 'web' — isDesktop=true lo manda
    const props = { isOpen: true, onClose: vi.fn(), isDesktop: true, onNotify: vi.fn() };
    render(<SyncModal {...props} />);

    expect(screen.queryByText('Este dispositivo actúa como')).toBeNull(); // sin toggle
    expect(screen.getByText(/Modo Escritorio/)).toBeTruthy();
    expect(screen.getByText('Crear bóveda nueva')).toBeTruthy();
  });

  it('móvil NATIVO (APK): rol fijo SIN toggle, MODO Móvil y botón de escaneo nativo', () => {
    mocks.plataforma = 'android';
    fijarUA('Mozilla/5.0 (Linux; Android 14) AppleWebKit');
    const props = { isOpen: true, onClose: vi.fn(), isDesktop: false, onNotify: vi.fn() };
    render(<SyncModal {...props} />);

    expect(screen.queryByText('Este dispositivo actúa como')).toBeNull(); // sin toggle
    expect(screen.getByText(/Modo Móvil/)).toBeTruthy();
    expect(screen.getByText('Escanear QR de la bóveda')).toBeTruthy();    // nativo SÍ escanea
  });
});
