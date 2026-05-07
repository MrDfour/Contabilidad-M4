import Peer, { DataConnection } from 'peerjs';
import type { Journal } from '../types';

export type SyncOrigin = 'desktop' | 'mobile';
export type SyncTransport = 'peerjs' | 'redis';

export interface SyncState {
  journals: Journal[];
  finalInventories: Record<string, number>;
}

export interface SyncPayload {
  sessionId: string;
  origin: SyncOrigin;
  transport: SyncTransport;
  sentAt: string;
  state: SyncState;
}

export interface SyncMessage {
  type: 'sync_payload';
  payload: SyncPayload;
}

interface ConnectionHandlers {
  onOpen?: (connection: DataConnection) => void;
  onData?: (message: SyncMessage, connection: DataConnection) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

interface PeerHandlers extends ConnectionHandlers {
  onReady?: () => void;
}

export interface PeerController {
  peer: Peer;
  send: (message: SyncMessage) => void;
  close: () => void;
}

const REDIS_SYNC_TTL_SECONDS = 120;

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function isSyncMessage(value: unknown): value is SyncMessage {
  if (typeof value !== 'object' || value === null) return false;
  const maybe = value as Partial<SyncMessage>;
  return maybe.type === 'sync_payload' && typeof maybe.payload === 'object' && maybe.payload !== null;
}

function bindConnection(connection: DataConnection, handlers: ConnectionHandlers): void {
  connection.on('open', () => {
    handlers.onOpen?.(connection);
  });

  connection.on('data', (message: unknown) => {
    if (isSyncMessage(message)) {
      handlers.onData?.(message, connection);
    }
  });

  connection.on('error', (error) => {
    handlers.onError?.(toError(error));
  });

  connection.on('close', () => {
    handlers.onClose?.();
  });
}

export function createSyncPayload(
  sessionId: string,
  origin: SyncOrigin,
  transport: SyncTransport,
  state: SyncState,
): SyncPayload {
  return {
    sessionId,
    origin,
    transport,
    sentAt: new Date().toISOString(),
    state,
  };
}

export function initializeHostPeer(sessionId: string, handlers: PeerHandlers): PeerController {
  const peer = new Peer(sessionId);
  const connections = new Set<DataConnection>();

  peer.on('open', () => {
    handlers.onReady?.();
  });

  peer.on('connection', (connection) => {
    connections.add(connection);
    bindConnection(connection, {
      ...handlers,
      onClose: () => {
        connections.delete(connection);
        handlers.onClose?.();
      },
    });
  });

  peer.on('error', (error) => {
    handlers.onError?.(toError(error));
  });

  const send = (message: SyncMessage) => {
    connections.forEach((connection) => {
      if (connection.open) {
        connection.send(message);
      }
    });
  };

  const close = () => {
    connections.forEach((connection) => connection.close());
    connections.clear();
    if (!peer.destroyed) {
      peer.destroy();
    }
  };

  return { peer, send, close };
}

export function connectToSessionPeer(
  sessionId: string,
  handlers: PeerHandlers,
  timeoutMs = 5000,
): Promise<PeerController> {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let connection: DataConnection | null = null;
    let settled = false;

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      if (connection && connection.open) {
        connection.close();
      }
      if (!peer.destroyed) {
        peer.destroy();
      }
      reject(new Error('PeerJS connection timeout'));
    }, timeoutMs);

    const cleanupTimeout = () => {
      window.clearTimeout(timeoutId);
    };

    peer.on('open', () => {
      if (settled) return;
      handlers.onReady?.();
      connection = peer.connect(sessionId, { reliable: true });
      bindConnection(connection, {
        ...handlers,
        onOpen: (conn) => {
          handlers.onOpen?.(conn);
          if (!settled) {
            settled = true;
            cleanupTimeout();
            resolve({
              peer,
              send: (message: SyncMessage) => {
                if (conn.open) {
                  conn.send(message);
                }
              },
              close: () => {
                conn.close();
                if (!peer.destroyed) {
                  peer.destroy();
                }
              },
            });
          }
        },
      });
    });

    peer.on('error', (error) => {
      handlers.onError?.(toError(error));
      if (settled) return;
      settled = true;
      cleanupTimeout();
      if (!peer.destroyed) {
        peer.destroy();
      }
      reject(toError(error));
    });
  });
}

