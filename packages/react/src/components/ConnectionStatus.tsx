// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';
import type { ConnectionStatus as Status } from '@relaya-chat/core';

interface ConnectionStatusProps {
  status: Status;
}

const LABELS: Record<Status, string> = {
  disconnected: 'Disconnected — check your connection',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  connected: '',
};

export default function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status === 'connected') return null;

  return (
    <div className={`connection-status connection-status--${status}`}>
      {(status === 'connecting' || status === 'reconnecting') && (
        <span className="connection-spinner" />
      )}
      {LABELS[status]}
    </div>
  );
}
