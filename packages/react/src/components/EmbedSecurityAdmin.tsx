// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * EmbedSecurityAdmin — allowed-origins and API key management.
 *
 * Admin-only (MANAGE_ROLES). Rendered inside a collapsible wrapper in AdminPanel.
 *
 * UX:
 *  - Two tabs: "iFrame" and "Native SDK".
 *  - iFrame tab: list of authorized domains with remove buttons + add-domain form.
 *  - Native tab: API key status (prefix + date) with generate/rotate/revoke actions
 *    and a one-time full-key reveal modal after generate/rotate.
 */

import React, { useState, useEffect } from 'react';
import { useServerUrl } from '../contexts/RelayaServerContext.js';
import type { AuthActions } from '../hooks/useRelayaAuth.js';

interface EmbedSecurityAdminProps {
  stationSlug: string;
  getToken: AuthActions['getToken'];
}

type Tab = 'iframe' | 'native';

interface AllowedOrigin {
  id: string;
  origin: string;
}

interface ApiKeyMeta {
  hasKey: boolean;
  prefix: string | null;
  createdAt: string | null;
}

function authHeaders(getToken: AuthActions['getToken']): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EmbedSecurityAdmin({ stationSlug, getToken }: EmbedSecurityAdminProps) {
  const serverUrl = useServerUrl();
  const base = `${serverUrl}/api/chat/${stationSlug}`;

  const [tab, setTab] = useState<Tab>('iframe');

  // ── iFrame tab state ──────────────────────────────────────────────────────
  const [origins, setOrigins] = useState<AllowedOrigin[]>([]);
  const [originsLoading, setOriginsLoading] = useState(false);
  const [originsError, setOriginsError] = useState<string | null>(null);
  const [addOrigin, setAddOrigin] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  // ── Native tab state ──────────────────────────────────────────────────────
  const [keyMeta, setKeyMeta] = useState<ApiKeyMeta>({ hasKey: false, prefix: null, createdAt: null });
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyActionSaving, setKeyActionSaving] = useState(false);

  // One-time key reveal modal
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Load origins ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setOriginsLoading(true);
      setOriginsError(null);
      try {
        const res = await fetch(`${base}/allowed-origins`, {
          credentials: 'include',
          headers: authHeaders(getToken),
        });
        if (!res.ok) throw new Error('Failed to load allowed origins');
        const data = await res.json();
        setOrigins(data.origins ?? []);
      } catch (e: unknown) {
        const err = e as { message?: string };
        setOriginsError(err?.message ?? 'Failed to load allowed origins');
      } finally {
        setOriginsLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load API key meta ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setKeyLoading(true);
      setKeyError(null);
      try {
        const res = await fetch(`${base}/api-key`, {
          credentials: 'include',
          headers: authHeaders(getToken),
        });
        if (!res.ok) throw new Error('Failed to load API key info');
        const data = await res.json();
        setKeyMeta({
          hasKey: data.hasKey ?? false,
          prefix: data.prefix ?? null,
          createdAt: data.createdAt ?? null,
        });
      } catch (e: unknown) {
        const err = e as { message?: string };
        setKeyError(err?.message ?? 'Failed to load API key info');
      } finally {
        setKeyLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add origin ────────────────────────────────────────────────────────────
  async function handleAddOrigin(e: React.FormEvent) {
    e.preventDefault();
    const origin = addOrigin.trim();
    if (!origin) return;
    setAddError(null);
    setAddSaving(true);
    try {
      const res = await fetch(`${base}/allowed-origins`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(getToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data?.error?.message ?? `Request failed: ${res.status}`);
      }
      const added = await res.json() as { id: string; origin: string };
      setOrigins((prev) => [...prev, { id: added.id, origin: added.origin }]);
      setAddOrigin('');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setAddError(err?.message ?? 'Failed to add origin');
    } finally {
      setAddSaving(false);
    }
  }

  // ── Remove origin ─────────────────────────────────────────────────────────
  async function handleRemoveOrigin(id: string) {
    setAddError(null);
    try {
      const res = await fetch(`${base}/allowed-origins/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(getToken),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data?.error?.message ?? `Request failed: ${res.status}`);
      }
      setOrigins((prev) => prev.filter((o) => o.id !== id));
    } catch (e: unknown) {
      const err = e as { message?: string };
      setAddError(err?.message ?? 'Failed to remove origin');
    }
  }

  // ── Generate / rotate key ─────────────────────────────────────────────────
  async function handleGenerateKey() {
    setKeyError(null);
    setKeyActionSaving(true);
    try {
      const res = await fetch(`${base}/api-key`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders(getToken), 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data?.error?.message ?? `Request failed: ${res.status}`);
      }
      const data = await res.json() as { key: string; prefix: string; createdAt: string };
      setKeyMeta({ hasKey: true, prefix: data.prefix ?? null, createdAt: data.createdAt ?? null });
      setRevealedKey(data.key ?? null);
      setCopied(false);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setKeyError(err?.message ?? 'Failed to generate API key');
    } finally {
      setKeyActionSaving(false);
    }
  }

  // ── Revoke key ────────────────────────────────────────────────────────────
  async function handleRevokeKey() {
    if (!window.confirm('Revoke this API key? The current key will stop working immediately.')) return;
    setKeyError(null);
    setKeyActionSaving(true);
    try {
      const res = await fetch(`${base}/api-key`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(getToken),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(data?.error?.message ?? `Request failed: ${res.status}`);
      }
      setKeyMeta({ hasKey: false, prefix: null, createdAt: null });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setKeyError(err?.message ?? 'Failed to revoke API key');
    } finally {
      setKeyActionSaving(false);
    }
  }

  // ── Copy revealed key ─────────────────────────────────────────────────────
  async function handleCopy() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="embed-security-admin">

      {/* Tab selector */}
      <div className="embed-security-admin__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'iframe'}
          className={`embed-security-admin__tab${tab === 'iframe' ? ' embed-security-admin__tab--active' : ''}`}
          onClick={() => setTab('iframe')}
        >
          iFrame
        </button>
        <button
          role="tab"
          aria-selected={tab === 'native'}
          className={`embed-security-admin__tab${tab === 'native' ? ' embed-security-admin__tab--active' : ''}`}
          onClick={() => setTab('native')}
        >
          Native SDK
        </button>
      </div>

      {/* ── iFrame tab ───────────────────────────────────────────────────── */}
      {tab === 'iframe' && (
        <div className="embed-security-admin__panel" role="tabpanel">
          <p className="embed-security-admin__description">
            Restrict which websites can embed this space in an iframe. Only browsers
            connecting from an authorized domain will be allowed to open a connection.
            Leave the list empty to allow any website (not recommended for production).
          </p>

          {originsLoading ? (
            <div className="embed-security-admin__status">Loading…</div>
          ) : originsError ? (
            <div className="embed-security-admin__status embed-security-admin__status--error">{originsError}</div>
          ) : (
            <>
              <div className="embed-security-admin__section-title">Authorized domains</div>

              {origins.length === 0 ? (
                <div className="embed-security-admin__empty-warning">
                  ⚠ No domains listed — your space can be embedded on any website.
                </div>
              ) : (
                <ul className="embed-security-admin__origin-list">
                  {origins.map((o) => (
                    <li key={o.id} className="embed-security-admin__origin-row">
                      <span className="embed-security-admin__origin-value">{o.origin}</span>
                      <button
                        className="btn btn--ghost embed-security-admin__remove-btn"
                        onClick={() => handleRemoveOrigin(o.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {addError && (
                <div className="embed-security-admin__action-error">{addError}</div>
              )}

              <form className="embed-security-admin__add-form" onSubmit={handleAddOrigin}>
                <input
                  className="embed-security-admin__input"
                  type="text"
                  placeholder="https://example.com"
                  value={addOrigin}
                  onChange={(e) => { setAddOrigin(e.target.value); setAddError(null); }}
                  disabled={addSaving}
                />
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={addSaving || !addOrigin.trim()}
                >
                  {addSaving ? 'Adding…' : 'Add domain'}
                </button>
              </form>

              <p className="embed-security-admin__hint">
                Exact: <code>https://example.com</code> — or single-level wildcard subdomain:{' '}
                <code>https://*.example.com</code>
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Native SDK tab ───────────────────────────────────────────────── */}
      {tab === 'native' && (
        <div className="embed-security-admin__panel" role="tabpanel">
          <p className="embed-security-admin__description">
            Generate an API key to authenticate your SDK integration. Pass the key as
            the <code>apiKey</code> prop on <code>&lt;RelayaChat&gt;</code>. The key is
            bound to this space and can be rotated at any time.
          </p>

          {keyLoading ? (
            <div className="embed-security-admin__status">Loading…</div>
          ) : (
            <>
              <div className="embed-security-admin__section-title">API key</div>

              {keyError && (
                <div className="embed-security-admin__action-error">{keyError}</div>
              )}

              {keyMeta.hasKey ? (
                <div className="embed-security-admin__key-row">
                  <div className="embed-security-admin__key-info">
                    <span className="embed-security-admin__key-prefix">{keyMeta.prefix}…</span>
                    {keyMeta.createdAt && (
                      <span className="embed-security-admin__key-date">
                        Created {formatDate(keyMeta.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="embed-security-admin__key-actions">
                    <button
                      className="btn btn--secondary"
                      onClick={handleGenerateKey}
                      disabled={keyActionSaving}
                    >
                      {keyActionSaving ? 'Rotating…' : 'Rotate key'}
                    </button>
                    <button
                      className="btn btn--ghost embed-security-admin__revoke-btn"
                      onClick={handleRevokeKey}
                      disabled={keyActionSaving}
                    >
                      Revoke key
                    </button>
                  </div>
                </div>
              ) : (
                <div className="embed-security-admin__no-key">
                  <span className="embed-security-admin__no-key-label">No API key yet.</span>
                  <button
                    className="btn btn--primary"
                    onClick={handleGenerateKey}
                    disabled={keyActionSaving}
                  >
                    {keyActionSaving ? 'Generating…' : 'Generate key'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* One-time key reveal modal */}
      {revealedKey && (
        <div className="embed-security-admin__modal-backdrop">
          <div
            className="embed-security-admin__modal"
            role="dialog"
            aria-modal="true"
            aria-label="API key generated"
          >
            <h3 className="embed-security-admin__modal-title">Save this key now</h3>
            <p className="embed-security-admin__modal-warning">
              This key will not be shown again. Copy it to a safe place before closing.
            </p>
            <div className="embed-security-admin__key-reveal">
              <code className="embed-security-admin__key-code">{revealedKey}</code>
              <button
                className="btn btn--secondary embed-security-admin__copy-btn"
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              className="btn btn--primary embed-security-admin__modal-close"
              onClick={() => setRevealedKey(null)}
            >
              I've saved the key — close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
