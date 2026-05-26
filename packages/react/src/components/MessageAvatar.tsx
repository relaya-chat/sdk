// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState } from 'react';

interface MessageAvatarProps {
  displayName: string;
  avatarUrl: string | null;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function MessageAvatar({ displayName, avatarUrl }: MessageAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!avatarUrl && !imageFailed;

  return (
    <div className="message-item__avatar-slot" aria-hidden="true">
      {showImage ? (
        <img
          className="message-item__avatar message-item__avatar--image"
          src={avatarUrl}
          alt=""
          onError={() => setImageFailed(true)}
          loading="lazy"
        />
      ) : (
        <div className="message-item__avatar">{getInitials(displayName)}</div>
      )}
    </div>
  );
}
