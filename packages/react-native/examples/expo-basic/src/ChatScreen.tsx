// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
/**
 * ChatScreen — main integration demonstration screen.
 *
 * Demonstrates:
 *  - SecureStore adapter (relayaTokenStorage)
 *  - useRelayaAuth with OTP sign-in flow
 *  - useRelayaChat with authenticated + anonymous connection
 *  - Message list rendering (confirmed + optimistic)
 *  - Optimistic message sending
 *  - Sign out
 *  - getMessageMenuItems for report/moderation action sheet on long-press
 *  - AppState foreground refresh (handled inside the hooks; no additional code needed)
 *  - Presence bar showing connected user names and total online count
 *  - Dev-only diagnostic panel showing auth.status, chat.connectionStatus,
 *    message count, and last error
 *
 * Note on AppState: useRelayaAuth already listens for AppState transitions to
 * 'active' and calls ensureFreshToken(). useRelayaChat handles background
 * disconnect / reconnect. ChatScreen does not need its own AppState listener.
 *
 * Note on getMessageMenuItems: currentUserPriority and messageAuthorPriority
 * are set to 0 here because RelayaAuthUser does not expose role priority.
 * Production apps should derive these from role data or store them in auth context.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import {
  useRelayaAuth,
  useRelayaChat,
  getMessageMenuItems,
} from '@relaya-chat/react-native';
import type { Message } from '@relaya-chat/core';
import { relayaTokenStorage } from './relayaTokenStorage';
import { SERVER_URL, SPACE_SLUG } from './config.local';
import { RelayaSignInPanel } from './components/RelayaSignInPanel';
import { RelayaMessageList } from './components/RelayaMessageList';
import { RelayaMessageComposer } from './components/RelayaMessageComposer';

// ── ChatScreen ─────────────────────────────────────────────────────────────────

export function ChatScreen() {
  const auth = useRelayaAuth({
    serverUrl: SERVER_URL,
    spaceSlug: SPACE_SLUG,
    tokenStorage: relayaTokenStorage,
    onSessionEnded: (reason) => {
      if (reason === 'refresh-failed') {
        Alert.alert('Session expired', 'Please sign in again.');
      }
    },
  });

  const chat = useRelayaChat({
    serverUrl: SERVER_URL,
    spaceSlug: SPACE_SLUG,
    authState: auth,
    getToken: auth.getToken,
    ensureFreshToken: auth.ensureFreshToken,
    allowAnonymous: true,
    backgroundDisconnectDelayMs: 3 * 60 * 1000,
  });

  // Long-press a message to show an action sheet with available moderation/report actions.
  const handleLongPressMessage = useCallback((message: Message) => {
    const menuItems = getMessageMenuItems({
      message,
      currentUserId: auth.user?.id ?? null,
      currentUserPermissions: auth.user?.permissions ?? [],
      // Role priority is not exposed on RelayaAuthUser in V1.
      // Pass 0 for both; production apps should derive these from role data.
      currentUserPriority: 0,
      messageAuthorPriority: 0,
    });

    const actions: Array<{ label: string; action: () => void }> = [];

    if (menuItems.showReport) {
      actions.push({
        label: 'Report message',
        action: () => {
          Alert.alert('Report message', 'Reason for report?', [
            { text: 'Spam', onPress: () => chat.reportMessage(message.id, 'spam') },
            { text: 'Harassment', onPress: () => chat.reportMessage(message.id, 'harassment') },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      });
    }

    if (menuItems.showDelete) {
      actions.push({
        label: 'Delete message',
        action: () => {
          Alert.alert('Delete message', 'Are you sure?', [
            { text: 'Delete', style: 'destructive', onPress: () => chat.deleteMessage(message.id) },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      });
    }

    if (menuItems.showBan) {
      actions.push({
        label: 'Ban user',
        action: () => {
          Alert.alert('Ban user', 'Are you sure?', [
            { text: 'Ban', style: 'destructive', onPress: () => chat.banUser(message.user_id) },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      });
    }

    if (actions.length === 0) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...actions.map((a) => a.label), 'Cancel'],
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: actions.findIndex((a) => a.label === 'Delete message'),
        },
        (buttonIndex) => {
          actions[buttonIndex]?.action();
        }
      );
    } else {
      Alert.alert(
        'Message actions',
        undefined,
        [
          ...actions.map((a) => ({ text: a.label, onPress: a.action })),
          { text: 'Cancel', style: 'cancel' as const },
        ]
      );
    }
  }, [auth.user, chat]);

  // ── Not yet authenticated: show sign-in panel (handles loading state too) ───

  if (auth.status !== 'authenticated') {
    return <RelayaSignInPanel auth={auth} />;
  }

  // ── Authenticated: show chat ──────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {auth.station?.name ?? SPACE_SLUG}
        </Text>
        <TouchableOpacity onPress={auth.logout} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {chat.connectionStatus !== 'connected' && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerText}>
            {chat.connectionStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
          </Text>
        </View>
      )}

      {chat.connectionStatus === 'connected' && chat.totalCount > 0 && (
        <View style={styles.presenceBar}>
          <Text style={styles.presenceText}>
            {(() => {
              const nameList = chat.users.slice(0, 3).map((u) => u.displayName).join(', ');
              const overflow = chat.users.length > 3 ? ` +${chat.users.length - 3} more` : '';
              return nameList
                ? `● ${nameList}${overflow}  ·  ${chat.totalCount} online`
                : `● ${chat.totalCount} online`;
            })()}
          </Text>
        </View>
      )}

      <View style={styles.messageListContainer}>
        <RelayaMessageList
          messages={chat.messages}
          optimistic={chat.optimistic}
          onLongPressMessage={handleLongPressMessage}
          hideDeletedMessages={chat.hideDeletedMessages}
          currentUserPermissions={auth.user?.permissions ?? []}
        />
      </View>

      <RelayaMessageComposer onSend={chat.sendMessage} />

      {__DEV__ && (
        <View style={styles.devPanel}>
          <Text style={styles.devTitle}>DEV</Text>
          <Text style={styles.devLine}>auth: {auth.status}</Text>
          <Text style={styles.devLine}>ws: {chat.connectionStatus}</Text>
          <Text style={styles.devLine}>messages: {chat.messages.length}</Text>
          {chat.error ? (
            <Text style={[styles.devLine, styles.devError]}>error: {chat.error}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  signOutButton: { paddingHorizontal: 8, paddingVertical: 4 },
  signOutText: { color: '#007AFF', fontSize: 15 },
  statusBanner: {
    backgroundColor: '#fff3cd',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ffc107',
  },
  statusBannerText: { color: '#856404', fontSize: 13, textAlign: 'center' },
  presenceBar: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  presenceText: { color: '#888', fontSize: 12 },
  messageListContainer: { flex: 1 },
  devPanel: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  devTitle: { color: '#4fc3f7', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  devLine: {
    color: '#e0e0e0',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  devError: { color: '#ff6b6b' },
});
