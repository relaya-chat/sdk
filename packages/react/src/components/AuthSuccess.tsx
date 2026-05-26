// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';

interface AuthSuccessProps {
  stationSlug: string;
  userDisplayName: string;
}

export default function AuthSuccess({ 
  stationSlug, 
  userDisplayName 
}: AuthSuccessProps) {
  const stationLabel = stationSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  
  return (
    <div className="auth-success">
      <div className="auth-success__card">
        <div className="success-icon">✅</div>
        <h1>You're signed in!</h1>
        <p className="user-greeting">Welcome, {userDisplayName}</p>
        
        <div className="instructions">
          <p>
            Close this tab and<br />
            <strong>refresh the chat page</strong><br />
            to start posting messages.
          </p>
        </div>
      </div>
    </div>
  );
}
