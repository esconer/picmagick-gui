# Changelog

## Unreleased

- Fixed the `Malformed JSON body` toast after a page reload or EXIF date audit by
  sending a JSON body with bodyless POST requests.
- Fixed killed or failed AVIF encodes being reported as skipped and leaving a
  zero-byte output that later runs treated as complete. A killed encoder now
  reports its signal instead of an empty error.
- Added Linux x86_64 support alongside Windows, with native path separators and
  platform-aware case handling throughout scan, policy, sync and undo.
- Added verified download and update of the official ImageMagick x86_64 AppImage,
  including SHA-256 checks when available and an `APPIMAGE_EXTRACT_AND_RUN`
  fallback when FUSE is unavailable.
- Linux prefers a system ImageMagick 7 that can write AVIF and never shadows a
  working build with the AppImage.
- Added `zenity`/`kdialog` folder picking on Linux, with a typed-path fallback
  for headless sessions.
- Added `start.sh`, Linux setup documentation, and Windows + Linux CI checks.

## 1.0.0 - 2026-10-21

First public release.

- Local scan of a photo library with a cached folder tree and tri-state include/exclude controls.
- AVIF conversion through ImageMagick with a worker pool, graceful pause/resume and cancellation.
- Budget preview, sample-based size estimation, duplicate detection and an EXIF date audit.
- Post-conversion verification and manifest-based undo.
- Incremental sync of new, changed and already-converted files.
- Portable ImageMagick discovery, GitHub release checks, and verified in-app download/update.
- Page-load prompt when ImageMagick is missing, installing the latest portable Q16 build into `imagemagick/`.
- Header Quit button and `POST /api/shutdown`, refused while a conversion is running or paused.
- Read-only source handling and destination recursion checks.
