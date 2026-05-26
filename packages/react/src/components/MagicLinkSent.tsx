// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';

interface MagicLinkSentProps {
  onBack: () => void;
}

export default function MagicLinkSent({ onBack }: MagicLinkSentProps) {
  return (
    <div className="magic-link-sent">
      <div className="magic-link-sent__card">
        <div className="magic-link-sent__icon">✉️</div>
        <h1 className="magic-link-sent__title">Check your email</h1>
        <p className="magic-link-sent__body">
          We've sent a magic link to your email address. Click the link to join the chat.
          <br /><br />
          The link expires in 15 minutes and can only be used once.
        </p>
        <button className="btn btn--ghost" onClick={onBack} style={{ width: '100%' }}>
          Use a different email
        </button>
      </div>
    </div>
  );
}
