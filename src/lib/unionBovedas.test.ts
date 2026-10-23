/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests de la librería PURA de fusión de bóvedas (Fase A de
 * PLAN_FUSION_BOVEDA.md → reglas F-1 … F-6). Todos operan sobre snapshots v3
 * en memoria: nada de storage, red ni motores.
 */

import { describe, it, expect } from 'vitest';
import type { Account, FixedAsset, Poliza } from '../types';
import type { BackupSnapshotV3, EmpresaWorkspace } from '../hooks/useBackup';
import { analizarFusion, aplicarFusion } from './unionBovedas';

let nodo = 0;

/** Póliza de prueba con folio y estampados opcionales. */
const poliza = (args: {
  tipo: Poliza['tipo'];
  folio: number;
  concepto: string;
  fecha?: string;
  capturadoEn?: string;
  editadoEn?: string;
}): Poliza => {
  nodo += 1;
  const id = `p${nodo}`;
  return {
    id,
    folio: args.folio,
    tipo: args.tipo,
    fecha: args.fecha ?? '2026-10-15',
    concepto: args.concepto,
    partidas: [
      {
        id: `${id}-1`,
        accountId: 'anc-1',
        accountCode: '1101',
        accountName: 'Caja',
        debit: 100,
        credit: 0,
        concept: 'partida de prueba',
      },
      {
        id: `${id}-2`,
        accountId: 'lnn-1',
        accountCode: '4001',
        accountName: 'Ventas',
        debit: 0,
        credit: 100,
      },
    ],
    totalDebe: 100,
    totalHaber: 100,
    capturadoEn: args.capturadoEn,
    editadoEn: args.editadoEn,
  };
};

const empresa = (id: string, parciales: Partial<EmpresaWorkspace> = {}): EmpresaWorkspace => ({
  id,
  nombre: `Cliente ${id}`,
  polizas: [],
  accounts: [],
  fixedAssets: [],
  finalInventories: {},
  ...parciales,
});

/** Póliza del snapshot final por concepto (útil para inspecciones por test). */
const buscar = (snapshot: BackupSnapshotV3, empresaId: string, concepto: string): Poliza | null => {
  const ws = snapshot.empresas.find((e) => e.id === empresaId);
  return ws ? (ws.polizas.find((p) => p.concepto === concepto) ?? null) : null;
};

