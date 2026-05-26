// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { createContext, useState, useContext, ReactNode } from 'react';

interface NotificationMuteContextType {
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

const NotificationMuteContext = createContext<NotificationMuteContextType | undefined>(undefined);

export function NotificationMuteProvider({ children }: { children: ReactNode }) {
  const [isMuted, setIsMuted] = useState(false);

  return (
    <NotificationMuteContext.Provider value={{ isMuted, setIsMuted }}>
      {children}
    </NotificationMuteContext.Provider>
  );
}

export function useNotificationMute() {
  const context = useContext(NotificationMuteContext);
  if (!context) {
    throw new Error('useNotificationMute must be used within NotificationMuteProvider');
  }
  return context;
}
