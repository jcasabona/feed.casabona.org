# Feed Poster: app spec (draft)

A native SwiftUI app for writing notes and photo posts to feed.casabona.org from iPhone and Mac. It commits content files to this repo, the same files Pages CMS writes today. The existing deploy and the Bluesky/Threads syndication do the rest.

Assumption: "iOS app" and "macOS app" mean one multiplatform SwiftUI app (iOS 17+, macOS 14+) sharing one codebase. Apple Watch voice notes are a later phase (see Future).

## Goals

- Post a note or a photo post in under 30 seconds.
- Never hit upload size limits: resize on-device before upload.
- Produce files byte-for-byte compatible with what the site and `scripts/syndicate.mjs` expect.
- Work offline: save locally, post when there's a connection.

## Non-goals (v1)

Editing or deleting existing posts, comments/analytics, posting YouTube/podcast/blog items (they come from feeds), multiple accounts.

## How publishing works today (what the app must match)

| Thing | Rule |
|---|---|
| Note file | `src/content/notes/<yyyy-MM-dd-HHmm>.md`, frontmatter `date: yyyy-MM-ddTHH:mm`, markdown body |
| Photo file | `src/content/photos/<yyyy-MM-dd-HHmm>.md`, frontmatter `date`, `images:` list of `image: /media/<file>` + `alt: <text>`, optional markdown caption |
| Media | `public/media/<file>`, referenced as `/media/<file>` |
| Date | Wall-clock time with no zone, always read as **America/New_York** (`src/lib/time.ts`), whatever the phone's time zone |
| Page URL | Built from the frontmatter `date` (`/notes/<slug>/`, `/photos/<slug>/`), so the file name must equal the date to the minute |
| Scheduling | Entries dated in the future stay hidden, and aren't syndicated, until their time |
| Publish | A push to `main` triggers `.github/workflows/deploy.yml`; the `syndicate` job posts to Bluesky/Threads after deploy |
| Hashtags | `#Tag` in the body links to `/tags/<tag>/` and becomes a Bluesky tag / Threads topic |

## v1 features

**Compose note:** multiline markdown text, live counter for the Bluesky limit (300 characters including the link), hashtag highlighting.

**Compose photo post:**
- Pick photos (iOS `PhotosPicker`; macOS picker plus drag-and-drop).
- Alt text per photo is required before posting.
- Optional caption.
- Warn above 4 photos: Bluesky posts only the first 4, Threads up to 20, the site shows all.

**Date/time:** defaults to now; optional "schedule for later" picker. Always formatted in America/New_York.

**Post:** one tap. Shows progress, then the live URL when the commit lands.

**Drafts and queue:** unsent posts are saved locally and retried automatically. Failed posts never lose text or photos.

**Recent posts:** read-only list from the repo's content folders, linking to the live pages.

**Settings:** GitHub token (Keychain), repo (`jcasabona/feed.casabona.org`), branch (`main`).

## Image handling

- Apply EXIF orientation, convert HEIC to JPEG, scale to 2000 px on the long edge, quality about 85 (about 150-450 KB each).
- **Strip location and other metadata** before upload; the repo is public.
- File names: lowercase, timestamp-based and unique (for example `20261010-0912-1.jpg`). Always lowercase `.jpg`, since case-sensitive extensions caused problems before.

## GitHub integration

- Use the Git Data API to make **one commit per post** (create blobs, create a tree, create a commit, update the `main` ref). That means one deploy per post, not one per image. Docs: https://docs.github.com/en/rest/git
- A note-only post can use the simpler Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`): https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
- Auth: fine-grained personal access token limited to this repo with Contents: read/write, stored in the Keychain. (Later: GitHub device-flow login.)
- If the ref update fails because `main` moved (the bot commits the feed cache hourly), refetch the head and retry.
- Commit message: `Add note <slug>` / `Add photo post <slug>`.

## Architecture

- `FeedKit` Swift package (shared by every target): models, markdown/frontmatter writer, New York date formatting, slug rules, image processor, GitHub client, offline queue. No UI.
- App target: SwiftUI, one codebase for iOS and macOS, platform-specific bits behind `#if os(...)`.
- macOS extras worth considering: global hotkey quick-note window, drop images on the Dock icon.
- Distribution: TestFlight for iOS and Mac (you have a developer account); App Store later if wanted.

## Testing

- Unit tests with golden files: generated note/photo files must match the real files already in `src/content/`.
- Date tests across time zones and DST (a phone set to Pacific time must still write New York wall-clock time).
- Image tests: HEIC input, large input, rotated input, metadata stripped, output under 1 MB.
- Contract test: run the generated files through `npm run build` in CI to prove the site accepts them.

## Future: Apple Watch voice note

- Watch app records dictation (or audio) and creates a note draft; no photos.
- Reuse `FeedKit` unchanged. The watch either posts directly (token shared via the shared keychain or WatchConnectivity) or hands the draft to the iPhone app to review and post.
- Decide then: post immediately vs. land as a draft for review. Dictation errors argue for review.
- To keep this easy, v1 must keep note creation behind a small `PostService` interface and keep `FeedKit` free of UI code.

## Open questions

1. Single multiplatform app with Universal Purchase, or separate iOS and Mac bundles? (Recommend one.)
2. Personal access token for v1, or device-flow login from the start? (Recommend token first.)
3. Should "post" always publish immediately, or have a "save draft to repo" mode? (Recommend immediate plus local drafts.)
4. App name and bundle ID.
5. Should the Mac app live in the menu bar for quick notes?