describe('analizarFusion — diagnóstico sin tocar nada', () => {
  it('clasifica entrantes directos, colisiones de folio y duplicados sospechosos', () => {
    nodo = 0;
    const local: BackupSnapshotV3 = {
      empresas: [
        empresa('e1', {
          polizas: [
            poliza({ tipo: 'ingreso', folio: 1, concepto: 'Venta A', capturadoEn: '2026-10-15T10:00:00.000Z' }),
            poliza({ tipo: 'ingreso', folio: 2, concepto: 'Venta B', capturadoEn: '2026-10-15T11:00:00.000Z' }),
          ],
        }),
      ],
      activaId: 'e1',
    };
    const remoto: BackupSnapshotV3 = {
      empresas: [
        empresa('e1', {
          polizas: [
            poliza({ tipo: 'ingreso', folio: 3, concepto: 'Gasto móvil', capturadoEn: '2026-10-15T12:00:00.000Z' }),
            poliza({ tipo: 'ingreso', folio: 2, concepto: 'Venta colisionada', capturadoEn: '2026-10-15T12:30:00.000Z' }),
            poliza({ tipo: 'ingreso', folio: 4, concepto: 'Venta B', capturadoEn: '2026-10-15T13:00:00.000Z' }),
          ],
        }),
      ],
      activaId: 'e1',
    };

    const analisis = analizarFusion(local, remoto);
    expect(analisis.entrantesDirectos).toHaveLength(1);
    expect(analisis.entrantesDirectos[0].poliza.concepto).toBe('Gasto móvil');
    expect(analisis.colisionesFolio).toHaveLength(1);
    expect(analisis.colisionesFolio[0].poliza.concepto).toBe('Venta colisionada');
    expect(analisis.colisionesFolio[0].contraLocalIds).toHaveLength(1);
    expect(analisis.duplicados).toHaveLength(1);
    expect(analisis.duplicados[0].poliza.concepto).toBe('Venta B');
    expect(analisis.empresasFaltantes).toHaveLength(0);
    // el análisis NO muta sus entradas.
    expect(local.empresas[0].polizas).toHaveLength(2);
    expect(remoto.empresas[0].polizas[0].folio).toBe(3);
  });

  it('reporta clientes del remoto ausentes en el local y sus pólizas no fusionables (F-4)', () => {
    nodo = 0;
    const local: BackupSnapshotV3 = {
      empresas: [empresa('e1', { polizas: [poliza({ tipo: 'diario', folio: 1, concepto: 'X' })] })],
      activaId: 'e1',
    };
    const remoto: BackupSnapshotV3 = {
      empresas: [
        empresa('e1', {}),
        empresa('e-movil', { nombre: 'Cliente móvil', polizas: [poliza({ tipo: 'egreso', folio: 1, concepto: 'Gasolina' })] }),
      ],
      activaId: 'e1',
    };
    const analisis = analizarFusion(local, remoto);
    expect(analisis.empresasFaltantes).toHaveLength(1);
    expect(analisis.empresasFaltantes[0]).toMatchObject({ id: 'e-movil', polizas: 1 });
  });

  it('detecta colisión mutua entre dos entrantes con el mismo tipo+folio', () => {
    nodo = 0;
    const local: BackupSnapshotV3 = {
      empresas: [empresa('e1', { polizas: [poliza({ tipo: 'egreso', folio: 1, concepto: 'Local' })] })],
      activaId: 'e1',
    };
    const remoto: BackupSnapshotV3 = {
      empresas: [
        empresa('e1', {
          polizas: [
            poliza({ tipo: 'egreso', folio: 1, concepto: 'Entrante 1' }),
            poliza({ tipo: 'egreso', folio: 1, concepto: 'Entrante 2' }),
          ],
        }),
      ],
      activaId: 'e1',
    };
    const analisis = analizarFusion(local, remoto);
    expect(analisis.colisionesFolio).toHaveLength(2);
    for (const c of analisis.colisionesFolio) {
      expect(c.contraLocalIds).toHaveLength(1);
      expect(c.contraEntrantesIds).toHaveLength(1);
    }
  });
});

describe('aplicarFusion — ediciones cruzadas (F-3)', () => {
  /** Local con UNA póliza sin editadoEn; ids frescos por test. */
  const construir = (): { local: BackupSnapshotV3; idOriginal: string } => {
    nodo = 0;
    const local: BackupSnapshotV3 = {
      empresas: [empresa('e1', { polizas: [poliza({ tipo: 'ingreso', folio: 1, concepto: 'Original', capturadoEn: '2026-10-15T10:00:00.000Z' })] })],
      activaId: 'e1',
    };
    return { local, idOriginal: local.empresas[0].polizas[0].id };
  };

  it('el mismo id editado en ambos gana el editadoEn más reciente (remoto)', () => {
    const { local, idOriginal } = construir();
    const remotaEditada: Poliza = {
      ...local.empresas[0].polizas[0],
      concepto: 'Editada en móvil',
      editadoEn: '2026-10-16T09:00:00.000Z',
    };
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [remotaEditada] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, {});
    expect(resumen.edicionesRemotoGanan).toBe(1);
    expect(buscar(snapshot, 'e1', 'Editada en móvil')).not.toBeNull();
    expect(buscar(snapshot, 'e1', 'Original')).toBeNull();
    // conservó el id (no se duplicó la póliza).
    expect(snapshot.empresas[0].polizas.filter((p) => p.id === idOriginal)).toHaveLength(1);
    expect(snapshot.empresas[0].polizas).toHaveLength(1);
  });

  it('sin estampado de edición en ambos lados gana la local (legado)', () => {
    const { local, idOriginal } = construir();
    const remotaVieja: Poliza = {
      ...local.empresas[0].polizas[0],
      concepto: 'Remota sin estampado',
      editadoEn: undefined,
      capturadoEn: undefined,
    };
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [remotaVieja] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, {});
    expect(resumen.edicionesLocalGanan).toBe(1);
    expect(resumen.edicionesRemotoGanan).toBe(0);
    expect(buscar(snapshot, 'e1', 'Original')).not.toBeNull();
    expect(buscar(snapshot, 'e1', 'Remota sin estampado')).toBeNull();
    expect(snapshot.empresas[0].polizas.every((p) => p.id === idOriginal)).toBe(true);
  });
});

