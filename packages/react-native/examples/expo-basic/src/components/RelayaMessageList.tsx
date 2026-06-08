// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
/**
 * RelayaMessageList — renders confirmed messages and pending optimistic messages.
 *
 * Intentionally plain — demonstrates the integration contract only.
 * Confirmed messages (from the server) are rendered above optimistic messages.
 * Optimistic messages show a status suffix: "(sending…)" or "(failed)".
 */
import React, { useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import type { Message, OptimisticMessage } from '@relaya-chat/core';

interface MessageRow {
  key: string;
  type: 'confirmed' | 'optimistic';
  confirmed?: Message;
  optimistic?: OptimisticMessage;
}

interface Props {
  messages: Message[];
  optimistic: OptimisticMessage[];
  onLongPressMessage?: (message: Message) => void;
}

export function RelayaMessageList({ messages, optimistic, onLongPressMessage }: Props) {
  const rows: MessageRow[] = [
    ...messages.map((m): MessageRow => ({ key: m.id, type: 'confirmed', confirmed: m })),
    ...optimistic.map((m): MessageRow => ({ key: m.clientId, type: 'optimistic', optimistic: m })),
  ];

  const renderItem = useCallback(({ item }: { item: MessageRow }) => {
    if (item.type === 'confirmed' && item.confirmed) {
      const m = item.confirmed;
      if (m.is_deleted) {
        return (
          <View style={styles.row}>
            <Text style={styles.deleted}>[message deleted]</Text>
          </View>
        );
      }
      return (
        <View style={styles.row}>
          <Text
            style={styles.content}
            onLongPress={() => onLongPressMessage?.(m)}
          >
            {m.content}
          </Text>
        </View>
      );
    }

    if (item.type === 'optimistic' && item.optimistic) {
      const m = item.optimistic;
      const suffix = m.status === 'sending' ? ' (sending…)' : ' (failed)';
      return (
        <View style={styles.row}>
          <Text style={[styles.content, m.status === 'failed' && styles.failed]}>
            {m.content}
            <Text style={styles.statusSuffix}>{suffix}</Text>
          </Text>
        </View>
      );
    }

    return null;
  }, [onLongPressMessage]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <Text style={styles.empty}>No messages yet. Be the first to say something!</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 12,
    gap: 8,
  },
  row: {
    paddingVertical: 4,
  },
  content: {
    fontSize: 15,
    color: '#111',
  },
  deleted: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  failed: {
    color: '#c00',
  },
  statusSuffix: {
    fontSize: 12,
    color: '#999',
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 14,
  },
});
