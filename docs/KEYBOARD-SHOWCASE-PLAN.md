# Keyboard Showcase

Development branch: `feature/keyboard-showcase`.

## First release

- Up to 10 keyboards per account. Keep this limit configurable for larger collections.
- One representative image and one typing-sound recording per keyboard.
- Target image limit: 1600 px, 1.5 MB; audio: 30-45 seconds, 1 MB.
- Store files in object storage; keep metadata and object paths in Postgres.
- Build fields plus free-form description. KeyXIF URL/import should preserve an imported snapshot and allow manual edits; confirm the actual KeyXIF export format before implementing a parser.
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
