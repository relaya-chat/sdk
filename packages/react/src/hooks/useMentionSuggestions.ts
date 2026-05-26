// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useMentionSuggestions — state and logic for the @mention autocomplete strip.
 *
 * Extracted from MessageInput.tsx to keep that file under 400 lines.
 */

import { useState, useEffect, useMemo } from 'react';
import { getMentionSuggestions, insertMentionToken } from '../mentionInputUtils.js';
import type { OnlineUser } from './useRelayaChat.js';

interface ActiveMention {
  query: string;
  start: number;
  end: number;
}

export function useMentionSuggestions(
  text: string,
  caretPosition: number,
  onlineUsers: OnlineUser[],
  currentUserId: string | undefined,
  activeMention: ActiveMention | null,
  pickerOpen: boolean,
  applyInsertedText: (nextText: string, caret: number) => void
) {
  const [mentionHighlight, setMentionHighlight] = useState(-1);
  const [mentionStripDismissed, setMentionStripDismissed] = useState(false);

  const mentionSuggestions = activeMention
    ? getMentionSuggestions(onlineUsers, activeMention.query, currentUserId)
    : [];

  // Reset highlight and dismissed state when the typed query changes
  // (new query = new context, strip can reopen and selection resets)
  useEffect(() => {
    setMentionHighlight(-1);
    setMentionStripDismissed(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMention?.query]);

  const mentionStripVisible =
    !pickerOpen &&
    !!activeMention &&
    mentionSuggestions.length > 0 &&
    !mentionStripDismissed;

  // Compute strip width once from the full onlineUsers list (recalculates only on
  // presence updates, not on every keystroke/filter). Heuristic: ~8px per character
  // at font-size-sm, plus 52px for the @ prefix, gap, and left/right padding.
  const mentionStripWidth = useMemo(() => {
    if (onlineUsers.length === 0) return undefined;
    const longestChars = onlineUsers.reduce(
      (max, u) => Math.max(max, u.displayName.length),
      0
    );
    return Math.min(320, Math.max(120, longestChars * 8 + 52));
  }, [onlineUsers]);

  function insertMention(user: OnlineUser) {
    const start = activeMention?.start ?? caretPosition;
    const end = activeMention?.end ?? caretPosition;
    const result = insertMentionToken(text, start, end, user);
    applyInsertedText(result.nextText, result.caretPosition);
  }

  return {
    mentionSuggestions,
    mentionHighlight,
    setMentionHighlight,
    mentionStripDismissed,
    setMentionStripDismissed,
    mentionStripVisible,
    mentionStripWidth,
    insertMention,
  };
}
