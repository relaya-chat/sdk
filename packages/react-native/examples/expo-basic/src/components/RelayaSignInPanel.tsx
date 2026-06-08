// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
/**
 * RelayaSignInPanel — email + OTP sign-in flow.
 *
 * Renders two states:
 *  1. Email entry: user enters email and requests a 6-digit code.
 *  2. Code entry: user enters the code to complete sign-in.
 *
 * Intentionally plain — demonstrates the integration contract only.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import type { RelayaAuthState, RelayaAuthActions } from '@relaya-chat/react-native';

interface Props {
  auth: RelayaAuthState & RelayaAuthActions;
}

export function RelayaSignInPanel({ auth }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRequestCode() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const result = await auth.requestCode(email.trim());
      setPendingId(result.pendingId);
    } catch {
      // auth.error is set by the hook; rendered below
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    if (!pendingId || !code.trim()) return;
    setBusy(true);
    try {
      await auth.verifyCode(pendingId, code.trim());
      // auth.status transitions to 'authenticated' — ChatScreen re-renders
    } catch {
      // auth.error is set by the hook; rendered below
    } finally {
      setBusy(false);
    }
  }

  if (auth.status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>Restoring session…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in to Relaya Chat</Text>

      {!pendingId ? (
        <>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <Button
            title={busy ? 'Sending…' : 'Send code'}
            onPress={handleRequestCode}
            disabled={busy || !email.trim()}
          />
        </>
      ) : (
        <>
          <Text style={styles.hint}>Enter the 6-digit code sent to {email}</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            editable={!busy}
          />
          <Button
            title={busy ? 'Verifying…' : 'Sign in'}
            onPress={handleVerifyCode}
            disabled={busy || code.trim().length < 6}
          />
          <Button
            title="Back"
            onPress={() => { setPendingId(null); setCode(''); }}
            disabled={busy}
          />
        </>
      )}

      {auth.error ? <Text style={styles.error}>{auth.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: {
    color: '#c00',
    fontSize: 14,
    marginTop: 8,
  },
});
