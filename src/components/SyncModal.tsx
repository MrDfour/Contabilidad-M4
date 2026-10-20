/**
 * SyncModal.tsx — Modal de bóveda de sincronización (Fase 3 de PLAN_SYNC_KV.md).
 *
 * Sustituye al flujo efímero PIN/QR de sesión: ahora gestiona la BÓVEDA E2EE
 * (K-2/K-9). Escritorio: estado de la bóveda + QR/frase para alistar otros
 * dispositivos. Móvil: escaneo/pegado del payload o la frase de 6 palabras.
 * El motor de auto-sync (Fase 4) se conecta vía `onPublicar`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ClipboardCopy,
  Cloud,
  CloudOff,
  History,
  QrCode,
  ScanLine,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import {
  alistarDesdeFrase,
  alistarDesdeQr,
  construirPayloadQr,
  crearBoveda,
  desalistar,
  ETIQUETA_DESKTOP,
  ETIQUETA_MOVIL,
  esUrlRelayValida,
  obtenerCredenciales,
  obtenerRelayUrl,
  sufijoBoveda,
  verificarRelay,
  type CredencialesBoveda,
} from '../services/vaultService';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** TRUE en escritorio (crea/muestra bóveda); FALSE en móvil (alinea este dispositivo). */
  isDesktop: boolean;
  /** Publicación forzada del snapshot (motor de auto-sync, Fase 4/5). Opcional. */
  onPublicar?: () => Promise<boolean>;
  onNotify: (type: 'success' | 'error', title: string, message: string) => void;
}

interface EntradaHistorialVista {
  version: number;
  updatedAt: string;
  deviceLabel: string;
}

/** Lee la lista de versiones del relay (solo metadatos, K-8; nunca lanza). */
async function leerHistorial(credenciales: CredencialesBoveda, relayUrl: string) {
  if (!esUrlRelayValida(relayUrl)) return [];
  try {
    const respuesta = await fetch(`${relayUrl}/api/vault/${credenciales.vaultId}/history`);
    if (!respuesta.ok) return [];
    const cuerpo = (await respuesta.json()) as { entradas?: EntradaHistorialVista[] };
    return Array.isArray(cuerpo.entradas) ? cuerpo.entradas : [];
  } catch {
    return [];
  }
}