describe('aplicarFusion — duplicados sospechosos (F-5)', () => {
  it('sin decisión el duplicado se excluye; con inclusión explícita se suma (a final)', () => {
    nodo = 0;
    const local: BackupSnapshotV3 = {
      empresas: [empresa('e1', { polizas: [poliza({ tipo: 'egreso', folio: 1, concepto: 'Gasolina' })] })],
      activaId: 'e1',
    };
    const remoto: BackupSnapshotV3 = {
      empresas: [empresa('e1', { polizas: [poliza({ tipo: 'egreso', folio: 1, concepto: 'Gasolina' })] })],
      activaId: 'e1',
    };
    const idRemota = remoto.empresas[0].polizas[0].id;

    const sinIncluir = aplicarFusion(local, remoto, {});
    expect(sinIncluir.snapshot.empresas[0].polizas).toHaveLength(1);
    expect(sinIncluir.resumen.excluidas).toBe(1);

    const incluido = aplicarFusion(local, remoto, {
      folios: { [idRemota]: 'final' },
      incluirDuplicados: [idRemota],
    });
    expect(incluido.snapshot.empresas[0].polizas).toHaveLength(2);
    expect(incluido.resumen.excluidas).toBe(0);
    expect(incluido.resumen.finales).toBe(1); // folio 1 tomado por la local: el entrante va a 2.
    expect(incluido.snapshot.empresas[0].polizas.find((p) => p.folio === 2)).not.toBeNull();
  });
});

