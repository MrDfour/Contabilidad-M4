/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppHeader } from './AppHeader';
import type { AppMode } from '../../lib/navigation';
import type { TemaApp } from '../../lib/temas';

const propsBase = (appMode: AppMode) => ({
  appMode,
  onSetAppMode: vi.fn(),
  onOpenSync: vi.fn(),
  onOpenMobileMenu: vi.fn(),
  isMobile: false,
  activeMobileTabLabel: 'Pólizas',
  empresaActivaNombre: null as string | null,
  onOpenEmpresas: vi.fn(),
  indicadorBoveda: 'sin' as const,
  tema: 'oscuro' as TemaApp,
  onSetTema: vi.fn(),
  onOpenTour: vi.fn()
});

describe('AppHeader — reemplazo del botón duplicado por el Tour (PLAN_TOUR.md §2)', () => {
  it('el botón duplicado “Modo Básico/Fiscal” desaparece y aparece el botón Tour', () => {
    render(<AppHeader {...propsBase('basic')} />);
    // Botón Tour (reemplaza al duplicado).
    expect(screen.getByRole('button', { name: 'Iniciar recorrido por la aplicación' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar recorrido por la aplicación' }).textContent).toContain('Tour');
    // El toggle duplicado de la derecha NO existe.
    expect(screen.queryByText('Modo Básico')).toBeNull();
    expect(screen.queryByText('Modo Fiscal')).toBeNull();
  });

  it('el segmented toggle real (Básico/Fiscal) sigue funcionando', () => {
    const onSetAppMode = vi.fn();
    render(<AppHeader {...propsBase('basic')} onSetAppMode={onSetAppMode} />);
    expect(screen.getByText('Básico')).toBeTruthy();
    expect(screen.getByText('Fiscal')).toBeTruthy();
    // Click en "Fiscal" → cambia el modo.
    fireEvent.click(screen.getByText('Fiscal'));
    expect(onSetAppMode).toHaveBeenCalledWith('fiscal');
  });

  it('el botón Tour dispara onOpenTour al click', () => {
    const onOpenTour = vi.fn();
    render(<AppHeader {...propsBase('basic')} onOpenTour={onOpenTour} />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar recorrido por la aplicación' }));
    expect(onOpenTour).toHaveBeenCalledTimes(1);
  });
});
