# @relaya-chat/react

**Community chat for creators and platforms. Embed a fully moderated, real-time chat box on any website or app — no backend required.**

```tsx
import { RelayaChat } from '@relaya-chat/react';
import '@relaya-chat/react/styles';

export default function CommunityPage() {
  return (
    <RelayaChat
      spaceSlug="your-space-slug"
      serverUrl="https://api.relaya.chat"
      // apiKey="rlk_live_..."   // Required if your space has API key enforcement enabled
    />
  );
}
```

That's it. Auth, real-time messaging, moderation, stickers, themes, and history — all handled inside the component. Ship in 2 hours, not 2 months.

---

## What is Relaya™?

Relaya started as a problem: when [Balearic FM](https://balearic-fm.com) tried to embed Cbox into its iOS app, Apple rejected it — Cbox couldn't meet Apple's UGC content moderation requirements. So the founder built Relaya: the community chat infrastructure that ticked every box, at a price indie developers can actually afford.

Stop scattering your audience across Discord or WhatsApp groups you don't control. Relaya chat lives on your domain, with your branding, under your rules — keeping fans engaged where you want them.

**Three integration paths — one backend:**

| Path | Who it's for |
|---|---|
| **iframe embed** | Creators on Wix, Squarespace, WordPress — copy, paste, done |
| **`@relaya-chat/react`** | Web developers who want a React component, not an iframe |
| **`@relaya-chat/react-native`** | Mobile developers who need App Store-compliant UGC |

One subscription covers all three. Pick your path, start in minutes.

**Live demo:** [relaya.chat](https://relaya.chat) — try it in your browser right now.

**Server:** Requires Relaya server v1.2.0 or later. The hosted SaaS (`api.relaya.chat`) always runs the current version.

---

## Features

### 🔑 Known members, zero friction

Real members, not anonymous guests — everyone has a verified email identity. Bans stick, regulars recognize each other, and your audience is yours to keep.

Sign-in is effortless: a one-time code to their inbox, no password needed. Sessions last 33 days. No OAuth dance, no password resets, no account lockouts.

### 🛡️ Moderation built in — not bolted on

Report, ban, and delete tools on every plan, from day one. No upgrade required for moderation. Server-side enforcement only — no client-side trust shortcuts. Built to satisfy Apple's UGC guidelines from the start.

### 🧩 From iframe to SDK. One product.

Copy-paste an iframe onto your Wix site. Drop `@relaya-chat/react` into your Next.js app. Ship a React Native mobile app with App Store–compliant chat. One subscription, every integration path.

### 🎨 Custom branding

Match your site's colors with the visual theme editor. Custom fonts, colors, and layout options. The "Powered by Relaya™" badge is present on the Embed plan and removed on Community and Developer plans.

### 🖼️ Custom sticker sets

Upload your own sticker sets to give your community a unique, on-brand way to express themselves. Up to 20 on Embed, 100 on Community, unlimited on Developer.

### ⚡ Real-time, always

WebSocket-based. Messages appear instantly. Auto-reconnects on network drops. No polling, no delays.

### 🌍 Country & IP controls

Country allowlist/blocklist and IP ban tools for spaces with compliance needs or persistent bad actors.

### 📊 Chat history & export

Configurable message archive up to 180 days. Export your full chat history as CSV — your data stays yours, always. Searchable from the admin panel.

### 🔒 No-cookie architecture

Auth uses a short-lived access token in memory + a rotating refresh token in `localStorage`. No cookies of any kind. No cookie-consent banner required. Works in cross-origin iframes (Wix, Squarespace) without issue.

---

## Installation

```bash
npm install @relaya-chat/react
```

**Peer dependencies:** React 18+

```json
{
  "react": ">=18.0.0",
  "react-dom": ">=18.0.0"
}
```

---

## Quick Start

### 1. Get your space slug

Create a free account at [relaya.chat](https://relaya.chat) and set up your first space. Your `spaceSlug` is the only required config. Relaya issues auth tokens directly to your users — your app never handles credentials.

### 2. Drop in the component

```tsx
import { RelayaChat } from '@relaya-chat/react';
import '@relaya-chat/react/styles';

export default function CommunityPage() {
  return (
    <RelayaChat
      spaceSlug="your-space-slug"
      serverUrl="https://api.relaya.chat"
    />
  );
}
```

`<RelayaChat />` renders the complete chat UI: sign-in flow, message list, input, sticker picker, and moderation controls — all wired to the Relaya backend.

---

## Custom Assembly

If the default UI doesn't fit your design, import the pieces you need:

```tsx
import {
  AuthModal,
  MessageList,
  MessageInput,
  useRelayaAuth,
  useRelayaChat
} from '@relaya-chat/react';
```

The hooks handle all state, connection management, and auth token refresh. The components accept `className` overrides for custom styling. See the [component reference](https://relaya.chat/docs/react) for the full API.

---

## Theming

### CSS variable overrides

The complete `--sp-*` surface is public and stable. Override any of these on `.relaya-root` in your own stylesheet — no `!important` required:

**Header / title bar**

| Variable | What it controls | Default |
|---|---|---|
| `--sp-title-bg` | Header background color | `var(--relaya-color-surface)` |
| `--sp-name-color` | Space name text color | `var(--relaya-color-text)` |
| `--sp-name-font` | Space name font family | `inherit` |
| `--sp-ui-font` | All header UI text + body text font | system font stack |
| `--sp-online-color` | "N online" count text color | `var(--relaya-color-text-muted)` |
| `--sp-no-name-color` | "No display name" prompt text | `var(--relaya-color-text-muted)` |
| `--sp-header-icon-color` | Mute button and header icon color | `var(--relaya-color-status-text)` |
| `--sp-btn-border` | Header button border | `var(--relaya-color-border)` |
| `--sp-btn-bg` | Header button background | `var(--relaya-color-surface)` |
| `--sp-btn-text` | Header button text/icon color | `var(--relaya-color-text)` |

**Messages**

| Variable | What it controls | Default |
|---|---|---|
| `--sp-own-msg-bg` | Own message bubble background | `var(--relaya-color-own-msg-bg)` |
| `--sp-own-msg-text` | Own message text color | `var(--relaya-color-own-msg-text)` |
| `--sp-other-msg-bg` | Others' message bubble background | `var(--relaya-color-other-msg-bg)` |
| `--sp-other-msg-text` | Others' message text color | `var(--relaya-color-other-msg-text)` |
| `--sp-avatar-bg` | Avatar circle background | `var(--relaya-color-accent)` |
| `--sp-avatar-text` | Avatar initials color | `#ffffff` |
| `--sp-msg-font` | Message body font family | `inherit` |
| `--sp-msg-font-size` | Message body font size | `15px` |
| `--sp-time-color` | Timestamp label color | `var(--relaya-color-text-faint)` |
| `--sp-send-btn-bg` | Send button background | inherits `--sp-own-msg-bg` |
| `--sp-send-btn-text` | Send button icon color | inherits `--sp-own-msg-text` |
| `--sp-failed-msg-bg` | Rejected/failed message bubble background | `#fff3cd` (amber yellow) |
| `--sp-failed-msg-text` | Rejected/failed message text and status color | `var(--relaya-color-text-muted)` |

**Example — dark header with custom font:**

```css
.relaya-root {
  --sp-title-bg: #1a1a2e;
  --sp-name-color: #ffffff;
  --sp-online-color: rgba(255,255,255,0.7);
  --sp-header-icon-color: #ffffff;
  --sp-ui-font: 'Inter', sans-serif;
}
```

### What space admins can override

Space owners access the Theme panel from the gear icon in the chat header. They can independently set light and dark values for 12 color slots. Their changes are stored server-side and always win over your `--sp-*` CSS variable values:

| Admin panel label | CSS var overridden |
|---|---|
| Chat background | `--relaya-color-bg` |
| Others' message bubbles | `--relaya-color-message-bg` |
| Your message bubbles | `--relaya-color-message-own-bg` |
| Body text | `--relaya-color-text` |
| Secondary/muted text | `--relaya-color-text-secondary` |
| Message input background | `--relaya-color-input-bg` |
| Message input text | `--relaya-color-input-text` |
| Send button background | `--relaya-color-btn-bg` |
| Send button icon | `--relaya-color-btn-text` |
| Moderator name color | `--relaya-color-name-mod` |
| Link color | `--relaya-color-link` |
| Link hover/active | `--relaya-color-link-active` |

Admin overrides are applied as inline `:root` styles, which outrank CSS file rules. If you want a CSS override to survive an admin change, target `.relaya-root { --relaya-color-message-own-bg: ... }` instead of `:root`.

### Custom fonts

The SDK uses a system font stack by default. Load your own font, then set `--sp-ui-font`:

```tsx
// Next.js (next/font)
import { GeistSans } from 'geist/font/sans';

<div className={GeistSans.variable}>
  <RelayaChat spaceSlug="..." serverUrl="..." />
</div>
```

```css
/* Google Fonts or any CDN */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

.relaya-root {
  --sp-ui-font: 'Inter', sans-serif;
}
```

### Dark mode

**Option 1 — `theme` prop (recommended for React apps):**

Pass your app's resolved theme directly. The widget re-renders immediately when it changes:

```tsx
import { useTheme } from 'next-themes'; // or any theme context

export default function CommunityPage() {
  const { resolvedTheme } = useTheme();
  return (
    <RelayaChat
      spaceSlug="your-space-slug"
      serverUrl="https://api.relaya.chat"
      theme={resolvedTheme as 'light' | 'dark'}
    />
  );
}
```

**Option 2 — CSS class (automatic for Tailwind / `.dark` pattern):**

If your app applies a `.dark` class to `<html>` (the Tailwind / next-themes default), Relaya switches automatically — no prop needed:

```tsx
// tailwind.config.js: darkMode: 'class'
// next-themes: attribute="class"
// → Relaya respects <html class="dark"> automatically
<RelayaChat spaceSlug="your-space-slug" serverUrl="https://api.relaya.chat" />
```

**Option 3 — `data-theme` attribute:**

Relaya also responds to `data-theme="dark"` on `<html>` (the `[data-theme]` pattern used by many design systems):

```js
document.documentElement.setAttribute('data-theme', 'dark');
```

### Opting out of default styles

By default `<RelayaChat>` auto-injects the widget stylesheet into `<head>` on first mount. To take full styling control yourself, call `removeRelayaStyles()` before the first render:

```tsx
import { removeRelayaStyles } from '@relaya-chat/react';

removeRelayaStyles(); // call once, before the first <RelayaChat> render

export default function App() {
  return <RelayaChat spaceSlug="..." serverUrl="..." />;
}
```

After calling this, you are responsible for all widget styling. All widget class names (`.relaya-root`, `.chat-header`, `.message-item__bubble`, etc.) are still present and can be targeted in your own stylesheet. The `.relaya-root` scope boundary still applies.

---

## Pricing

All features above are available across three subscription tiers — from a simple embed for content creators to a full developer tier with React Native SDK and REST API access. Moderation tools (ban, delete, report) are included on **every tier**.

15-day free trial, no credit card required.

[See plans and pricing at relaya.chat →](https://relaya.chat)

---

## How Relaya Compares

|  | Tawk.to | Stream | Cbox | Discord | **Relaya™** |
|---|---|---|---|---|---|
| **Use case** | Customer support | Platform chat | Community widget | Community | **Community** |
| **No-code embed** | ✓ | ✗ | ✓ | ✓ | **✓** |
| **React SDK** | ✗ | ✓ | ✗ | ✗ | **✓** |
| **React Native SDK** | ✗ | ✓ | ✗ | ✗ | **✓** |
| **Moderation on every tier** | N/A | Medium | Partial (Pro+) | ✗ | **✓** |
| **App Store compliance path** | N/A | ✓ | ✗ | ✗ | **✓** |
| **Entry paid price** | Free | $99+/mo | $1.67/mo | Free | **$9/mo** |
| **Data ownership** | ✓ | ✓ | ⚠️ | ✗ | **✓** |

**Relaya's unique position:** The only product with community focus, no-code embed, React SDK, React Native SDK, moderation on every tier, and affordable pricing — all in one.

- **vs. Stream:** Same infrastructure quality, a fraction of the price. Stream is enterprise pricing for enterprise teams. Relaya is priced for indie developers from day one.
- **vs. Cbox:** Cbox is great for a simple chat box. Relaya is for when you need an API, a React component, a mobile app, or a path to the App Store. Like Stripe vs. a PayPal button.
- **vs. Discord embed:** Keep your community on your platform, not Discord's. Your moderation, your data, your brand.
- **vs. building from scratch:** 2 hours vs. 2-6 months. Moderation built in. App Store compliance included.

---

## Authentication Details

Relaya uses a short-lived access token + rotating refresh token model with no cookies:

- The access token lives in memory only — never written to storage
- The refresh token is stored in `localStorage` (key `relaya_refresh_token`) and persists across browser close/reopen
- No cookies are used, so no cookie-consent banner is required
- Works in cross-origin iframes (Wix, Squarespace)
- Sessions last 33 days with active refresh (inactivity window)

See [README-AUTH.md](./README-AUTH.md) (in the GitHub repo) for the full token lifecycle, session behavior, and sign-out details.

## Privacy & Data

For exactly what user data Relaya collects through this SDK and how to reflect it in your own privacy policy, see [PRIVACY.md](./PRIVACY.md).

---

## Getting Help

- **Documentation:** [relaya.chat/docs](https://relaya.chat/docs)
- **Dashboard + space setup:** [relaya.chat](https://relaya.chat)
- **GitHub Issues:** [github.com/relaya-chat/sdk/issues](https://github.com/relaya-chat/sdk/issues)
- **Discussions:** [github.com/relaya-chat/sdk/discussions](https://github.com/relaya-chat/sdk/discussions)
- **Email:** [hello@relaya.chat](mailto:hello@relaya.chat)

---

## Who Builds This

Relaya is built by [Jay Batson](https://github.com/batsonjay) — co-founder of [Acquia](https://acquia.com), operator of [Balearic FM](https://balearic-fm.com), and the developer who built Relaya when Apple rejected Cbox in the Balearic FM iOS app.

**The origin story in one sentence:** Got kicked off a radio platform, built Balearic FM, tried to embed a community chat in the iOS app, Apple said no, built Relaya.

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor license agreement and how to get started.

---

## License

MIT — see [LICENSE](./LICENSE).

> Commercial use is welcome and encouraged. A Contributor License Agreement (CLA) in `CONTRIBUTING.md` preserves the ability to maintain long-term project sustainability. By contributing, you agree to assign copyright to the project maintainer.