describe('aplicarFusion — folios colisionados (F-2)', () => {
  /** Local con folios 1 (08:00) y 2 (10:00) de ingreso. */
  const construir = (): BackupSnapshotV3 => {
    nodo = 0;
    return {
      empresas: [
        empresa('e1', {
          polizas: [
            poliza({ tipo: 'ingreso', folio: 1, concepto: 'Local vieja', capturadoEn: '2026-10-15T08:00:00.000Z' }),
            poliza({ tipo: 'ingreso', folio: 2, concepto: 'Local media', capturadoEn: '2026-10-15T10:00:00.000Z' }),
          ],
        }),
      ],
      activaId: 'e1',
    };
  };

  it('(a) re-foliar por captura: el entrante más nuevo salta los folios tomados por locales', () => {
    const local = construir();
    const entrante = poliza({ tipo: 'ingreso', folio: 1, concepto: 'Choca con folio 1', capturadoEn: '2026-10-15T12:00:00.000Z' });
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [entrante] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, { folios: { [entrante.id]: 'refoliar' } });
    // Orden de captura del lote: local 08:00 → 1; entrante 12:00 → 3 (el 2 lo tiene 'Local media', intocable).
    expect(buscar(snapshot, 'e1', 'Local vieja')!.folio).toBe(1);
    expect(buscar(snapshot, 'e1', 'Choca con folio 1')!.folio).toBe(3);
    expect(buscar(snapshot, 'e1', 'Local media')!.folio).toBe(2);
    expect(resumen.reFoliadas).toBe(1);
    expect(resumen.localesReFoliadas).toBe(0);
    expect(resumen.sumadas).toBe(1);
  });

  it('(a) con la local MÁS nueva que el entrante: el entrante toma el folio en disputa y la local se re-folía', () => {
    const local = construir();
    const entranteViejo = poliza({ tipo: 'ingreso', folio: 1, concepto: 'Entrante viejo', capturadoEn: '2026-10-14T08:00:00.000Z' });
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [entranteViejo] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, { folios: { [entranteViejo.id]: 'refoliar' } });
    expect(buscar(snapshot, 'e1', 'Entrante viejo')!.folio).toBe(1);
    expect(buscar(snapshot, 'e1', 'Local vieja')!.folio).toBe(3);
    expect(resumen.localesReFoliadas).toBe(1);
    expect(resumen.reFoliadas).toBe(0);
  });

  it('(b) folio pendiente: el entrante queda con folio 0 y las locales intactas', () => {
    const local = construir();
    const entrante = poliza({ tipo: 'ingreso', folio: 2, concepto: 'Pendiente', capturadoEn: '2026-10-15T12:00:00.000Z' });
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [entrante] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, { folios: { [entrante.id]: 'pendiente' } });
    expect(buscar(snapshot, 'e1', 'Pendiente')!.folio).toBe(0);
    expect(resumen.pendientes).toBe(1);
    expect(buscar(snapshot, 'e1', 'Local media')!.folio).toBe(2);
    expect(buscar(snapshot, 'e1', 'Local vieja')!.folio).toBe(1);
  });

  it('(c) al final consecutivo: el entrante toma max(folio)+1 del tipo, la local no se toca', () => {
    const local = construir();
    const entrante = poliza({ tipo: 'ingreso', folio: 1, concepto: 'Al final', capturadoEn: '2026-10-15T12:00:00.000Z' });
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [entrante] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, { folios: { [entrante.id]: 'final' } });
    expect(buscar(snapshot, 'e1', 'Al final')!.folio).toBe(3);
    expect(buscar(snapshot, 'e1', 'Local vieja')!.folio).toBe(1);
    expect(resumen.finales).toBe(1);
    expect(resumen.localesReFoliadas).toBe(0);
  });

  it('colisión mutua: refoliar a ambos entrantes los ordena por captura alrededor de las locales', () => {
    const local = construir();
    const eB = poliza({ tipo: 'ingreso', folio: 1, concepto: 'Mutua B', capturadoEn: '2026-10-15T12:00:00.000Z' });
    const eA = poliza({ tipo: 'ingreso', folio: 1, concepto: 'Mutua A', capturadoEn: '2026-10-15T09:00:00.000Z' });
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [eB, eA] })], activaId: 'e1' };

    const { snapshot } = aplicarFusion(local, remoto, {
      folios: { [eB.id]: 'refoliar', [eA.id]: 'refoliar' },
    });
    expect(buscar(snapshot, 'e1', 'Local vieja')!.folio).toBe(1); // 08:00 → folio en disputa
    expect(buscar(snapshot, 'e1', 'Mutua A')!.folio).toBe(3); // 09:00 → 2 está tomado
    expect(buscar(snapshot, 'e1', 'Local media')!.folio).toBe(2); // intocable
    expect(buscar(snapshot, 'e1', 'Mutua B')!.folio).toBe(4); // 12:00
  });

  it('decisión faltante (defensa F-8): el entrante colisionante queda PENDIENTE, no estampado', () => {
    const local = construir();
    const entrante = poliza({ tipo: 'ingreso', folio: 1, concepto: 'Sin decisión', capturadoEn: '2026-10-15T12:00:00.000Z' });
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [entrante] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, {});
    expect(buscar(snapshot, 'e1', 'Sin decisión')!.folio).toBe(0);
    expect(resumen.pendientes).toBe(1);
  });
});

