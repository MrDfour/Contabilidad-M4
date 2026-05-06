import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { QrCode, ScanLine, Wifi, WifiOff, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import {
  connectToSessionPeer,
  createSyncPayload,
  getRedisSyncData,
  getSessionIdFromPin,
  initializeHostPeer,
  setRedisSyncData,
  setPinMapping,
  type PeerController,
  type SyncPayload,
  type SyncState,
  type SyncTransport,
} from '../services/syncService';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDesktop: boolean;
  localState: SyncState;
  onApplyRemoteState: (state: SyncState) => void;
  onNotify: (type: 'success' | 'error', title: string, message: string) => void;
}

function parseSessionId(raw: string): string {
  const value = raw.trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    const fromParam = url.searchParams.get('sessionId');
    if (fromParam) return fromParam.trim();
  } catch {
    // no-op
  }

  return value;
}

export default function SyncModal({
  isOpen,
  onClose,
  isDesktop,
  localState,
  onApplyRemoteState,
  onNotify,
}: SyncModalProps) {
  const [sessionId, setSessionId] = useState('');
  const [pin, setPin] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [remotePayload, setRemotePayload] = useState<SyncPayload | null>(null);
  const [remoteTransport, setRemoteTransport] = useState<SyncTransport | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const peerControllerRef = useRef<PeerController | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const pollingAttemptsRef = useRef(0);
  const isPollingRequestInFlight = useRef(false);

  const cleanup = useCallback(() => {
    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (peerControllerRef.current) {
      peerControllerRef.current.close();
      peerControllerRef.current = null;
    }
    pollingAttemptsRef.current = 0;
    isPollingRequestInFlight.current = false;
  }, []);

  const pushLocalStateToPeer = useCallback((activeSessionId: string) => {
    if (!peerControllerRef.current) return;
    const payload = createSyncPayload(activeSessionId, isDesktop ? 'desktop' : 'mobile', 'peerjs', localState);
    peerControllerRef.current.send({ type: 'sync_payload', payload });
  }, [isDesktop, localState]);

  const handleIncomingPayload = useCallback((payload: SyncPayload, transport: SyncTransport) => {
    setRemotePayload(payload);
    setRemoteTransport(transport);
    setStatus(`Datos remotos recibidos por ${transport === 'peerjs' ? 'WebRTC' : 'Redis'}.`);
    setErrorMessage('');
    setIsBusy(false);
  }, []);

  const startDesktopFlow = useCallback(async (activeSessionId: string) => {
    try {
      peerControllerRef.current = initializeHostPeer(activeSessionId, {
        onReady: () => {
          setStatus('Sesión activa. Esperando conexión móvil...');
        },
        onOpen: () => {
          setStatus('Conexión WebRTC establecida. Intercambiando datos...');
          pushLocalStateToPeer(activeSessionId);
        },
        onData: (message) => {
          handleIncomingPayload(message.payload, 'peerjs');
        },
        onError: (error) => {
          setErrorMessage(error.message || 'Error de conexión WebRTC.');
        },
      });

      const desktopKey = `sync_desktop_${activeSessionId}`;
      const mobileKey = `sync_mobile_${activeSessionId}`;
      const payload = createSyncPayload(activeSessionId, 'desktop', 'redis', localState);
      await setRedisSyncData(desktopKey, payload);

      setStatus('Datos publicados en fallback Redis. Esperando respuesta móvil...');

      pollingAttemptsRef.current = 0;
      pollingIntervalRef.current = window.setInterval(async () => {
        if (isPollingRequestInFlight.current) return;
        if (pollingAttemptsRef.current >= 10) {
          if (pollingIntervalRef.current !== null) {
            window.clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setStatus('Fallback Redis finalizado (sin respuesta móvil).');
          return;
        }

        pollingAttemptsRef.current += 1;
        isPollingRequestInFlight.current = true;

        try {
          const mobilePayload = await getRedisSyncData(mobileKey);
          if (mobilePayload) {
            if (pollingIntervalRef.current !== null) {
              window.clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            handleIncomingPayload(mobilePayload, 'redis');
          }
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'Error consultando fallback Redis.');
        } finally {
          isPollingRequestInFlight.current = false;
        }
      }, 3000);
    } catch (error) {
      setIsBusy(false);
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo iniciar la sincronización.');
    }
  }, [handleIncomingPayload, localState, pushLocalStateToPeer]);

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setSessionId('');
      setPin('');
      setScanInput('');
      setStatus('');
      setRemotePayload(null);
      setRemoteTransport(null);
      setErrorMessage('');
      setIsBusy(false);
      return;
    }

    if (!isDesktop) {
      setStatus('Escanea el QR de escritorio para iniciar la sincronización.');
      return;
    }

    const generatedSessionId = crypto.randomUUID();
    const generatedPin = String(Math.floor(100000 + Math.random() * 900000));
    setSessionId(generatedSessionId);
    setPin(generatedPin);
    setRemotePayload(null);
    setRemoteTransport(null);
    setErrorMessage('');
    setIsBusy(true);
    setStatus('Inicializando sincronización...');

    setPinMapping(generatedPin, generatedSessionId).catch(() => {
      // PIN mapping is best-effort; proceed even if it fails
    });

    startDesktopFlow(generatedSessionId);

    return cleanup;
  }, [cleanup, isDesktop, isOpen, startDesktopFlow]);

  const handleScanQr = async () => {
    setErrorMessage('');

    try {
      if (Capacitor.getPlatform() === 'web') {
        throw new Error('Escáner nativo no disponible en web. Ingresa el Session ID manualmente.');
      }

      const permission = await BarcodeScanner.requestPermissions();
      if (permission.camera !== 'granted' && permission.camera !== 'limited') {
        throw new Error('Permiso de cámara denegado.');
      }

      const result = await BarcodeScanner.scan();
      const rawValue = result.barcodes?.[0]?.displayValue?.trim() ?? '';
      const parsedSession = parseSessionId(rawValue);
      if (!parsedSession) {
        throw new Error('No se detectó un Session ID válido en el QR.');
      }

      setScanInput(parsedSession);
      setStatus('Session ID detectado. Presiona “Conectar”.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo escanear el QR.');
    }
  };

  const handleConnectMobile = async () => {
    const rawInput = parseSessionId(scanInput);
    if (!rawInput) {
      setErrorMessage('Ingresa o escanea un código PIN o Session ID válido.');
      return;
    }

    let resolvedSessionId = rawInput;

    if (/^\d{6}$/.test(rawInput)) {
      setStatus('Resolviendo PIN...');
      try {
        const fromPin = await getSessionIdFromPin(rawInput);
        if (!fromPin) {
          setErrorMessage('PIN inválido o expirado. Solicita uno nuevo en el escritorio.');
          return;
        }
        resolvedSessionId = fromPin;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo resolver el PIN.');
        return;
      }
    }

    cleanup();
    setRemotePayload(null);
    setRemoteTransport(null);
    setSessionId(resolvedSessionId);
    setErrorMessage('');
    setIsBusy(true);
    setStatus('Conectando por WebRTC...');

    try {
      peerControllerRef.current = await connectToSessionPeer(
        resolvedSessionId,
        {
          onOpen: () => {
            setStatus('Conexión WebRTC establecida. Intercambiando datos...');
            pushLocalStateToPeer(resolvedSessionId);
          },
          onData: (message) => {
            handleIncomingPayload(message.payload, 'peerjs');
          },
          onError: (error) => {
            setErrorMessage(error.message || 'Error de conexión WebRTC.');
          },
        },
        5000,
      );
      setIsBusy(false);
    } catch {
      setStatus('WebRTC no disponible. Intentando fallback Redis...');

      try {
        const fallbackPayload = await getRedisSyncData(`sync_desktop_${resolvedSessionId}`);
        if (!fallbackPayload) {
          throw new Error('No se encontró información en fallback Redis para esta sesión.');
        }

        handleIncomingPayload(fallbackPayload, 'redis');
      } catch (error) {
        setIsBusy(false);
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo obtener datos desde Redis.');
      }
    }
  };

  const handleKeepLocal = async () => {
    if (!sessionId) return;

    setIsBusy(true);
    setStatus('Aplicando decisión: mantener datos locales...');

    try {
      if (remoteTransport === 'redis' && !isDesktop) {
        const payload = createSyncPayload(sessionId, 'mobile', 'redis', localState);
        await setRedisSyncData(`sync_mobile_${sessionId}`, payload);
      }

      pushLocalStateToPeer(sessionId);
      setRemotePayload(null);
      onNotify('success', 'Sincronización completada', 'Se conservaron los datos locales en este dispositivo.');
      setStatus('Sincronización completada.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo enviar la decisión.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleOverwriteWithRemote = () => {
    if (!remotePayload) return;

    try {
      onApplyRemoteState(remotePayload.state);
      setRemotePayload(null);
      onNotify('success', 'Datos actualizados', 'Se aplicaron correctamente los datos remotos.');
      setStatus('Datos remotos aplicados correctamente.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudieron aplicar los datos remotos.');
    }
  };

  const isConflictVisible = Boolean(remotePayload);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[145] flex items-center justify-center p-4 bg-[#0a0f1d]/85 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                  {isDesktop ? <QrCode className="w-5 h-5" /> : <ScanLine className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sincronización de datos</h3>
                  <p className="text-xs text-slate-400">
                    {isDesktop ? 'Modo Escritorio' : 'Modo Móvil'} • WebRTC + Redis fallback
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
              {isDesktop ? (
                <div className="space-y-4">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    {sessionId ? (
                      <div className="inline-flex flex-col items-center gap-3">
                        <div className="bg-white p-3 rounded-xl">
                          <QRCodeSVG value={sessionId} size={180} includeMargin />
                        </div>
                        <p className="text-xs text-slate-300 break-all">Session ID: {sessionId}</p>
                        <div className="w-full border-t border-white/10 pt-3">
                          <p className="text-xs text-slate-400 mb-1">Escanea el QR o ingresa este código de 6 dígitos en tu móvil:</p>
                          <p className="text-3xl font-bold tracking-[0.25em] text-indigo-300">{pin}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">Generando sesión...</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-400">Código PIN o Session ID</label>
                    <input
                      value={scanInput}
                      onChange={(e) => setScanInput(e.target.value)}
                      placeholder="Código de 6 dígitos o Session ID completo"
                      inputMode="numeric"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                    <p className="text-xs text-slate-500">Escanea el QR o ingresa el código de 6 dígitos que aparece en el escritorio.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={handleScanQr}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-colors text-sm font-medium"
                    >
                      <ScanLine className="w-4 h-4" /> Escanear QR
                    </button>
                    <button
                      onClick={handleConnectMobile}
                      disabled={isBusy}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors text-sm font-semibold disabled:opacity-60"
                    >
                      {isBusy ? <WifiOff className="w-4 h-4 animate-pulse" /> : <Wifi className="w-4 h-4" />} Conectar
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 min-h-[64px]">
                <p className="text-sm text-slate-200">{status || 'Esperando acción...'}</p>
                {isBusy && <p className="text-xs text-indigo-300 mt-1">Connecting...</p>}
                {errorMessage && <p className="text-xs text-rose-400 mt-1">{errorMessage}</p>}
              </div>

              {isConflictVisible && remotePayload && (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-indigo-200">Account data conflict detected. Which version do you want to keep across both devices?</h4>
                  <p className="text-xs text-slate-300">
                    Datos remotos desde: <span className="font-mono">{remoteTransport}</span> · origen: <span className="font-mono">{remotePayload.origin}</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={handleKeepLocal}
                      disabled={isBusy}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100 text-sm font-medium border border-white/10 disabled:opacity-60"
                    >
                      Keep Local Data
                    </button>
                    <button
                      onClick={handleOverwriteWithRemote}
                      disabled={isBusy}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
                    >
                      Overwrite with Remote Data
                    </button>
                  </div>
                  {isBusy && <p className="text-xs text-indigo-300">Waiting for decision...</p>}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
