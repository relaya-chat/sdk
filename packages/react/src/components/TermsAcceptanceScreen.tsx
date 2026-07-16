// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * TermsAcceptanceScreen — shown when auth.termsAccepted is false.
 *
 * The user must explicitly agree to the space's community guidelines before
 * gaining chat access. Supports a "View full terms" link (opens termsUrl in a
 * new tab) and a "Cancel / Sign out" path. On agreement, calls acceptTerms()
 * which flips auth.termsAccepted to true and lets the chat load.
 */

import React, { useState } from 'react';
import type { AuthState, AuthActions } from '../hooks/authTypes.js';

interface TermsAcceptanceScreenProps {
  auth: AuthState & AuthActions;
}

export default function TermsAcceptanceScreen({ auth }: TermsAcceptanceScreenProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await auth.acceptTerms();
      // auth.termsAccepted flips to true; the parent re-renders to ChatWindow
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }

  function handleDecline() {
    auth.logout();
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__logo">
          <span style={{ fontSize: '40px', lineHeight: '1' }}>&#x1F4DC;</span>
        </div>

        <h2 className="login-card__title">Community Guidelines</h2>

        <p className="login-card__subtitle">
          {auth.station?.name ?? 'This community'} requires you to agree to their
          community guidelines before joining the chat.
        </p>

        {auth.termsUrl && (
          <p style={{ textAlign: 'center', marginBottom: 'var(--spacing-md)' }}>
            <a
              href={auth.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="terms-link"
            >
              View full community guidelines &rarr;
            </a>
          </p>
        )}

        {error && (
          <p className="terms-error">{error}</p>
        )}

        <div className="login-card__form">
          <button
            className="btn btn--primary"
            onClick={handleAccept}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'I Agree'}
          </button>

          <button
            className="btn btn--secondary"
            onClick={handleDecline}
            disabled={isSubmitting}
          >
            Cancel / Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
