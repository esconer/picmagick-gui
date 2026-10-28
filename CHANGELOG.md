# Changelog

## 1.1.0 - 2026-10-28

- Added a seven-format output selector: JPEG XL, AVIF (still the default), WebP,
  HEIC, JPEG 2000, JPEG, and PNG. Quality and encoder-speed sliders change
  meaning per format, and formats the detected ImageMagick build cannot write
  are disabled. The selected format locks during a run and is recorded in each
  manifest and the **Runs** table.
- The destination follows the selected format's suffix (`-avif` → `-jxl`, …)
  only while it is still the previous format's default; a custom destination is
  never rewritten.
- Animated sources stay animated for JXL, AVIF, and WebP; HEIC, JPEG 2000,
  JPEG, and PNG write the first frame. JPEG transparency is blended onto white.
- Old-format outputs are never deleted automatically; **Sync** reports them as
  orphans.
- Fixed under-size files marked *copy* being renamed to `.avif` while still
  containing the original JPEG/PNG bytes. Copies now keep their original
  filename and extension.
- AVIF command, defaults, paths, health wording, and animated-GIF handling are
  unchanged; regression checks assert the exact pre-format behaviour.
- Added six themes, selectable from the header: Midnight (default), Daylight,
  Ink, Sepia, Nord, and Rose, plus Auto to follow the system light/dark
  preference. The choice is stored in the browser and applied before first
  paint.
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
- Added an Electrobun desktop app for Windows and Linux. It runs the same local
  server in a native window with Bun bundled, and the release workflow publishes
  per-platform installers plus update archives and metadata.
- Packaged runs keep the managed ImageMagick build and compare previews in the
  per-user app data folder. Source runs keep the existing project-root layout.
- CI now builds the desktop app on Windows and Linux, so packaging failures are
  caught before a release tag is pushed.

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
