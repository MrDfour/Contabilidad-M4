import React from 'react';
import { Download, FileText, FileCode } from 'lucide-react';
import type { Account, JournalEntry } from '../types';
import { cn } from '../lib/utils';
import { generateCatalogoXML, generateBalanzaXML, generateDIOTTxt } from '../lib/satExport';

export function ContabilidadElectronicaView({
  accounts,
  entries,
  tAccountsData,
  onSetModal
}: {
  accounts: Account[];
  entries: JournalEntry[];
  tAccountsData: Record<string, { debits: { amount: number; ref: number }[]; credits: { amount: number; ref: number }[] }>;
  onSetModal: (info: { type: 'success' | 'error', title: string, message: string } | null) => void;
}) {
  const now = React.useMemo(() => new Date(), []);
  const currentYear = now.getFullYear().toString();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

  const [rfc, setRfc] = React.useState('');
  const [anio, setAnio] = React.useState(currentYear);
  const [mes, setMes] = React.useState(currentMonth);

  const meses = [
    { value: '01', label: '01 - Enero' },
    { value: '02', label: '02 - Febrero' },
    { value: '03', label: '03 - Marzo' },
    { value: '04', label: '04 - Abril' },
    { value: '05', label: '05 - Mayo' },
    { value: '06', label: '06 - Junio' },
    { value: '07', label: '07 - Julio' },
    { value: '08', label: '08 - Agosto' },
    { value: '09', label: '09 - Septiembre' },
    { value: '10', label: '10 - Octubre' },
    { value: '11', label: '11 - Noviembre' },
    { value: '12', label: '12 - Diciembre' },
  ];

  // Validates RFC format: 3-4 uppercase letters/& followed by 6 digits and 2-3 alphanumeric characters
  const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}$/;
  const isRfcValid = rfcRegex.test(rfc.trim());
  const isValid = isRfcValid && /^\d{4}$/.test(anio);

  const handleCatalogo = () => {
    if (!isValid) return;
    generateCatalogoXML(rfc.trim(), anio, mes, accounts);
  };

  const handleBalanza = () => {
    if (!isValid) return;
    generateBalanzaXML(rfc.trim(), anio, mes, accounts, tAccountsData);
  };

  const handleDIOT = () => {
    if (!isValid) return;
    try {
      generateDIOTTxt(rfc.trim(), anio, mes, entries, accounts);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Ocurrió un error al generar el archivo DIOT.';
      onSetModal({
        type: 'error',
        title: 'No se pudo generar la DIOT',
        message,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">Contabilidad Electrónica</h2>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs font-mono rounded border border-indigo-500/30 mt-1">Anexo 24 SAT</span>
          </div>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Genera y descarga los archivos fiscales del SAT en XML y TXT para el período seleccionado.</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-2xl shadow-2xl backdrop-blur-xl space-y-6 max-w-xl mx-auto">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">RFC del Contribuyente</label>
          <input
            type="text"
            value={rfc}
            onChange={e => setRfc(e.target.value.toUpperCase())}
            placeholder="Ej. XAXX010101000"
            maxLength={13}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono tracking-wider"
          />
          {rfc.length > 0 && !isRfcValid && (
            <p className="text-rose-400 text-xs">Formato de RFC inválido (Ej. XAXX010101000 o AAA010101AA1).</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">Año</label>
            <input
              type="text"
              value={anio}
              onChange={e => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="2024"
              maxLength={4}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">Mes</label>
            <select
              value={mes}
              onChange={e => setMes(e.target.value)}
              className="w-full bg-[#0a0f1d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {meses.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 space-y-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-3">Archivos SAT</p>
          <button
            onClick={handleCatalogo}
            disabled={!isValid}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all",
              isValid
                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                : "bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed"
            )}
          >
            <FileCode className="w-4 h-4" />
            Catálogo de Cuentas (CT)
          </button>
          <button
            onClick={handleBalanza}
            disabled={!isValid}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all",
              isValid
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                : "bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed"
            )}
          >
            <Download className="w-4 h-4" />
            Balanza de Comprobación (BN)
          </button>
          <button
            onClick={handleDIOT}
            disabled={!isValid}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all",
              isValid
                ? "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                : "bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed"
            )}
          >
            <FileText className="w-4 h-4" />
            Declaración DIOT (.txt)
          </button>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 leading-relaxed">
          <strong>Nota:</strong> El archivo CT contiene el catálogo de cuentas, BN la balanza del período y DIOT el TXT de carga batch para proveedores con IVA acreditable registrado. Los archivos se nombran como <span className="font-mono">[RFC][AÑO][MES]CT.xml</span>, <span className="font-mono">[RFC][AÑO][MES]BN.xml</span> y <span className="font-mono">[RFC][AÑO][MES]DIOT.txt</span>.
        </div>
      </div>
    </div>
  );
}