function getRedisConfig() {
  const url = import.meta.env.VITE_UPSTASH_REDIS_REST_URL;
  const token = import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('Upstash Redis env vars are missing');
  }

  return { url, token };
}

async function parseRedisResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`Upstash request failed: ${response.status}`);
  }

  const data = (await response.json()) as { result?: unknown };
  return data.result;
}

export async function setRedisSyncData(key: string, value: SyncPayload): Promise<void> {
  const { url, token } = getRedisConfig();
  const endpoint = `${url}/set/${encodeURIComponent(key)}?EX=${REDIS_SYNC_TTL_SECONDS}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });

  await parseRedisResponse(response);
}

export async function getRedisSyncData(key: string): Promise<SyncPayload | null> {
  const { url, token } = getRedisConfig();
  const endpoint = `${url}/get/${encodeURIComponent(key)}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await parseRedisResponse(response);
  if (result === null || result === undefined) {
    return null;
  }

  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return parsed as SyncPayload;
}

const PIN_TTL_SECONDS = 300;
const PIN_MAX_FAILED_ATTEMPTS = 3;
const PIN_MAX_RESETS_BEFORE_TIMEOUT = 3;
const PIN_TIMEOUT_SECONDS = 300;
const PIN_RESET_SIGNAL_TTL_SECONDS = 300;
const PIN_RESET_TOTAL_TTL_SECONDS = 3600;
const ACTIVE_PIN_SESSION_KEY = 'sync_pin_active_session';
const PIN_BLOCKED_UNTIL_KEY = 'sync_pin_blocked_until';
const PIN_RESET_TOTAL_KEY = 'sync_pin_reset_total';

export interface PinSecurityStatus {
  regenerateRequested: boolean;
  blockedUntil: number | null;
}

function parseRedisNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function runRedisCommand(path: string): Promise<unknown> {
  const { url, token } = getRedisConfig();
  const response = await fetch(`${url}/${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return parseRedisResponse(response);
}

function getPinSessionKey(sessionId: string): string {
  return `sync_session_pin_${sessionId}`;
}

function getPinFailedAttemptsKey(sessionId: string): string {
  return `sync_pin_failed_attempts_${sessionId}`;
}

function getPinRegenerateSignalKey(sessionId: string): string {
  return `sync_pin_regenerate_${sessionId}`;
}

async function handleFailedPinAttempt(): Promise<void> {
  const activeSessionResult = await runRedisCommand(`get/${encodeURIComponent(ACTIVE_PIN_SESSION_KEY)}`);
  if (typeof activeSessionResult !== 'string' || !activeSessionResult) {
    return;
  }

  const sessionId = activeSessionResult;
  const failedAttemptsKey = getPinFailedAttemptsKey(sessionId);
  const failedAttemptsResult = await runRedisCommand(`incr/${encodeURIComponent(failedAttemptsKey)}`);
  await runRedisCommand(`expire/${encodeURIComponent(failedAttemptsKey)}/${PIN_TTL_SECONDS}`);

  const failedAttempts = parseRedisNumber(failedAttemptsResult);
  if (failedAttempts === null || failedAttempts % PIN_MAX_FAILED_ATTEMPTS !== 0) {
    return;
  }

  await runRedisCommand(
    `set/${encodeURIComponent(getPinRegenerateSignalKey(sessionId))}/1?EX=${PIN_RESET_SIGNAL_TTL_SECONDS}`,
  );

  const resetTotalResult = await runRedisCommand(`incr/${encodeURIComponent(PIN_RESET_TOTAL_KEY)}`);
  await runRedisCommand(`expire/${encodeURIComponent(PIN_RESET_TOTAL_KEY)}/${PIN_RESET_TOTAL_TTL_SECONDS}`);

  const resetTotal = parseRedisNumber(resetTotalResult);
  if (resetTotal === null || resetTotal < PIN_MAX_RESETS_BEFORE_TIMEOUT) {
    return;
  }

  const blockedUntil = Date.now() + PIN_TIMEOUT_SECONDS * 1000;
  await runRedisCommand(`set/${encodeURIComponent(PIN_BLOCKED_UNTIL_KEY)}/${blockedUntil}?EX=${PIN_TIMEOUT_SECONDS}`);
}

export async function setPinMapping(pin: string, sessionId: string): Promise<void> {
  const key = `sync_pin_${pin}`;
  await runRedisCommand(`set/${encodeURIComponent(key)}/${encodeURIComponent(sessionId)}?EX=${PIN_TTL_SECONDS}`);
  await runRedisCommand(
    `set/${encodeURIComponent(getPinSessionKey(sessionId))}/${encodeURIComponent(pin)}?EX=${PIN_TTL_SECONDS}`,
  );
  await runRedisCommand(`set/${encodeURIComponent(ACTIVE_PIN_SESSION_KEY)}/${encodeURIComponent(sessionId)}?EX=${PIN_TTL_SECONDS}`);
}

export async function getSessionIdFromPin(pin: string): Promise<string | null> {
  const blockedUntilResult = await runRedisCommand(`get/${encodeURIComponent(PIN_BLOCKED_UNTIL_KEY)}`);
  const blockedUntil = parseRedisNumber(blockedUntilResult);
  if (blockedUntil && blockedUntil > Date.now()) {
    const remainingSeconds = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
    throw new Error(`Demasiados intentos inválidos. Intenta nuevamente en ${remainingSeconds} segundos.`);
  }

  const key = `sync_pin_${pin}`;
  const result = await runRedisCommand(`get/${encodeURIComponent(key)}`);
  if (typeof result !== 'string' || !result) {
    await handleFailedPinAttempt();
    return null;
  }

  return result;
}

export async function getPinSecurityStatus(sessionId: string): Promise<PinSecurityStatus> {
  const [regenerateSignalResult, blockedUntilResult] = await Promise.all([
    runRedisCommand(`get/${encodeURIComponent(getPinRegenerateSignalKey(sessionId))}`),
    runRedisCommand(`get/${encodeURIComponent(PIN_BLOCKED_UNTIL_KEY)}`),
  ]);

  const blockedUntil = parseRedisNumber(blockedUntilResult);
  return {
    regenerateRequested: parseRedisNumber(regenerateSignalResult) === 1,
    blockedUntil: blockedUntil && blockedUntil > Date.now() ? blockedUntil : null,
  };
}

export async function clearPinRegenerationRequest(sessionId: string): Promise<void> {
  await runRedisCommand(`del/${encodeURIComponent(getPinRegenerateSignalKey(sessionId))}`);
}

export async function resetPinMappingForSession(sessionId: string): Promise<void> {
  const sessionPinKey = getPinSessionKey(sessionId);
  const pinResult = await runRedisCommand(`get/${encodeURIComponent(sessionPinKey)}`);
  const keysToDelete = [
    sessionPinKey,
    getPinFailedAttemptsKey(sessionId),
    getPinRegenerateSignalKey(sessionId),
  ];

  if (typeof pinResult === 'string' && pinResult) {
    keysToDelete.push(`sync_pin_${pinResult}`);
  }

  await Promise.all(keysToDelete.map((key) => runRedisCommand(`del/${encodeURIComponent(key)}`)));

  const activeSessionResult = await runRedisCommand(`get/${encodeURIComponent(ACTIVE_PIN_SESSION_KEY)}`);
  if (activeSessionResult === sessionId) {
    await runRedisCommand(`del/${encodeURIComponent(ACTIVE_PIN_SESSION_KEY)}`);
  }
}