describe('pólizas de CHEQUE en la fusión (CH-1/CH-3/CH-4 de PLAN_CHEQUES.md)', () => {
  /** Local con una serie CHE propia: folios 1 y 2 de cheque. */
  const construirCheques = (): BackupSnapshotV3 => {
    nodo = 0;
    return {
      empresas: [
        empresa('e1', {
          polizas: [
            poliza({ tipo: 'cheque', folio: 1, concepto: 'CHE local 1', capturadoEn: '2026-10-15T08:00:00.000Z' }),
            poliza({ tipo: 'cheque', folio: 2, concepto: 'CHE local 2', capturadoEn: '2026-10-15T10:00:00.000Z' }),
          ],
        }),
      ],
      activaId: 'e1',
    };
  };

  it('entrante CHE sin colisión conserva su folio Y sus metadatos del cheque', () => {
    const local = construirCheques();
    // folio 3: fuera de la serie local (1 y 2) — sin colisión F-2.
    const entrante: Poliza = {
      ...poliza({ tipo: 'cheque', folio: 3, concepto: 'CHE del móvil', capturadoEn: '2026-10-15T12:00:00.000Z' }),
      cheque: { numero: '1042', banco: 'Banorte', beneficiario: 'Juan Pérez' },
    };
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [entrante] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, {});
    const resultado = buscar(snapshot, 'e1', 'CHE del móvil')!;
    expect(resumen.sumadas).toBe(1);
    expect(resultado.folio).toBe(3); // folio entrante intacto, serie CHE propia
    expect(resultado.cheque).toEqual({ numero: '1042', banco: 'Banorte', beneficiario: 'Juan Pérez' });
  });

  it('colisión de folio CHE sin decisión → pendiente (folio 0), local intacta', () => {
    const local = construirCheques();
    const entrante = poliza({ tipo: 'cheque', folio: 2, concepto: 'CHE choca', capturadoEn: '2026-10-15T12:00:00.000Z' });
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [entrante] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, {});
    expect(buscar(snapshot, 'e1', 'CHE choca')!.folio).toBe(0);
    expect(resumen.pendientes).toBe(1);
    expect(buscar(snapshot, 'e1', 'CHE local 1')!.folio).toBe(1);
    expect(buscar(snapshot, 'e1', 'CHE local 2')!.folio).toBe(2);
  });

  it('el metadato del cheque entra al contenido estable: el mismo id con distinto cheque es una EDICIÓN (F-3, gana editadoEn)', () => {
    nodo = 0;
    const localOriginal: Poliza = {
      ...poliza({ tipo: 'cheque', folio: 1, concepto: 'Pago renta', capturadoEn: '2026-10-15T08:00:00.000Z' }),
      cheque: { numero: '1000', banco: 'Banamex' },
    };
    const local: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [localOriginal] })], activaId: 'e1' };

    // El móvil corrigió SOLO el número bancario (concepto/partidas idénticos, como contenidoEstable manda).
    const remotaEditada: Poliza = {
      ...localOriginal,
      cheque: { numero: '1042', banco: 'Banamex', beneficiario: 'Casa de renta' },
      editadoEn: '2026-10-16T09:00:00.000Z',
    };
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [remotaEditada] })], activaId: 'e1' };

    const { snapshot, resumen } = aplicarFusion(local, remoto, {});
    expect(resumen.edicionesRemotoGanan).toBe(1);
    const resultado = snapshot.empresas[0].polizas[0];
    expect(snapshot.empresas[0].polizas).toHaveLength(1);
    expect(resultado.cheque).toEqual({ numero: '1042', banco: 'Banamex', beneficiario: 'Casa de renta' });
  });
});

