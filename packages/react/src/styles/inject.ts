// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Relaya default-style injector.
 *
 * Imports the full stylesheet as an inline string (Vite resolves all
 * @import chains at build time).  On first call the string is inserted
 * as a <style> element into <head>; subsequent calls are no-ops.
 *
 * This lets subscribers get zero-config default styling just by mounting
 * <RelayaChat> — no separate CSS import step required.
 *
 * Subscribers who want full control can call removeRelayaStyles() and
 * supply their own stylesheet, or simply override individual CSS custom
 * properties on :root / .relaya-root.
 */

// Vite ?inline query: resolves the entire @import tree and returns the
// combined CSS as a plain string embedded in the JS bundle.
/// <reference path="../vite-env.d.ts" />
import stylesContent from './embed.css?inline';

const STYLE_ID = 'relaya-default-styles';

/**
 * Inject Relaya default styles into <head> if not already present.
 * Safe to call multiple times and from multiple RelayaChat instances.
 * Does nothing in SSR environments (typeof document === 'undefined').
 */
export function injectRelayaStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = stylesContent;
  document.head.appendChild(style);
}

/**
 * Remove the injected default styles.
 * Call this when you want to take full styling control.
 */
export function removeRelayaStyles(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(STYLE_ID)?.remove();
}
