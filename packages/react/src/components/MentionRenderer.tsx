// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';
import type { StickerListing } from '@relaya-chat/core';
import { detectImageUrls } from '@relaya-chat/core';
import ChatImage from './ChatImage.js';

// Regex for structured @[Name|userId] mention tokens
const STRUCTURED_MENTION_REGEX = /@\[([^\]|]+)\|([^\]]+)\]/g;

// Regex for detecting URLs — capturing group so split() includes the URL parts
const URL_REGEX = /(https?:\/\/\S+)/g;

/** Strip trailing punctuation that is unlikely to be part of the URL itself. */
function trimUrlTrailingPunct(url: string): string {
  return url.replace(/[.,;:!?)]+$/, '');
}

/**
 * Apply legacy @word bolding to a plain-text segment (no structured tokens).
 * Only called on text that has already been split out from structured tokens.
 */
function renderLegacyMentions(text: string, keyBase: string): React.ReactNode {
  if (!text.includes('@')) return text;
  const legacyRegex = /(@[a-zA-Z0-9_-]+)/g;
  const parts = text.split(legacyRegex);
  if (parts.length === 1) return text;
  return (
    <React.Fragment key={`legacy-${keyBase}`}>
      {parts.map((part, idx) =>
        /^@[a-zA-Z0-9_-]+$/.test(part)
          ? <strong key={idx}>{part}</strong>
          : <React.Fragment key={idx}>{part}</React.Fragment>
      )}
    </React.Fragment>
  );
}

/**
 * Render a plain-text segment with URL auto-linking, then mention support within
 * each non-URL span. Converts http/https URLs to clickable <a> tags.
 */
function renderTextWithLinks(text: string, currentUserId?: string): React.ReactNode {
  const parts = text.split(URL_REGEX);
  if (parts.length === 1) {
    return renderTextWithMentions(text, currentUserId);
  }
  return (
    <>
      {parts.map((part, idx) => {
        // With a capturing group, odd-indexed parts are the captured URL matches
        if (idx % 2 === 1) {
          const href = trimUrlTrailingPunct(part);
          const trailingPunct = part.slice(href.length);
          return (
            <React.Fragment key={`link-${idx}`}>
              <a href={href} className="message-link" target="_blank" rel="noopener noreferrer">
                {href}
              </a>
              {trailingPunct}
            </React.Fragment>
          );
        }
        if (!part) return null;
        return (
          <React.Fragment key={`text-${idx}`}>
            {renderTextWithMentions(part, currentUserId)}
          </React.Fragment>
        );
      })}
    </>
  );
}

/**
 * Render text with mention support:
 * - Structured @[Name|userId] tokens → styled mention chip (highlights self)
 * - Legacy @word tokens → bold (backward compatibility)
 * - Fast path: if no '@', return text as-is
 */
export function renderTextWithMentions(text: string, currentUserId?: string): React.ReactNode {
  if (!text.includes('@')) return text; // Fast path

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  STRUCTURED_MENTION_REGEX.lastIndex = 0;
  let match = STRUCTURED_MENTION_REGEX.exec(text);
  while (match !== null) {
    const [full, name, userId] = match;
    const matchStart = match.index;

    // Render plain text before this token (with legacy @word bolding)
    if (matchStart > lastIndex) {
      nodes.push(renderLegacyMentions(text.slice(lastIndex, matchStart), `${lastIndex}`));
    }

    const isSelf = !!currentUserId && userId.trim() === currentUserId;
    nodes.push(
      <span
        key={`mention-${matchStart}`}
        className={`mention-chip${isSelf ? ' mention-chip--self' : ''}`}
      >
        @{name}
      </span>
    );

    lastIndex = matchStart + full.length;
    match = STRUCTURED_MENTION_REGEX.exec(text);
  }

  // Render any remaining text after the last token
  if (lastIndex < text.length) {
    nodes.push(renderLegacyMentions(text.slice(lastIndex), `${lastIndex}-end`));
  }

  if (nodes.length === 0) return text;
  if (nodes.length === 1) return nodes[0];
  return <>{nodes}</>;
}

export function RenderMessageContent({
  content,
  stickers,
  currentUserId,
}: {
  content: string;
  stickers: StickerListing[];
  currentUserId?: string;
}) {
  const segments = detectImageUrls(content);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.isImage && segment.url) {
          const matchingSticker = stickers.find(
            (sticker) => sticker.url === segment.url && sticker.shortcode
          );
          return (
            <ChatImage
              key={`img-${index}-${segment.url}`}
              url={segment.url}
              title={matchingSticker?.shortcode ? `:${matchingSticker.shortcode}:` : undefined}
            />
          );
        }

        // Render text segments with URL auto-linking and @mention support
        return (
          <React.Fragment key={`txt-${index}`}>
            {renderTextWithLinks(segment.text, currentUserId)}
          </React.Fragment>
        );
      })}
    </>
  );
}
