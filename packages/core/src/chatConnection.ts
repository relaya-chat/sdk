// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * WebSocket connection manager for the Relaya chat system.
 *
 * Handles:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Exponential backoff for reconnection attempts
 * - Application-level heartbeat pong responses
 * - Status change callbacks for UI indicators
 *
 * Designed for use in both browser (native WebSocket) and React Native
 * (via the same global WebSocket API surface in React Native).
 */

import type { WsClientMessage, WsServerMessage } from './types.js';
import { calculateBackoff } from './messageUtils.js';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface ChatConnectionOptions {
  /** Base delay for exponential backoff in ms (default: 1000) */
  backoffBaseMs?: number;
  /** Maximum backoff delay cap in ms (default: 30000) */
  backoffMaxMs?: number;
  /**
   * Called when the server forces the client to log out — either via a
   * `force_logout` WS message or a WS close with code 4001. The caller
   * should clear auth state and stop reconnecting.
   */
  onAuthRevoked?: () => void;
}

/**
 * Manages a single WebSocket connection to the Relaya chat server.
 *
 * Usage:
 *   const conn = new ChatConnection(
 *     () => `ws://localhost:9000/ws?token=${token}&station=balearic-fm`,
 *     (msg) => dispatch(msg),
 *     (status) => setConnectionStatus(status)
 *   );
 *   conn.connect();
 *   conn.send({ type: 'message:send', content: 'hello', clientId: '...' });
 *   conn.close(); // on component unmount
 */
export class ChatConnection {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set to true when `close()` is called; prevents any further reconnect. */
  private closed = false;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly onAuthRevoked: (() => void) | undefined;

  /**
   * @param buildWsUrl      - Called each time a new WebSocket is opened; allows
   *                          the caller to inject a fresh JWT on reconnect.
   * @param onMessage       - Receives every parsed WsServerMessage except `ping`
   *                          (pings are handled internally with an auto-pong) and
   *                          `force_logout` (handled internally by stopping the
   *                          connection and invoking `options.onAuthRevoked`).
   * @param onStatusChange  - Called whenever the connection status changes.
   * @param options         - Backoff tuning and auth-revocation callback (optional).
   */
  constructor(
    private readonly buildWsUrl: () => string,
    private readonly onMessage: (msg: WsServerMessage) => void,
    private readonly onStatusChange: (status: ConnectionStatus) => void,
    options: ChatConnectionOptions = {}
  ) {
    this.backoffBaseMs = options.backoffBaseMs ?? 1000;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.onAuthRevoked = options.onAuthRevoked;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Open the WebSocket connection (or start the reconnect cycle). */
  connect(): void {
    if (this.closed) return;
    this.setStatus('connecting');
    this.openSocket();
  }

  /** Send a message to the server. Silently dropped if not connected. */
  send(msg: WsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Permanently close the connection and stop any pending reconnect.
   * After calling this, the instance should be discarded.
   */
  close(): void {
    this.closed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.onclose = null; // prevent scheduleReconnect from firing
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private openSocket(): void {
    if (this.closed) return;

    const url = this.buildWsUrl();
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.closed) {
        ws.close();
        return;
      }
      this.reconnectAttempt = 0;
      this.setStatus('connected');
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(event.data as string) as WsServerMessage;
      } catch {
        return; // ignore malformed frames
      }

      // Reply to server heartbeat pings automatically
      if (msg.type === 'ping') {
        this.send({ type: 'pong' });
        return;
      }

      // Server-initiated logout (e.g. demo space reset removes the user).
      // Stop reconnecting and notify the caller to clear auth state.
      if (msg.type === 'force_logout') {
        this.handleAuthRevoked();
        return;
      }

      this.onMessage(msg);
    };

    ws.onclose = (event: CloseEvent) => {
      if (this.closed) return;
      // Close code 4001 means the server explicitly revoked this session
      // (e.g. a WS upgrade was rejected after the user was removed).
      // Stop reconnecting and notify the caller to clear auth state.
      if (event.code === 4001) {
        this.handleAuthRevoked();
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — no additional action needed here.
      // The reconnect is scheduled in onclose.
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.setStatus('reconnecting');
    const delay = calculateBackoff(this.reconnectAttempt, this.backoffBaseMs, this.backoffMaxMs);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.closed) this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange(status);
    }
  }

  /**
   * Permanently stop this connection (no reconnect) and invoke the
   * onAuthRevoked callback so the caller can clear auth state.
   * Called when the server sends a force_logout message or closes with code 4001.
   */
  private handleAuthRevoked(): void {
    this.closed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.onclose = null; // suppress the onclose that will fire after ws.close()
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
    this.onAuthRevoked?.();
  }
}