describe('aplicarFusion — dominios no foliables y catálogos (F-1/F-4)', () => {
  const cuentaA = (id: string, code: string, nombre = `Cuenta ${code}`): Account => ({ id, code, name: nombre, type: 'asset' });
  const activoA = (id: string, name: string): FixedAsset => ({
    id,
    name,
    acquisitionDate: '2026-01-10',
    originalAmount: 10000,
    assetAccountId: 'anc-4',
    accumulatedDeprAccountId: 'anc-5',
    expenseAccountId: 'anc-6',
    fiscalRate: 0.3,
    isDisposed: false,
  });

  it('cuentas y activos se unen por id; id existente gana el local; inventarios y activaId quedan locales', () => {
    nodo = 0;
    const local: BackupSnapshotV3 = {
      empresas: [
        empresa('e1', {
          polizas: [],
          accounts: [{ ...cuentaA('c1', '1101'), name: 'Caja local corregida' }],
          fixedAssets: [activoA('f1', 'Equipo local')],
          finalInventories: { '1101': 5000 },
        }),
      ],
      activaId: 'e1',
    };
    const remoto: BackupSnapshotV3 = {
      empresas: [
        empresa('e1', {
          polizas: [poliza({ tipo: 'diario', folio: 1, concepto: 'Ajuste entrante', capturadoEn: '2026-10-15T12:00:00.000Z' })],
          accounts: [cuentaA('c1', '1101', 'Caja con otro nombre'), cuentaA('c9', '1201')],
          fixedAssets: [activoA('f9', 'Equipo móvil')],
          finalInventories: { '1101': 999999 },
        }),
      ],
      activaId: 'e-otra',
    };

    const { snapshot, resumen } = aplicarFusion(local, remoto, {});
    const ws = snapshot.empresas[0];
    expect(ws.accounts.find((c) => c.id === 'c1')!.name).toBe('Caja local corregida');
    expect(ws.accounts.some((c) => c.id === 'c9')).toBe(true);
    expect(ws.fixedAssets.some((f) => f.id === 'f9')).toBe(true);
    expect(resumen.cuentasAgregadas).toBe(1);
    expect(resumen.activosAgregados).toBe(1);
    expect(ws.finalInventories['1101']).toBe(5000); // gana quien dispara el merge
    expect(snapshot.activaId).toBe('e1'); // la activa NUNCA cambia por el merge
    expect(ws.polizas.some((p) => p.concepto === 'Ajuste entrante')).toBe(true);
  });

  it('empresa sin contraparte en el remoto queda intacta; la del remoto ausente en el local NO se agrega', () => {
    nodo = 0;
    const local: BackupSnapshotV3 = {
      empresas: [empresa('e1', { polizas: [poliza({ tipo: 'diario', folio: 1, concepto: 'Solo local' })] }), empresa('e2', {})],
      activaId: 'e1',
    };
    const remoto: BackupSnapshotV3 = {
      empresas: [empresa('e1', {}), empresa('e-movil', { polizas: [poliza({ tipo: 'egreso', folio: 1, concepto: 'Cliente nuevo' })] })],
      activaId: 'e-movil',
    };

    const { snapshot, resumen } = aplicarFusion(local, remoto, {});
    expect(snapshot.empresas).toHaveLength(2); // solo las del local
    expect(snapshot.empresas.some((e) => e.id === 'e-movil')).toBe(false);
    expect(snapshot.empresas.find((e) => e.id === 'e1')!.polizas.some((p) => p.concepto === 'Solo local')).toBe(true);
    expect(snapshot.activaId).toBe('e1');
    expect(resumen.sumadas).toBe(0);
  });
});

describe('aplicarFusion — escenario de uso del plan (PC día + móvil gasto)', () => {
  it('las entradas del móvil entran, el folio colisionado se decide y los duplicados no se clonan', () => {
    nodo = 0;
    const local: BackupSnapshotV3 = {
      empresas: [
        empresa('e1', {
          polizas: [
            poliza({ tipo: 'ingreso', folio: 1, concepto: 'Venta del día', capturadoEn: '2026-10-15T10:00:00.000Z' }),
            poliza({ tipo: 'egreso', folio: 1, concepto: 'Gasolina' }),
          ],
        }),
      ],
      activaId: 'e1',
    };
    const gasto = poliza({ tipo: 'egreso', folio: 1, concepto: 'Gasolina móvil', capturadoEn: '2026-10-16T13:00:00.000Z' });
    const gasolinaDuplicada = poliza({ tipo: 'egreso', folio: 1, concepto: 'Gasolina', capturadoEn: '2026-10-16T14:00:00.000Z' });
    const remoto: BackupSnapshotV3 = { empresas: [empresa('e1', { polizas: [gasto, gasolinaDuplicada] })], activaId: 'e1' };

    // Con la decisión de folio del gasto: la 'Gasolina' del móvil es DUPLICADA de
    // la local y se excluye por defecto; el gasto va 'final' (consecutivo del egreso).
    const resultado = aplicarFusion(local, remoto, { folios: { [gasto.id]: 'final' } });
    const polizas = resultado.snapshot.empresas[0].polizas;
    expect(polizas.filter((p) => p.concepto === 'Gasolina')).toHaveLength(1); // solo la LOCAL vive
    expect(buscar(resultado.snapshot, 'e1', 'Gasolina móvil')!.folio).toBe(2);
    expect(resultado.resumen.sumadas).toBe(1);
    expect(resultado.resumen.excluidas).toBe(1);
  });
});
