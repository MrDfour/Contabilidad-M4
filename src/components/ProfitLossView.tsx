import React, { useState } from 'react';
import { FileText, Download, TrendingDown, TrendingUp, RefreshCw } from 'lucide-react';
import type { Account, JournalEntry, Movement } from '../types';
import { cn, formatCurrency, exportToExcel, exportToPDF } from '../lib/utils';

const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export function ProfitLossView({ accountBalances, accounts, journalName, finalInventory, setFinalInventory, activeJournalId, onAdd, onSetModal }: { accountBalances: Record<string, number>, accounts: Account[], journalName: string, finalInventory: number, setFinalInventory: (v: number) => void, activeJournalId: string | null, onAdd: (e: Omit<JournalEntry, 'id'>) => void, onSetModal: (info: { type: 'success' | 'error', title: string, message: string } | null) => void }) {

  // Helper to get balance by code or name using absolute value
  const getBal = (name: string) => {
    const acc = accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    return acc ? normalizeAmount(Math.abs(accountBalances[acc.id] || 0)) : 0;
  };

  // 1. Ingresos
  const ventasTotales = getBal('Ventas');
  const devolucionesVentas = getBal('Devoluciones sobre Ventas');
  const rebajasVentas = getBal('Descuentos sobre Ventas'); 
  const ventasNetas = normalizeAmount(ventasTotales - devolucionesVentas - rebajasVentas);

  // 2. Costo de lo Vendido
  const inventarioInicial = getBal('Inventario Inicial');
  const compras = getBal('Compras');
  const gastosCompra = getBal('Gastos de Compra');
  const comprasTotales = normalizeAmount(compras + gastosCompra);
  
  const devolucionesCompras = getBal('Devoluciones sobre Compras');
  const rebajasCompras = getBal('Descuentos sobre Compras');
  const comprasNetas = normalizeAmount(comprasTotales - devolucionesCompras - rebajasCompras);
  
  const sumaMercancias = normalizeAmount(inventarioInicial + comprasNetas);
  const costoVendido = normalizeAmount(sumaMercancias - Math.abs(finalInventory));

  // 3. Resultados
  const utilidadBruta = normalizeAmount(ventasNetas - costoVendido);

  // Gastos Operativos (rest of expense accounts)
  const opExpenseAccounts = accounts.filter(a => 
    a.type === 'expense' && 
    !['Compras', 'Gastos de Compra', 'Devoluciones sobre Compras', 'Descuentos sobre Compras', 'Inventario Inicial', 'Inventario Final', 'Costo de Ventas'].includes(a.name) &&
    accountBalances[a.id]
  );
  const totalOpExpenses = normalizeAmount(opExpenseAccounts.reduce((sum, a) => sum + Math.abs(accountBalances[a.id] || 0), 0));
  const netIncome = normalizeAmount(utilidadBruta - totalOpExpenses);

  const [cierreDate, setCierreDate] = useState(new Date().toISOString().split('T')[0]);

  const handleExportPDF = async () => {
    await exportToPDF('profit-loss-canvas', `Estado_de_Resultados_${journalName}`, 'Estado de Resultados', journalName);
  };

  const handleExportExcel = async () => {
    const data = [
      { Concepto: 'ESTADO DE RESULTADOS', Monto: '' },
      { Concepto: 'Ventas Totales', Monto: ventasTotales },
      { Concepto: '(-) Devoluciones sobre Ventas', Monto: -devolucionesVentas },
      { Concepto: '(-) Rebajas sobre Ventas', Monto: -rebajasVentas },
      { Concepto: 'VENTAS NETAS', Monto: ventasNetas },
      { Concepto: '', Monto: '' },
      { Concepto: 'Inventario Inicial', Monto: inventarioInicial },
      { Concepto: 'Compras', Monto: compras },
      { Concepto: '(+) Gastos de Compra', Monto: gastosCompra },
      { Concepto: '(=) Compras Totales', Monto: comprasTotales },
      { Concepto: '(-) Devoluciones sobre Compras', Monto: -devolucionesCompras },
      { Concepto: '(-) Rebajas sobre Compras', Monto: -rebajasCompras },
      { Concepto: '(=) Compras Netas', Monto: comprasNetas },
      { Concepto: '(=) Suma de Mercancías', Monto: sumaMercancias },
      { Concepto: '(-) Inventario Final', Monto: -finalInventory },
      { Concepto: 'COSTO DE LO VENDIDO', Monto: costoVendido },
      { Concepto: '', Monto: '' },
      { Concepto: 'UTILIDAD BRUTA', Monto: utilidadBruta },
      { Concepto: '', Monto: '' },
      { Concepto: 'GASTOS OPERATIVOS', Monto: '' },
      ...opExpenseAccounts.map(a => ({ Concepto: a.name, Monto: -Math.abs(accountBalances[a.id]) })),
      { Concepto: 'UTILIDAD NETA', Monto: netIncome }
    ];
    await exportToExcel(data, `Estado_Resultados_${journalName}`, 'P&L');
  };

  const handleCierreEjercicio = () => {
    if (!activeJournalId) {
      onSetModal({
        type: 'error',
        title: 'Sin diario activo',
        message: 'Selecciona un libro diario antes de ejecutar el cierre de ejercicio.'
      });
      return;
    }

    // Collect all revenue accounts with a non-zero balance
    const revenueAccounts = accounts.filter(a => a.type === 'revenue' && (accountBalances[a.id] || 0) !== 0);
    // Collect all expense accounts with a non-zero balance
    const expenseAccounts = accounts.filter(a => a.type === 'expense' && (accountBalances[a.id] || 0) !== 0);

    if (revenueAccounts.length === 0 && expenseAccounts.length === 0) {
      onSetModal({
        type: 'error',
        title: 'Sin movimientos',
        message: 'No hay cuentas de resultados con saldo para cerrar.'
      });
      return;
    }

    // Sum of revenue balances (credit-normal, positive = credit)
    const totalRevenue = normalizeAmount(revenueAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0));
    // Sum of expense balances (debit-normal, positive = debit)
    const totalExpenses = normalizeAmount(expenseAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0));
    const net = normalizeAmount(totalRevenue - totalExpenses);

    const movements: Movement[] = [];

    // Debit each revenue account to zero it out
    for (const acc of revenueAccounts) {
      const bal = accountBalances[acc.id] || 0;
      if (bal > 0) {
        movements.push({ accountId: acc.id, type: 'debit', amount: normalizeAmount(bal) });
      } else if (bal < 0) {
        movements.push({ accountId: acc.id, type: 'credit', amount: normalizeAmount(Math.abs(bal)) });
      }
    }

    // Credit each expense account to zero it out
    for (const acc of expenseAccounts) {
      const bal = accountBalances[acc.id] || 0;
      if (bal > 0) {
        movements.push({ accountId: acc.id, type: 'credit', amount: normalizeAmount(bal) });
      } else if (bal < 0) {
        movements.push({ accountId: acc.id, type: 'debit', amount: normalizeAmount(Math.abs(bal)) });
      }
    }

    // Post net to Utilidad del Ejercicio (cc-3) or Pérdida del Ejercicio (cc-4)
    if (net > 0) {
      const utilidadAcc = accounts.find(a => a.id === 'cc-3') || accounts.find(a => a.name === 'Utilidad del Ejercicio');
      if (!utilidadAcc) {
        onSetModal({
          type: 'error',
          title: 'Cuenta no encontrada',
          message: 'No se encontró la cuenta "Utilidad del Ejercicio". Verifica el catálogo de cuentas.'
        });
        return;
      }
      movements.push({ accountId: utilidadAcc.id, type: 'credit', amount: net });
    } else if (net < 0) {
      const perdidaAcc = accounts.find(a => a.id === 'cc-4') || accounts.find(a => a.name === 'Pérdida del Ejercicio');
      if (!perdidaAcc) {
        onSetModal({
          type: 'error',
          title: 'Cuenta no encontrada',
          message: 'No se encontró la cuenta "Pérdida del Ejercicio". Verifica el catálogo de cuentas.'
        });
        return;
      }
      movements.push({ accountId: perdidaAcc.id, type: 'debit', amount: normalizeAmount(Math.abs(net)) });
    }

    onAdd({
      date: cierreDate,
      description: `Cierre de Ejercicio — ${journalName}`,
      movements,
      policyType: 'diario'
    });

    const resultLabel = net > 0 ? 'Utilidad del Ejercicio' : net < 0 ? 'Pérdida del Ejercicio' : 'resultado nulo';
    onSetModal({
      type: 'success',
      title: 'Cierre de Ejercicio registrado',
      message: `Se generó el asiento de cierre con ${movements.length} movimientos. ${net !== 0 ? `${resultLabel}: ${formatCurrency(Math.abs(net))}` : 'Las cuentas quedan en cero.'}`
    });
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">Estado de Resultados</h2>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs font-mono rounded border border-indigo-500/30 mt-1">{journalName}</span>
          </div>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Método Analítico - Desglose detallado.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 ml-1">Inventario Final</label>
            <input 
              type="number"
              aria-label="Inventario final"
              value={finalInventory || ''}
              onChange={(e) => setFinalInventory(normalizeAmount(Number(e.target.value)))}
              onWheel={(e) => e.currentTarget.blur()}
              onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
              placeholder="0.00"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-full sm:w-32 font-mono"
            />
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-slate-200"
            >
              <Download className="w-4 h-4" /> Excel
            </button>
            <button 
              onClick={handleExportPDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
            >
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
            <div className="flex flex-col">
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 ml-1">Fecha de Cierre</label>
              <input
                type="date"
                aria-label="Fecha de cierre de ejercicio"
                value={cierreDate}
                onChange={(e) => setCierreDate(e.target.value)}
                className="bg-white/5 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-mono"
              />
            </div>
            <button
              onClick={handleCierreEjercicio}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600/80 text-white rounded-lg hover:bg-amber-500 transition-all shadow-lg shadow-amber-500/20 text-sm font-medium border border-amber-500/30"
              title="Saldar todas las cuentas de resultados y registrar el asiento de cierre en el Libro Diario"
            >
              <RefreshCw className="w-4 h-4" /> Cierre de Ejercicio
            </button>
          </div>
        </div>
      </div>

      <div id="profit-loss-canvas" className="bg-white/5 border border-white/10 p-4 md:p-8 rounded-2xl shadow-2xl backdrop-blur-xl max-w-3xl mx-auto overflow-x-auto">
        <div className="text-center mb-8 pb-4 border-b border-white/10">
          <h3 className="text-xl font-bold uppercase tracking-widest text-indigo-300">Estado de Resultados</h3>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-mono tracking-tighter">Método Analítico</p>
        </div>

        <div className="space-y-6 text-sm">
          {/* 1. SECCION VENTAS */}
          <section className="space-y-2">
            <div className="flex justify-between font-bold border-b border-white/10 pb-1 text-slate-300 uppercase tracking-wider">
              <span>Ingresos por Ventas</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="pl-4 space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Ventas Totales</span>
                <span className="font-mono">{formatCurrency(ventasTotales)}</span>
              </div>
              <div className="flex justify-between text-rose-400/80 italic pl-4 text-xs">
                <span>(-) Devoluciones sobre Ventas</span>
                <span className="font-mono">({formatCurrency(devolucionesVentas)})</span>
              </div>
              <div className="flex justify-between text-rose-400/80 italic pl-4 text-xs">
                <span>(-) Rebajas sobre Ventas</span>
                <span className="font-mono">({formatCurrency(rebajasVentas)})</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-1 font-bold text-slate-200">
                <span>Ventas Netas</span>
                <span className="font-mono text-emerald-400">{formatCurrency(ventasNetas)}</span>
              </div>
            </div>
          </section>

          {/* 2. SECCION COSTO DE VENTAS */}
          <section className="space-y-2">
            <div className="flex justify-between font-bold border-b border-white/10 pb-1 text-slate-300 uppercase tracking-wider">
              <span>Costo de lo Vendido</span>
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
            <div className="pl-4 space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Inventario Inicial</span>
                <span className="font-mono">{formatCurrency(inventarioInicial)}</span>
              </div>
              <div className="flex justify-between text-slate-400 pl-4 text-xs">
                <span>Compras</span>
                <span className="font-mono">{formatCurrency(compras)}</span>
              </div>
              <div className="flex justify-between text-slate-400 pl-4 text-xs">
                <span>(+) Gastos de Compra</span>
                <span className="font-mono">{formatCurrency(gastosCompra)}</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-0.5 text-slate-300 pl-4 font-semibold text-xs">
                <span>(=) Compras Totales</span>
                <span className="font-mono">{formatCurrency(comprasTotales)}</span>
              </div>
              <div className="flex justify-between text-rose-400/80 italic pl-8 text-xs">
                <span>(-) Devoluciones sobre Compras</span>
                <span className="font-mono">({formatCurrency(devolucionesCompras)})</span>
              </div>
              <div className="flex justify-between text-rose-400/80 italic pl-8 text-xs">
                <span>(-) Rebajas sobre Compras</span>
                <span className="font-mono">({formatCurrency(rebajasCompras)})</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-0.5 text-slate-200 pl-4 font-bold text-xs">
                <span>(=) Compras Netas</span>
                <span className="font-mono">{formatCurrency(comprasNetas)}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1 text-slate-200 font-bold">
                <span>(=) Suma Total de Mercancías</span>
                <span className="font-mono ml-2 whitespace-nowrap">{formatCurrency(sumaMercancias)}</span>
              </div>
              <div className="flex justify-between text-emerald-400/80 italic pl-4 text-xs gap-2">
                <span className="break-words">(-) Inventario Final</span>
                <span className="font-mono whitespace-nowrap">({formatCurrency(finalInventory)})</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-1 font-bold text-slate-100 bg-white/5 px-2 rounded gap-2">
                <span className="break-words">Costo de lo Vendido</span>
                <span className="font-mono text-rose-400 whitespace-nowrap">{formatCurrency(costoVendido)}</span>
              </div>
            </div>
          </section>

          {/* 3. UTILIDAD BRUTA */}
          <div className={cn(
            "p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center border shadow-lg transition-colors gap-4",
            utilidadBruta >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"
          )}>
            <div className="flex flex-col">
              <span className="font-black uppercase tracking-widest text-white text-base md:text-lg break-words">Utilidad / Pérdida Bruta</span>
              <span className="text-[10px] text-slate-500 font-mono">Ventas Netas - Costo de lo Vendido</span>
            </div>
            <span className={cn("text-2xl md:text-3xl font-black font-mono tabular-nums", utilidadBruta >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {formatCurrency(utilidadBruta)}
            </span>
          </div>

          {/* 4. GASTOS OPERATIVOS */}
          <section className="space-y-2 opacity-80">
            <div className="flex justify-between font-bold border-b border-white/10 pb-1 text-slate-400 uppercase tracking-wider text-xs">
              <span>Gastos Operativos y Otros</span>
            </div>
            {opExpenseAccounts.length === 0 ? (
              <p className="text-[10px] text-slate-500 italic pl-4">No hay otros gastos registrados.</p>
            ) : (
              <div className="pl-4 space-y-1">
                {opExpenseAccounts.map(a => (
                  <div key={a.id} className="flex justify-between text-[11px] text-slate-400 font-mono gap-2">
                    <span className="break-words">{a.name}</span>
                    <span className="whitespace-nowrap">({formatCurrency(Math.abs(accountBalances[a.id] || 0))})</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-white/5 pt-1 font-bold text-slate-300 text-xs gap-2">
                  <span className="break-words">Total Gastos Operativos</span>
                  <span className="whitespace-nowrap">({formatCurrency(totalOpExpenses)})</span>
                </div>
              </div>
            )}
          </section>

          {/* 5. UTILIDAD NETA */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 border-t border-white/20 gap-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Utilidad / Pérdida Neta del Periodo</span>
            <span className={cn("text-lg font-bold font-mono", netIncome >= 0 ? "text-emerald-500/70" : "text-rose-500/70")}>
              {formatCurrency(netIncome)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 4. Balance Sheet View
