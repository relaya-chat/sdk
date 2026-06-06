// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk

interface OpenAuthPopupOptions {
  baseUrl: string;
  stationSlug: string;
  onBlocked: () => void;
  onTokenPair: (accessToken: string, refreshToken: string) => void;
}

/** Opens the OTP popup and relays the returned AT/RT pair to the auth hook. */
export function openAuthPopup(options: OpenAuthPopupOptions): void {
  const serverOrigin = options.baseUrl
    ? new URL(options.baseUrl).origin
    : window.location.origin;
  const popupUrl = `${serverOrigin}/auth/popup?station=${encodeURIComponent(options.stationSlug)}`;
  const popup = window.open(popupUrl, 'relaya-auth', 'width=480,height=600,left=200,top=100');

  if (!popup) {
    options.onBlocked();
    return;
  }

  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== serverOrigin) return;
    if ((event.data as { type?: string })?.type !== 'relaya:auth') return;
    window.removeEventListener('message', handleMessage);
    const { accessToken, refreshToken } = event.data as { accessToken: string; refreshToken: string };
    options.onTokenPair(accessToken, refreshToken);
  };

  window.addEventListener('message', handleMessage);
}