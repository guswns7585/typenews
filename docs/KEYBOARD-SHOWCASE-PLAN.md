# Keyboard Archive

Public product name: `아카이브`. The existing `/showcase` route and database identifiers remain internal names to avoid a needless migration.

Development branch: `feature/keyboard-showcase`.

## First release

- Up to 10 keyboards per account. Keep this limit configurable for larger collections.
- One representative image and one typing-sound recording per keyboard.
- Target image limit: 1600 px, 1.5 MB; audio: 30-45 seconds, 1 MB.
- Store files in object storage; keep metadata and object paths in Postgres.
- Build fields plus free-form description. KeyXIF image integration is deferred until an export or integration path for representative images is defined.
- Collection accessible through a profile tab and ordinary ID-based sharing links; no custom public slug required.
- Likes, bookmarks, reporting, owner editing, and moderator hiding.
- Generate a local PNG/WebP collage of selected keyboards. Include grid selection, ordering, image fit, captions, light/dark backgrounds, and optional author name.
- Reserve optional profile title, badge, and banner references without requiring the achievements system.

## Storage and access

- Enforce per-keyboard and per-account quotas on the server, not just in the browser.
- Owners can write only their own entries and storage paths using RLS.
- Validate actual file type and media limits, remove image metadata, and prepare thumbnails.
- Draft uploads remain private until published; clean up abandoned and deleted files.
- Load audio on explicit playback, use thumbnails in lists, paginate collections.
- Keep public collections separate from private typing text and local recording exports.

## Delivery

Implement this feature independently from `feature/longform-recording`. The initial branch was created at the existing HEAD; it does not contain the current checkout's uncommitted changes. Before development, bring in the reviewed security baseline without copying unfinished typing changes.

## Implementation status

- [x] Branch rebased to the deployed long-form/recording baseline.
- [x] Postgres schema, account quota, private Storage bucket, RLS and RPC write boundary.
- [x] Public gallery, detail view, first-time upload flow and optional typing-sound upload.
- [x] Likes, bookmarks, reports and moderator hide RPC.
- [x] Owner dashboard for editing, unpublishing and deleting existing keyboards.
- [x] Admin report queue with dismiss, hide and restore actions.
- [ ] KeyXIF-generated representative image integration (separate future scope).
- [x] Local PNG collage exporter for up to 10 selected keyboards.
- [x] Author-specific archive view linked from author names.
- [x] Search across keyboard names, build details and authors; newest/like/bookmark sorting.
- [x] Signed-in bookmark-only archive view.
- [x] Native share sheet with clipboard fallback on archive detail pages.
- [x] Customizable collage order, theme, image fit, captions and optional author name.
- [x] Local media previews and explicit removal of an existing typing-sound file.
- [x] Author-first personal archive space with introduction, collection stats and featured keyboard.
- [x] Owner-selectable mood, accent color, banner pattern and gallery/shelf layout.
- [x] Personal-space directory as the default archive view, with representative keyboards, search and activity/collection/like sorting.
- [x] Direct “my archive” entry points from account settings and the archive landing page.
- [x] Versioned media replacement with failed-upload cleanup that preserves currently published files.
