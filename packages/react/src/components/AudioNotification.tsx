// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import { useEffect, useRef } from 'react';

interface AudioNotificationProps {
  onMention: (playFn: () => void) => void; // Callback ref for @username mentions
  onChannel: (playFn: () => void) => void; // Callback ref for @channel mentions
  mentionSoundUrl: string | null;          // Per-station URL for @mention sound
  channelSoundUrl: string | null;          // Per-station URL for @channel sound
}

export default function AudioNotification({
  onMention,
  onChannel,
  mentionSoundUrl,
  channelSoundUrl,
}: AudioNotificationProps) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mentionBufRef = useRef<AudioBuffer | null>(null);
  const channelBufRef = useRef<AudioBuffer | null>(null);

  const mentionSoundUrlRef = useRef<string | null>(mentionSoundUrl);
  const channelSoundUrlRef = useRef<string | null>(channelSoundUrl);

  useEffect(() => {
    mentionSoundUrlRef.current = mentionSoundUrl;
  }, [mentionSoundUrl]);

  useEffect(() => {
    channelSoundUrlRef.current = channelSoundUrl;
  }, [channelSoundUrl]);

  useEffect(() => {
    function unlock() {
      removeListeners();

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      ctx.resume()
        .then(() => {
          if (ctx.state !== 'running') return;

          const silentBuf = ctx.createBuffer(1, 1, ctx.sampleRate);
          const silentSrc = ctx.createBufferSource();
          silentSrc.buffer = silentBuf;
          silentSrc.connect(ctx.destination);
          silentSrc.start(0);

          const tasks: Promise<void>[] = [];

          if (mentionSoundUrlRef.current) {
            tasks.push(
              fetch(mentionSoundUrlRef.current)
                .then((r) => r.arrayBuffer())
                .then((ab) => ctx.decodeAudioData(ab))
                .then((buf) => { mentionBufRef.current = buf; })
                .catch(() => {})
            );
          }

          if (channelSoundUrlRef.current) {
            tasks.push(
              fetch(channelSoundUrlRef.current)
                .then((r) => r.arrayBuffer())
                .then((ab) => ctx.decodeAudioData(ab))
                .then((buf) => { channelBufRef.current = buf; })
                .catch(() => {})
            );
          }

          Promise.all(tasks);
        })
        .catch(() => {});
    }

    function removeListeners() {
      document.removeEventListener('mousedown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
      document.removeEventListener('touchend', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    }

    document.addEventListener('mousedown', unlock, true);
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('keydown', unlock, true);

    return removeListeners;
  }, []);

  async function getCtx(): Promise<AudioContext | null> {
    const ctx = audioCtxRef.current;
    if (!ctx) return null;

    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        return null;
      }
    }
    return ctx.state === 'running' ? ctx : null;
  }

  async function playMentionSound(): Promise<void> {
    const ctx = await getCtx();
    if (!ctx || !mentionBufRef.current) return;

    const src = ctx.createBufferSource();
    src.buffer = mentionBufRef.current;
    src.connect(ctx.destination);
    src.start(0);
  }

  async function playChannelSound(): Promise<void> {
    const ctx = await getCtx();
    if (!ctx || !channelBufRef.current) return;

    const src = ctx.createBufferSource();
    src.buffer = channelBufRef.current;
    src.connect(ctx.destination);
    src.start(0);
  }

  useEffect(() => {
    onMention(playMentionSound);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMention]);

  useEffect(() => {
    onChannel(playChannelSound);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChannel]);

  return null; // No UI
}
