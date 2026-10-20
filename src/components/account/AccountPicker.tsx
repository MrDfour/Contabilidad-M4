/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Account } from '../../types';
import { cn } from '../../lib/utils';
import { normalizeString } from '../../lib/format';

/**
 * Selector de cuenta con búsqueda (checkbox de nombre normalizado y código).
 * Antes vivía en JournalView.tsx (Fase 4); también lo consume FixedAssetsView.
 */
export function SearchableAccountSelect({
  accounts,
  value,
  onChange,
  className
}: {
  accounts: Account[],
  value: string,
  onChange: (accountId: string) => void,
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selectedAccount = accounts.find(a => a.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAccounts = useMemo(() => {
    const term = normalizeString(searchTerm);
    if (!term) return accounts;
    return accounts.filter(acc =>
      normalizeString(acc.name).includes(term) ||
      acc.code.includes(term)
    );
  }, [accounts, searchTerm]);

  return (
    <div className={cn("relative", className)} ref={wrapperRef}>
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 group hover:border-white/20 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Search className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
        <input
          type="text"
          className="flex-1 bg-transparent outline-none text-white placeholder-slate-500 min-w-0"
          placeholder={selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : "Buscar cuenta..."}
          value={isOpen ? searchTerm : (selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : '')}
          onChange={(e) => {
            e.stopPropagation();
            setSearchTerm(e.target.value);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm('');
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-500 transition-transform", isOpen && "rotate-180")} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-1 scrollbar-hide"
          >
            {filteredAccounts.length > 0 ? (
              filteredAccounts.map(acc => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    onChange(acc.id);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors",
                    acc.id === value ? "bg-indigo-600/20 text-indigo-300" : "hover:bg-white/5 text-slate-300"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{acc.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{acc.code} • {acc.type.toUpperCase()}</span>
                  </div>
                  {acc.id === value && <Check className="w-3.5 h-3.5" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-slate-500 text-xs italic">
                No se encontraron cuentas
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
