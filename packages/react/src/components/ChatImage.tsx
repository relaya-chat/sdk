// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import { useState } from 'react';
import { imageAltFromUrl } from './messageItemUtils.js';

interface ChatImageProps {
  url: string;
  bare?: boolean;
  title?: string;
}

export default function ChatImage({ url, bare = false, title }: ChatImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className={['chat-image', bare ? 'chat-image--bare' : 'chat-image--inline'].join(' ')} title={title}>
      {!loaded && !failed && (
        <span className="chat-image__loading" aria-label="Loading image">
          <span />
          <span />
          <span />
        </span>
      )}

      {failed ? (
        <span className="chat-image__fallback">Image unavailable</span>
      ) : (
        <img
          src={url}
          alt={imageAltFromUrl(url)}
          loading="lazy"
          className="chat-image__img"
          title={title}
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      )}
    </span>
  );
}
