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

export async function setPinMapping(pin: string, sessionId: string): Promise<void> {
  const { url, token } = getRedisConfig();
  const key = `sync_pin_${pin}`;
  const endpoint = `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(sessionId)}?EX=${PIN_TTL_SECONDS}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await parseRedisResponse(response);
}

export async function getSessionIdFromPin(pin: string): Promise<string | null> {
  const { url, token } = getRedisConfig();
  const key = `sync_pin_${pin}`;
  const endpoint = `${url}/get/${encodeURIComponent(key)}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await parseRedisResponse(response);
  if (typeof result !== 'string' || !result) {
    return null;
  }

  return result;
}
