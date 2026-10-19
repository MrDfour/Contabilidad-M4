/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JournalEntryForm } from './EntryForm';
import type { Account, JournalEntry } from '../../types';
import { INITIAL_ACCOUNTS } from '../../types';

const accounts: Account[] = [
  { id: 'a1', code: '1101', name: 'Caja', type: 'asset' },
  { id: 'a2', code: '3101', name: 'Capital Social', type: 'equity' }
];

const amount = (idx: number) =>
  screen.getByLabelText(`Monto de movimiento ${idx}`) as HTMLInputElement;

const submitButton = () => screen.getByRole('button', { name: /Registrar Asiento|Guardar Cambios/ });

/** Botones "papelera" de cada partida: type=button sin texto (solo ícono). */
const trashButtons = () =>
  screen.getAllByRole('button')
    .filter(b => (b as HTMLButtonElement).type === 'button' && !(b.textContent ?? '').trim());

describe('JournalEntryForm (partida doble en vivo — nivel de render)', () => {
  it('arranca deshabilitado con 0/0 (no registra asiento vacío) y alerta diferencia al descuadrarse', () => {
    render(
      <JournalEntryForm
        accounts={accounts}
        appMode="basic"
        onAdd={vi.fn()}
      />
    );

    expect(submitButton()).toBeDisabled();

    // Debe=1000, Haber=0 → descuadrado: diferencia visible y sigue bloqueado
    fireEvent.change(amount(1), { target: { value: '1000' } });
    expect(screen.getByText(/Diferencia:/)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('al cuadrarse habilita guardar y comitea movements con solo montos > 0', () => {
    const onAdd = vi.fn();
    render(
      <JournalEntryForm
        accounts={accounts}
        appMode="basic"
        onAdd={onAdd}
      />
    );

    fireEvent.change(amount(1), { target: { value: '1000' } });
    fireEvent.change(amount(2), { target: { value: '1,000' } });

    expect(submitButton()).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText('Ej: Pago de renta mensual...'), {
      target: { value: 'Apertura 2024' }
    });
    fireEvent.click(submitButton());

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Apertura 2024',
      movements: [
        { accountId: 'a1', type: 'debit', amount: 1000 },
        { accountId: 'a2', type: 'credit', amount: 1000 }
      ],
      // modo básico: la póliza viaja undefined (se respeta la original al editar)
      policyType: undefined
    }));
  });

  it('modo básico oculta los campos fiscales (Tipo de Póliza y CFDI)', () => {
    render(
      <JournalEntryForm
        accounts={accounts}
        appMode="basic"
        onAdd={vi.fn()}
      />
    );
    expect(screen.queryByText('Tipo de Póliza')).toBeNull();
    expect(screen.queryByText('UUID CFDI')).toBeNull();
  });

  it('modo fiscal muestra Tipo de Póliza y campos CFDI por movimiento', () => {
    render(
      <JournalEntryForm
        accounts={accounts}
        appMode="fiscal"
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByText('Tipo de Póliza')).toBeInTheDocument();
    expect(screen.getAllByText('UUID CFDI')).toHaveLength(2);
    expect(screen.getAllByText('RFC Tercero')).toHaveLength(2);
  });

  it('edición con initialData: precarga montos formateados y envía "Guardar Cambios"', () => {
    const initialData: JournalEntry = {
      id: 'e1',
      date: '2024-02-15',
      description: 'Renta Enero',
      policyType: 'ingreso',
      movements: [
        { accountId: 'a1', type: 'debit', amount: 500 },
        { accountId: 'a2', type: 'credit', amount: 500 }
      ]
    };
    render(
      <JournalEntryForm
        accounts={accounts}
        appMode="basic"
        initialData={initialData}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(submitButton()).toHaveTextContent('Guardar Cambios');
    expect(amount(1).value).toBe('500');
    expect(amount(2).value).toBe('500');
  });

  it('partidas: el mínimo de 2 mantiene la eliminación bloqueada; con lote de 3 se habilita', () => {
    render(
      <JournalEntryForm
        accounts={accounts}
        appMode="basic"
        onAdd={vi.fn()}
      />

    );
    // 2 movimientos iniciales: ambas papeleras disabled
    expect(trashButtons()).toHaveLength(2);
    expect(trashButtons().every(b => (b as HTMLButtonElement).disabled)).toBe(true);

    // Lote: default del input es 1 → agrega 1 partida adicional (3 en total)
    fireEvent.click(screen.getByText('Añadir partida(s)'));
    expect(trashButtons()).toHaveLength(3);
    expect(trashButtons().every(b => (b as HTMLButtonElement).disabled)).toBe(false);
  });

  it('usa el catálogo recibido por props (placeholder del picker con code - name)', () => {
    render(
      <JournalEntryForm
        accounts={[INITIAL_ACCOUNTS[0], INITIAL_ACCOUNTS[1]]}
        appMode="basic"
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText('1101 - Caja')).toBeInTheDocument();
  });

  it('cancelar: llama onCancel, nunca onAdd', async () => {
    const onAdd = vi.fn();
    const onCancel = vi.fn();
    render(
      <JournalEntryForm
        accounts={accounts}
        appMode="basic"
        onAdd={onAdd}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onAdd).not.toHaveBeenCalled());
  });
});
