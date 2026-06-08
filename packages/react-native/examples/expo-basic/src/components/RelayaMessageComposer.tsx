// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
/**
 * RelayaMessageComposer — text input + send button.
 *
 * Intentionally plain — demonstrates the integration contract only.
 * Clears input after sending. Disabled when input is empty.
 */
import React, { useState } from 'react';
import {
  View,
  TextInput,
  Button,
  StyleSheet,
} from 'react-native';

interface Props {
  onSend: (content: string) => void;
}

export function RelayaMessageComposer({ onSend }: Props) {
  const [text, setText] = useState('');

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Type a message…"
        multiline={false}
        returnKeyType="send"
        onSubmitEditing={handleSend}
        blurOnSubmit={false}
      />
      <Button
        title="Send"
        onPress={handleSend}
        disabled={!text.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    padding: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#f9f9f9',
  },
});
