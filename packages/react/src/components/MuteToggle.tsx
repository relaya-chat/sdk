// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';
import { HiBell, HiBellSlash } from 'react-icons/hi2';
import { useNotificationMute } from '../contexts/NotificationMuteContext.js';
import '../styles/MuteToggle.css';

export default function MuteToggle() {
  const { isMuted, setIsMuted } = useNotificationMute();

  const handleToggle = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    
    // Announce state change for screen readers
    const message = newMutedState ? 'Notifications muted' : 'Notifications unmuted';
    // Use a live region announcement (non-intrusive)
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };

  const ariaLabel = isMuted ? 'Unmute notifications' : 'Mute notifications';
  const title = isMuted ? 'Unmute notifications' : 'Mute notifications';

  return (
    <button
      className="mute-toggle"
      onClick={handleToggle}
      aria-label={ariaLabel}
      title={title}
      type="button"
    >
      {isMuted ? (
        <HiBellSlash className="mute-toggle__icon" aria-hidden="true" />
      ) : (
        <HiBell className="mute-toggle__icon" aria-hidden="true" />
      )}
    </button>
  );
}
