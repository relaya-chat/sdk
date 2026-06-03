# Privacy & Data Handling — Information for Integrators

This document tells you, the developer integrating `@relaya-chat/react`, what user
data Relaya™ collects and processes on your behalf — so you can describe it
accurately in **your own** privacy policy.

> This is informational, not legal advice. You own your privacy policy; Relaya does
> not provide one for you. This page only describes what the SDK does so you know
> what to disclose.

## Who is responsible for what

When you embed Relaya in your app or site:

- **You are the data controller.** You decide to offer chat to your users and you
  govern the relationship with them.
- **Relaya is a data processor.** Relaya stores and processes chat data on your
  behalf, on its hosted infrastructure.

Your end users have no direct relationship with Relaya. Any data request (access,
deletion, etc.) they make should come to **you**, and you pass it to Relaya.

## What data Relaya collects because of this SDK

When your users sign in and chat through the Relaya widget, the following is sent to
and stored by Relaya (`api.relaya.chat`):

| Data | What it is | Why |
|---|---|---|
| Email address | Used to send the one-time sign-in code (OTP) | Authentication |
| Display / chat name | The name shown next to messages | Chat identity |
| Message content + metadata | Message text, timestamps, edit and deletion state | Chat history |
| Avatar selection | The avatar style a user picks | Chat identity |
| IP address | Checked transiently at sign-in and connection time for ban and country (geo) enforcement. **Not stored per message; not shown to space admins.** | Abuse prevention / compliance |
| Role & ban records | A user's assigned role and ban status | Moderation |

Relaya does **not** collect passwords (there are none — sign-in is by one-time code),
payment card data, phone numbers, or physical addresses through this SDK.

## Browser storage the SDK uses

- **Refresh token** — stored in the browser's `localStorage` under the key
  `relaya_refresh_token`. It persists across browser close/reopen and keeps the user
  signed in (33-day inactivity window). It is keyed to the Relaya widget's origin;
  your page's JavaScript cannot read it.
- **Access token** — held in JavaScript memory only; never written to storage.
- **No cookies.** The SDK sets no cookies of any kind. There is no third-party
  tracking, advertising, or analytics storage.

Because no cookies are used, **the Relaya widget does not, by itself, require you to
show a cookie-consent banner.** (Your own site may still need one for other reasons.)
Some privacy regimes treat functional `localStorage` similarly to cookies; the
`relaya_refresh_token` entry is strictly functional — it only keeps the user
signed in.

## Data retention

- **Chat message history** — retained for a period fixed by the space's Relaya
  subscription tier (up to 180 days).
- **Sign-in session** — the refresh token has a 33-day inactivity window; after that
  the user signs in again.
- **One-time codes (OTP)** — short-lived; expire shortly after they are issued.

## Where data is processed

Relaya runs on hosted infrastructure located in the United States. If your users are
in the EU, UK, or other regions, your privacy policy should address this
international transfer.

## What to put in your own privacy policy

A short, adaptable starting point:

> Our chat feature is provided by Relaya™. When you use chat, your email address
> (for sign-in), display name, messages, and avatar choice are processed and stored
> by Relaya on our behalf. Your IP address is checked at sign-in for abuse and
> regional controls but is not stored with your messages. Relaya keeps a sign-in
> token in your browser's local storage to keep you signed in; it does not use
> cookies or third-party tracking. Chat data is stored on Relaya's infrastructure in
> the United States. To request access to or deletion of your chat data, contact us.

Adapt this to your jurisdiction and combine it with the rest of your policy.

## Questions

Integrator questions about Relaya's data handling: hello@relaya.chat
