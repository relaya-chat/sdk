// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState, useEffect, useRef } from 'react';
import OTPCodeInput from './OTPCodeInput.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestCode: (email: string) => Promise<{ pendingId: string }>;
  onVerifyCode: (pendingId: string, code: string) => Promise<void>;
  stationSlug: string;
  error: string | null;
}

export default function AuthModal({
  isOpen,
  onClose,
  onRequestCode,
  onVerifyCode,
  stationSlug,
  error,
}: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setIsSubmitting(false);
      setPendingId(null);
      setVerifyError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !pendingId) {
      emailInputRef.current?.focus();
    }
  }, [isOpen, pendingId]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  async function handleSubmitEmail() {
    if (!email.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setVerifyError(null);
    try {
      const result = await onRequestCode(email);
      setPendingId(result.pendingId);
    } catch {
      // Error handling is done by the parent (sets error prop)
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(code: string) {
    if (!pendingId) return;

    setIsSubmitting(true);
    setVerifyError(null);
    try {
      await onVerifyCode(pendingId, code);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Invalid or expired code';
      setVerifyError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    if (!email.trim()) return;

    setVerifyError(null);
    const result = await onRequestCode(email);
    setPendingId(result.pendingId);
  }

  function handleChangeEmail() {
    setPendingId(null);
    setVerifyError(null);
    setEmail('');
  }

  function handleClose() {
    if (isSubmitting) return;
    console.log('[AuthModal] handleClose called');
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && email.trim() && !isSubmitting) {
      e.preventDefault();
      handleSubmitEmail();
    }
  }

  if (!isOpen) return null;

  if (pendingId) {
    return (
      <>
        <div className="modal-overlay" onClick={handleClose} />
        <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <div className="auth-modal__content">
            <button
              type="button"
              className="auth-modal__close-x"
              onClick={handleClose}
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
            <OTPCodeInput
              email={email}
              pendingId={pendingId}
              onVerify={handleVerifyCode}
              onResend={handleResendCode}
              onChangeEmail={handleChangeEmail}
              isSubmitting={isSubmitting}
              error={verifyError}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="modal-overlay" onClick={handleClose} />
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="auth-modal__content">
          <div className="auth-modal__icon">🔒</div>
          <h2 id="auth-modal-title" className="auth-modal__title">
            Sign in to post messages
          </h2>
          <input
            ref={emailInputRef}
            type="email"
            className="auth-modal__input"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            autoComplete="email"
          />
          {error && (
            <div className="auth-modal__error">{error}</div>
          )}
          <div className="auth-modal__buttons">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSubmitEmail}
              disabled={!email.trim() || isSubmitting}
            >
              {isSubmitting ? 'Sending…' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
