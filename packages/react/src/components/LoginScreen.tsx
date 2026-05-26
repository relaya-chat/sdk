// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState, FormEvent } from 'react';

interface LoginScreenProps {
  onLogin: (email: string) => Promise<void>;
  error: string | null;
  stationSlug: string;
}

export default function LoginScreen({ onLogin, error, stationSlug }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    try {
      await onLogin(email.trim());
    } catch {
      // error is handled in useRelayaAuth and passed as prop
    } finally {
      setLoading(false);
    }
  }

  const stationLabel = stationSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__logo">
          <span style={{ fontSize: 40 }}>📻</span>
        </div>
        <h1 className="login-card__title">{stationLabel} Chat</h1>
        <p className="login-card__subtitle">
          Enter your email to receive a magic link and join the chat.
        </p>

        <form className="login-card__form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              required
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn btn--primary" disabled={loading || !email.trim()}>
            {loading ? (
              <>
                <span className="connection-spinner" />
                Sending…
              </>
            ) : (
              'Send magic link'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
