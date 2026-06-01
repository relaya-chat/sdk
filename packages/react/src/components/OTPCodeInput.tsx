// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState, useEffect, useRef } from 'react';

interface OTPCodeInputProps {
  email: string;
  pendingId: string;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export default function OTPCodeInput({
  email,
  pendingId,
  onVerify,
  onResend,
  onChangeEmail,
  isSubmitting,
  error,
}: OTPCodeInputProps) {
  const [code, setCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(30);
  const [isResending, setIsResending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (code.length === 6 && !isSubmitting) {
      handleSubmit();
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCodeChange(value: string) {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
  }

  async function handleSubmit() {
    if (code.length !== 6 || isSubmitting) return;
    await onVerify(code);
  }

  async function handleResend() {
    if (resendCooldown > 0 || isResending) return;
    
    setIsResending(true);
    try {
      await onResend();
      setResendCooldown(30);
      setCode('');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="otp-code-input">
      <div className="otp-code-input__icon">🔑</div>
      <h2 className="otp-code-input__title">Enter verification code</h2>
      <p className="otp-code-input__hint">
        We sent a 6-digit code to <strong>{email}</strong>
      </p>
      <p className="otp-code-input__spam-hint">
        Don&apos;t see it? Check your spam folder.
      </p>
      
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="otp-code-input__field"
        placeholder="000000"
        value={code}
        onChange={(e) => handleCodeChange(e.target.value)}
        disabled={isSubmitting}
        autoComplete="one-time-code"
        maxLength={6}
      />

      {error && (
        <div className="otp-code-input__error">{error}</div>
      )}

      <div className="otp-code-input__actions">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={onChangeEmail}
          disabled={isSubmitting || isResending}
        >
          Use different email
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={handleResend}
          disabled={resendCooldown > 0 || isResending}
        >
          {isResending
            ? 'Sending…'
            : resendCooldown > 0
            ? `Resend (${resendCooldown}s)`
            : 'Resend code'}
        </button>
      </div>

      {code.length === 6 && (
        <p className="otp-code-input__auto-submit">Verifying...</p>
      )}
    </div>
  );
}
