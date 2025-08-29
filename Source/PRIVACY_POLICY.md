# Privacy Policy for Gemini Enhancer

Last updated: August 29, 2025

## Overview

Gemini Enhancer is a Chrome extension that streamlines composing prompts on gemini.google.com. This policy explains what data the extension handles and how it is protected.

## What data we handle

- Slash commands you create: stored using Chrome’s `storage.sync` so they can optionally sync across your devices via your Google account. This data is managed by Chrome Sync, not sent to the developer.
- Draft text autosave: stored per‑URL in Chrome’s `storage.local` on your device so your message is restored after reloads or browser restarts.

We do not collect or receive: names, emails, chat transcripts, browsing history, IP addresses, analytics, or any other personal identifiers.

## How data is used

- All processing happens locally in your browser. Selected text and input content are used only to insert prompts into the chat box.
- Data is never transmitted to any developer‑controlled server. For `storage.sync`, Chrome may store a copy in your Google account for sync; it is encrypted in transit and can be end‑to‑end encrypted if you set a sync passphrase.

## Permissions and scope

- `host_permissions: *://gemini.google.com/*` — required to run the content script on Gemini pages only.
- `storage` — needed to save your slash commands (sync) and drafts (local).
- `activeTab` and `tabs` — used only to target the current Gemini tab and refresh UI state after direct user interaction. No reading of other sites.

The extension does not inject or load remote code, use dynamic imports from the network, or request additional origins.

## Data retention and control

- Slash commands persist until you edit or delete them in the popup or clear Chrome data.
- Drafts are overwritten as you type and may be automatically removed when the input becomes empty. You can also clear them by clearing site data or uninstalling the extension.

## Sharing

- No sale or sharing of data with third parties.
- No advertising, analytics, or tracking libraries.

## Children’s privacy

The extension is for general audiences and does not knowingly collect information from children under 13.

## Changes

If this policy changes, the "Last updated" date will be revised. Material changes will be reflected in the Web Store listing and repository.

## Contact

Questions? Use the developer contact information on the Chrome Web Store listing or the repository issue tracker.

## Summary

- No personal data collection or transmission to the developer
- Storage limited to user commands (sync) and drafts (local)
- Runs only on gemini.google.com with minimal permissions