export default function SyncModal({
  isOpen,
  onClose,
  isDesktop,
  onPublicar,
  onNotify,
}: SyncModalProps) {
  const [credenciales, setCredenciales] = useState<CredencialesBoveda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [relayOk, setRelayOk] = useState<boolean | null>(null);
  const [qrPayload, setQrPayload] = useState('');
  const [historial, setHistorial] = useState<EntradaHistorialVista[] | null>(null);
  const [pegado, setPegado] = useState('');
  const [fraseEscrita, setFraseEscrita] = useState('');
  const [crearConfirmado, setCrearConfirmado] = useState(false);
  const [desalistarConfirmado, setDesalistarConfirmado] = useState(false);

  const etiqueta = isDesktop ? ETIQUETA_DESKTOP : ETIQUETA_MOVIL;
  const relayUrl = obtenerRelayUrl();

  const refrescar = useCallback(async () => {
    const leidas = await obtenerCredenciales();
    setCredenciales(leidas);
    if (leidas) {
      setQrPayload(construirPayloadQr(leidas, relayUrl) ?? '');
      const salud = await verificarRelay(relayUrl);
      setRelayOk(salud.ok);
    } else {
      setQrPayload('');
      setRelayOk(null);
    }
  }, [relayUrl]);

  // Carga inicial al abrir el modal (el relay se verifica una vez por apertura).
  useEffect(() => {
    if (!isOpen) {
      setCredenciales(null);
      setQrPayload('');
      setRelayOk(null);
      setHistorial(null);
      setPegado('');
      setFraseEscrita('');
      setCrearConfirmado(false);
      setDesalistarConfirmado(false);
      return;
    }
    refrescar();
    return () => undefined;
  }, [isOpen, refrescar]);

  const crear = async () => {
    setOcupado(true);
    try {
      const creada = await crearBoveda(etiqueta);
      onNotify('success', 'Bóveda creada', `Se generó la bóveda ${sufijoBoveda(creada.vaultId)}. Guarda la frase de 6 palabras en papel.`);
      await refrescar();
    } catch {
      onNotify('error', 'No se pudo crear', 'Inténtalo de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  const alistarConQrEscaneado = async () => {
    setOcupado(true);
    try {
      if (Capacitor.getPlatform() === 'web') {
        throw new Error('Escáner nativo no disponible en web. Pega el contenido del QR.');
      }
      const permiso = await BarcodeScanner.requestPermissions();
      if (permiso.camera !== 'granted' && permiso.camera !== 'limited') {
        throw new Error('Permiso de cámara denegado.');
      }
      const resultado = await BarcodeScanner.scan();
      const crudo = resultado.barcodes?.[0]?.displayValue?.trim() ?? '';
      const alistada = await alistarDesdeQr(crudo, etiqueta);
      if (!alistada) throw new Error('El QR no contiene una bóveda válida.');
      onNotify('success', 'Bóveda alineada', `Este dispositivo usará la bóveda ${sufijoBoveda(alistada.vaultId)}.`);
      await refrescar();
    } catch (error) {
      onNotify('error', 'No se pudo alinear', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  const alistarConPegado = async () => {
    setOcupado(true);
    try {
      let alistada = await alistarDesdeQr(pegado, etiqueta);
      if (!alistada) {
        // El pegado pudo ser la frase de 6 palabras (alternativa sin cámara).
        const desdeFrase = await alistarDesdeFrase(pegado, etiqueta);
        if (!desdeFrase.ok) {
          onNotify('error', 'No se pudo alinear', desdeFrase.detalle);
          return;
        }
        alistada = desdeFrase.credenciales ?? null;
      }
      if (!alistada) {
        onNotify('error', 'No se pudo alinear', 'El texto pegado no es un QR de bóveda ni una frase de 6 palabras.');
        return;
      }
      onNotify('success', 'Bóveda alineada', `Este dispositivo usará la bóveda ${sufijoBoveda(alistada.vaultId)}.`);
      await refrescar();
    } finally {
      setOcupado(false);
    }
  };

  const publicarAhora = async () => {
    if (!onPublicar) return;
    setOcupado(true);
    try {
      const ok = await onPublicar();
      if (ok) {
        onNotify('success', 'Estado publicado', 'El snapshot contable se publicó en la bóveda.');
      } else {
        onNotify('error', 'Publicación fallida', 'El relay no respondió. Revisa la conexión.');
      }
    } finally {
      setOcupado(false);
    }
  };

  const abrirHistorial = async () => {
    if (!credenciales) return;
    setOcupado(true);
    try {
      const entradas = await leerHistorial(credenciales, relayUrl);
      setHistorial(entradas);
      if (entradas.length === 0) {
        onNotify('error', 'Sin historial', 'No hay versiones previas accesibles en el relay.');
      }
    } finally {
      setOcupado(false);
    }
  };

  const borrarCredencialLocal = async () => {
    if (!desalistarConfirmado) {
      setDesalistarConfirmado(true);
      return;
    }
    setOcupado(true);
    try {
      await desalistar();
      onNotify('success', 'Dispositivo desalistado', 'La bóveda se conserva; este dispositivo salió de ella.');
      await refrescar();
    } finally {
      setDesalistarConfirmado(false);
      setOcupado(false);
    }
  };

  const copiarAlPortapapeles = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      onNotify('success', 'Copiado', 'El contenido quedó en el portapapeles.');
    } catch {
      onNotify('error', 'No se pudo copiar', 'Se muestra el texto para copiarlo a mano.');
    }
  };

  const esCreador = Boolean(credenciales?.frase);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[145] flex items-center justify-center p-4 bg-[#0a0f1d]/85 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Encabezado */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                  {isDesktop ? <QrCode className="w-5 h-5" /> : <ScanLine className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sincronización con bóveda</h3>
                  <p className="text-xs text-slate-400">
                    {isDesktop ? 'Modo Escritorio' : 'Modo Móvil'} • cifrado AES-GCM de extremo a extremo
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Estado del relay */}
              {relayOk !== null && (
                <div className="flex items-center gap-2 text-xs">
                  {relayOk ? (
                    <span className="flex items-center gap-1 text-emerald-300">
                      <CheckCircle2 className="w-4 h-4" /> Relay en línea
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-300">
                      <CloudOff className="w-4 h-4" /> Relay inaccesible (el sync local sigue funcionando)
                    </span>
                  )}
                </div>
              )}

              {/* --- Escritorio --- */}
              {isDesktop && (
                credenciales ? (
                  <div className="space-y-4">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-slate-200">
                          Bóveda <span className="font-mono text-indigo-300">{sufijoBoveda(credenciales.vaultId)}</span>
                        </p>
                        <Cloud className="w-4 h-4 text-slate-400" />
                      </div>
                      {qrPayload ? (
                        <div className="space-y-3">
                          <div className="flex justify-center">
                            <div className="bg-white p-3 rounded-xl">
                              <QRCodeSVG value={qrPayload} size={180} includeMargin />
                            </div>
                          </div>
                          <button
                            onClick={() => copiarAlPortapapeles(qrPayload)}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs border border-white/10"
                          >
                            <ClipboardCopy className="w-4 h-4" /> Copiar payload del QR (para pegar en el móvil)
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-300">
                          Configura VITE_RELAY_URL para compartir la bóveda por QR.
                        </p>
                      )}
                    </div>

                    {esCreador && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Frase de respaldo (papel)</p>
                        <p className="font-mono text-base text-slate-100 tracking-wide">{credenciales.frase}</p>
                        <p className="text-xs text-slate-500 mt-2">
                          Quien teclee estas 6 palabras en otro dispositivo llega a la misma bóveda.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {onPublicar && (
                        <button
                          onClick={publicarAhora}
                          disabled={ocupado}
                          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
                        >
                          <Upload className="w-4 h-4" /> Publicar ahora
                        </button>
                      )}
                      <button
                        onClick={abrirHistorial}
                        disabled={ocupado}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-sm font-medium disabled:opacity-60"
                      >
                        <History className="w-4 h-4" /> Historial
                      </button>
                      <button
                        onClick={borrarCredencialLocal}
                        disabled={ocupado}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-60 transition-colors ${
                          desalistarConfirmado
                            ? 'bg-rose-600/30 border-rose-500/50 text-rose-200 hover:bg-rose-600/50'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        {desalistarConfirmado ? '¿Confirmar salida?' : 'Desalistar'}
                      </button>
                    </div>

                    {historial !== null && (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Versiones previas (solo metadatos)</p>
                        {historial.length === 0 ? (
                          <p className="text-sm text-slate-400">No hay versiones previas en el relay.</p>
                        ) : (
                          <ul className="space-y-1 text-xs text-slate-300">
                            {historial.map((entrada, indice) => (
                              <li key={indice} className="flex justify-between gap-2">
                                <span className="font-mono">v{entrada.version}</span>
                                <span>{entrada.deviceLabel}</span>
                                <span className="text-slate-500">{new Date(entrada.updatedAt).toLocaleString()}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-300">
                      Este dispositivo no pertenece a ninguna bóveda. Crea una para comenzar,
                      o alínea con la frase de una bóveda existente.
                    </p>
                    {crearConfirmado ? (
                      <button
                        onClick={crear}
                        disabled={ocupado}
                        className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
                      >
                        {ocupado ? 'Creando...' : 'Sí, crear bóveda nueva'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setCrearConfirmado(true)}
                        className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                      >
                        Crear bóveda nueva
                      </button>
                    )}
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider font-bold text-slate-400">
                        O alinear con la frase de una bóveda existente
                      </label>
                      <input
                        value={fraseEscrita}
                        onChange={(e) => setFraseEscrita(e.target.value)}
                        placeholder="arbol-faro-sol-luz-mar-nube (6 palabras)"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono text-sm"
                      />
                      <button
                        onClick={async () => {
                          setOcupado(true);
                          try {
                            const resultado = await alistarDesdeFrase(fraseEscrita, etiqueta);
                            if (!resultado.ok) {
                              onNotify('error', 'No se pudo alinear', resultado.detalle);
                              return;
                            }
                            onNotify('success', 'Bóveda alineada', `Este dispositivo usará la bóveda ${resultado.credenciales ? sufijoBoveda(resultado.credenciales.vaultId) : ''}.`);
                            await refrescar();
                          } finally {
                            setOcupado(false);
                          }
                        }}
                        disabled={ocupado || !fraseEscrita.trim()}
                        className="w-full px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-sm font-medium disabled:opacity-60"
                      >
                        Alinear con frase
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* --- Móvil --- */}
              {!isDesktop && (
                <div className="space-y-3">
                  {credenciales ? (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center space-y-2">
                      <p className="text-sm font-semibold text-slate-200">
                        Alineado con la bóveda <span className="font-mono text-indigo-300">{sufijoBoveda(credenciales.vaultId)}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        Etiqueta: {credenciales.deviceLabel} • El sync automático opera en segundo plano.
                      </p>
                      <button
                        onClick={borrarCredencialLocal}
                        disabled={ocupado}
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-60 ${
                          desalistarConfirmado ? 'bg-rose-600/30 border-rose-500/50 text-rose-200' : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        {desalistarConfirmado ? '¿Confirmar salida?' : 'Desalistar este dispositivo'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={alistarConQrEscaneado}
                          disabled={ocupado}
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-colors text-sm font-medium disabled:opacity-60"
                        >
                          <ScanLine className="w-4 h-4" /> Escanear QR de la bóveda
                        </button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs uppercase tracking-wider font-bold text-slate-400">
                          Pegar contenido del QR o la frase de 6 palabras
                        </label>
                        <textarea
                          value={pegado}
                          onChange={(e) => setPegado(e.target.value)}
                          rows={3}
                          placeholder='{"v":1,"url":...} · o · arbol-faro-sol-luz-mar-nube'
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-xs font-mono"
                        />
                        <button
                          onClick={alistarConPegado}
                          disabled={ocupado || !pegado.trim()}
                          className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
                        >
                          {ocupado ? 'Alineando...' : 'Alinear'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {cargando && <p className="text-xs text-slate-500">Abriendo bóveda...</p>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
