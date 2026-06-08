// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
/**
 * Expo SecureStore adapter for @relaya-chat/react-native.
 *
 * Pass this as the `tokenStorage` option to useRelayaAuth. The SDK uses it
 * to persist only the refresh token — the access token is always kept in
 * memory and never written to storage.
 *
 * For bare React Native (without Expo), use react-native-keychain instead:
 *   https://github.com/oblador/react-native-keychain
 */
import * as SecureStore from 'expo-secure-store';
import type { RelayaTokenStorage } from '@relaya-chat/react-native';

export const relayaTokenStorage: RelayaTokenStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  delete: (key: string) => SecureStore.deleteItemAsync(key),
};
