# Feeder: app spec

Feeder is a native SwiftUI app for writing notes and photo posts to feed.casabona.org from iPhone and Mac. It commits content files to this repo, the same files Pages CMS writes today. The existing deploy and the Bluesky/Threads syndication do the rest.

One multiplatform SwiftUI app (iOS 17+, macOS 14+) sharing one codebase. It works like the X or Bluesky app: write, tap Post, it's live. Apple Watch voice notes are a later phase (see Future).

## Goals

- Post a note or a photo post in under 30 seconds.
- Never hit upload size limits: resize on-device before upload.
- Produce files byte-for-byte compatible with what the site and `scripts/syndicate.mjs` expect.
- Work offline: save locally, post when there's a connection.

## Non-goals (v1)

Editing or deleting existing posts, scheduling posts for later, saved drafts, comments/analytics, posting YouTube/podcast/blog items (they come from feeds), multiple accounts.

## How publishing works today (what the app must match)

| Thing | Rule |
|---|---|
| Note file | `src/content/notes/<yyyy-MM-dd-HHmm>.md`, frontmatter `date: yyyy-MM-ddTHH:mm`, markdown body |
| Photo file | `src/content/photos/<yyyy-MM-dd-HHmm>.md`, frontmatter `date`, `images:` list of `image: /media/<file>` + `alt: <text>`, optional markdown caption |
| Media | `public/media/<file>`, referenced as `/media/<file>` |
| Date | Wall-clock time with no zone, always read as **America/New_York** (`src/lib/time.ts`), whatever the phone's time zone |
| Page URL | Built from the frontmatter `date` (`/notes/<slug>/`, `/photos/<slug>/`), so the file name must equal the date to the minute |
| Future dates | Entries dated in the future stay hidden until then; Feeder always posts with the current time |
| Publish | A push to `main` triggers `.github/workflows/deploy.yml`; the `syndicate` job posts to Bluesky/Threads after deploy |
| Hashtags | `#Tag` in the body links to `/tags/<tag>/` and becomes a Bluesky tag / Threads topic |

## v1 features

**Compose note:** multiline markdown text, live counter for the Bluesky limit (300 characters including the link), hashtag highlighting.

**Compose photo post:**
- Pick photos (iOS `PhotosPicker`; macOS picker plus drag-and-drop).
- Alt text per photo is required before posting.
- Optional caption.
- Warn above 4 photos: Bluesky posts only the first 4, Threads up to 20, the site shows all.

**Date/time:** always the moment you tap Post, formatted in America/New_York. No schedule picker.

**Post:** one tap, publishes immediately. Shows progress, then the live URL when the commit lands.

**Failed posts:** if there's no connection or the push fails, the post is kept locally and retried automatically (like X/Bluesky). Text and photos are never lost. There's no manual drafts feature.

**Recent posts:** read-only list from the repo's content folders, linking to the live pages.

**Settings:** GitHub token (Keychain), repo (`jcasabona/feed.casabona.org`), branch (`main`).

## Image handling

- Apply EXIF orientation, convert HEIC to JPEG, scale to 2000 px on the long edge, quality about 85 (about 150-450 KB each).
- **Strip location and other metadata** before upload; the repo is public.
- File names: lowercase, timestamp-based and unique (for example `20261010-0912-1.jpg`). Always lowercase `.jpg`, since case-sensitive extensions caused problems before.

## GitHub integration

- Use the Git Data API to make **one commit per post** (create blobs, create a tree, create a commit, update the `main` ref). That means one deploy per post, not one per image. Docs: https://docs.github.com/en/rest/git
- A note-only post can use the simpler Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`): https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
- Auth: fine-grained personal access token limited to this repo with Contents: read/write, entered once in Settings and stored in the Keychain. (A GitHub login flow can come later.)
- If the ref update fails because `main` moved (the bot commits the feed cache hourly), refetch the head and retry.
- Commit message: `Add note <slug>` / `Add photo post <slug>`.

## Architecture

- `FeedKit` Swift package (shared by every target): models, markdown/frontmatter writer, New York date formatting, slug rules, image processor, GitHub client, offline queue. No UI.
- App target: SwiftUI, one codebase for iOS and macOS, platform-specific bits behind `#if os(...)`.
- macOS: a menu bar item (`MenuBarExtra`) opens a quick-note window from anywhere, with an optional global hotkey. The main window handles photos; drop images on the Dock icon.
- Distribution: TestFlight for iOS and Mac (you have a developer account); App Store later if wanted.

## Testing

- Unit tests with golden files: generated note/photo files must match the real files already in `src/content/`.
- Date tests across time zones and DST (a phone set to Pacific time must still write New York wall-clock time).
- Image tests: HEIC input, large input, rotated input, metadata stripped, output under 1 MB.
- Contract test: run the generated files through `npm run build` in CI to prove the site accepts them.

## Future: Apple Watch voice note

- Watch app records dictation (or audio) and creates a note draft; no photos.
- Reuse `FeedKit` unchanged. The watch either posts directly (token shared via the shared keychain or WatchConnectivity) or hands the draft to the iPhone app to review and post.
- Decide then: post immediately (matching the rest of the app) or confirm the transcription on the watch first. Dictation errors argue for a confirm step.
- To keep this easy, v1 must keep note creation behind a small `PostService` interface and keep `FeedKit` free of UI code.

## Decisions

1. One app for iPhone and Mac.
2. GitHub personal access token for v1.
3. Posts publish immediately, like X or Bluesky; no scheduling or manual drafts.
4. Name: **Feeder**.
5. The Mac app has a menu bar quick-note item.

6. Bundle ID: `goodhouse.feeder` (same prefix as Daily Three).

## Build plan and starter prompt

Build in this order, one PR or commit group per step:
1. `FeedKit` package with tests: New York date formatting and slug rules, note and photo file writer (golden files from `src/content/`), image processor, GitHub client (Git Data API, retry on moved `main`), offline queue.
2. iOS app: Settings (token), compose note, compose photo post, post and progress, failed-post retry.
3. macOS: shared screens plus the menu bar quick-note.
4. Recent posts list.

Starter prompt for a new Claude Code session on the Mac:

> Build Feeder, a multiplatform SwiftUI app (iOS 17+, macOS 14+), following docs/app-spec.md in this repo. Start with the FeedKit Swift package and its tests (step 1 of the build plan), using the real files in src/content/ as golden fixtures. Don't start the UI until FeedKit's tests pass. Ask me before adding any third-party dependency.
