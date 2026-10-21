# Changelog

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
