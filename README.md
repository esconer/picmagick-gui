# picmagick-gui

A local browser UI for converting a photo library to AVIF derivatives without
modifying the originals. It scans a folder, lets you include or exclude
subfolders, previews the output against a storage budget, converts with
ImageMagick, and records every run so it can be undone precisely.

Everything runs on your machine. There is no account, no telemetry, and no
upload. The only outbound requests are to GitHub for ImageMagick release checks
and, if you accept one, the ImageMagick download.

## Contents

- [Features](#features)
- [Platform support](#platform-support)
- [Requirements](#requirements)
- [Install and run](#install-and-run)
- [Configuration](#configuration)
- [Using the app](#using-the-app)
- [Defaults](#defaults)
- [ImageMagick](#imagemagick)
- [Safety](#safety)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Project layout](#project-layout)
- [Local API](#local-api)
- [Privacy](#privacy)
- [Out of scope](#out-of-scope)
- [Contributing](#contributing)
- [Releasing](#releasing)
- [License](#license)

## Features

- **Local and private.** The server binds to `127.0.0.1`; photos are read from
  disk and outputs are written to disk. Nothing is uploaded.
- **Folder-level control.** A cached directory tree with tri-state
  include/exclude selection. An explicit include overrides an excluded parent.
- **A real plan before a long run.** Every file is classified as `convert`,
  `copy`, or `skip`, with a storage-budget projection and a measured sample
  estimate.
- **Safe conversion.** ImageMagick runs in a worker pool. Pause is graceful,
  resume continues from the first unfinished file, and cancelling leaves valid
  completed files on disk.
- **Useful audits.** Duplicate detection, EXIF date reporting, and a visual
  quality comparison.
- **Restartable runs.** Existing outputs are skipped, and a paused job lives in
  the server rather than the browser tab.
- **Precise undo.** Each run writes a manifest. Undo deletes only files created
  by that run and refuses paths outside its destination.
- **Managed ImageMagick.** The app can download and verify the official
  portable build on Windows or the official AppImage on Linux.
- **First-class Windows and Linux support.** Native paths, folder pickers, and
  launchers on both platforms.

## Platform support

| | Windows | Linux |
|---|---|---|
| Supported versions | Windows 10 or 11 | Linux |
| Launcher | `start.bat` | `start.sh` |
| Folder picker | Native PowerShell dialog | `zenity` or `kdialog`; typed-path fallback |
| ImageMagick | Portable Q16 build or system install | System ImageMagick 7 or official AppImage |
| Automatic ImageMagick download | Yes (portable Q16) | Yes on x86_64 (AppImage) |
| Stop the server | **Quit** or close the minimised server window | **Quit** or `Ctrl+C` in the terminal |
| CI | Windows check | Linux check |

Linux on non-x86_64 architectures works when ImageMagick 7 with AVIF write
support is installed. The automatic AppImage installer is x86_64 only.
macOS is not officially supported.

## Requirements

- [Bun](https://bun.sh) 1.1 or newer.
- ImageMagick 7 with AVIF write support. Linux requires ImageMagick 7; Windows
  should use ImageMagick 7 as well.
- A current browser.
- Enough free disk space for the output tree.

The app has no separate build step. Bun runs the TypeScript server and serves
the browser files directly.

ImageMagick must be able to **write** AVIF. Check it with:

```bash
magick -list format | grep AVIF    # Linux
magick -list format | findstr AVIF # Windows
```

A usable build shows `AVIF rw+`. A build showing `r` or `r--` can read AVIF but
cannot encode it. The app's **Health** panel reports the same information.

If no usable ImageMagick build is found, the app can install a managed build
into `imagemagick/` at the project root. On Linux, a build that cannot write
AVIF also triggers the AppImage offer.

## Install and run

Download the latest source archive from the
[Releases page](https://github.com/esconer/picmagick-gui/releases), or clone the
repository:

```bash
git clone https://github.com/esconer/picmagick-gui.git
cd picmagick-gui
```

### Windows

1. Install Bun if it is not already available. In PowerShell:

   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

   Open a new terminal afterwards so `bun` is on `PATH`.

2. Install the small set of project dependencies:

   ```bat
   bun install
   ```

3. Start the app by double-clicking `start.bat`, or from a terminal:

   ```bat
   start.bat
   ```

`start.bat` starts the server in a detached, minimised window, waits for it to
answer, and opens `http://127.0.0.1:5178`. Close that minimised
**picmagick-gui** window to stop the server, or use **Quit** in the page header.

### Linux

1. Install Bun if it is not already available:

   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

   Open a new terminal afterwards so `bun` is on `PATH`.

2. Install dependencies and start the launcher:

   ```bash
   bun install
   chmod +x start.sh
   ./start.sh
   ```

`start.sh` runs the server in the foreground and opens
`http://127.0.0.1:5178` with `xdg-open`. Use **Quit** in the page header or
press `Ctrl+C` in the terminal to stop it. In a headless session, open the URL
manually.

If `zenity` or `kdialog` is installed, the folder buttons open a native picker.
Without either, type the path directly into the source or destination field.

### Terminal, either platform

```bash
bun install       # first time, or after dependency changes
bun start         # open http://127.0.0.1:5178 yourself
bun start:open    # start and open the browser
bun run dev       # hot-reload the server while editing
```

To use a different port:

```bash
PORT=6000 bun start
```

```powershell
$env:PORT=6000; bun start
```

```bat
set PORT=6000 && bun start
```

`start.bat` assumes the default port `5178`. For a custom port on either
platform, start with `bun start` or `bun start:open` instead of the launcher
scripts.

The server listens on `127.0.0.1` only. It is not exposed to your network and
has no login because it is designed to run on the same machine as the browser.

## Configuration

The first launch uses these defaults:

| Setting | Default |
|---|---|
| Source folder | `~/Pictures`, or the home folder if that does not exist |
| Destination | `<source>-avif` |
| Budget | 10 GB |
| Port | `5178` |

You can change the source and destination in the UI, or set startup defaults
with environment variables:

```bat
set PICMAGIK_SOURCE=D:\Photos
set PICMAGIK_DESTINATION=D:\Photos-avif
start.bat
```

```powershell
$env:PICMAGIK_SOURCE = "D:\Photos"
$env:PICMAGIK_DESTINATION = "D:\Photos-avif"
bun start:open
```

```bash
export PICMAGIK_SOURCE="$HOME/Pictures"
export PICMAGIK_DESTINATION="$HOME/Pictures-avif"
bun start:open
```

`PICMAGIK_DESTINATION` defaults to the source path with `-avif` appended.
Source, destination, budget, and conversion policy are kept in server memory
for the current session. Restarting the server restores these defaults; use the
environment variables when you want a persistent starting point.

## Using the app

1. **Choose the source and destination.** Type both paths, or use the
   **Browse…** buttons where a native picker is available. The destination must
   be outside the source; the app refuses a destination nested inside the
   source because the mirror would recurse into its own output.

2. **Press Scan.** One walk of the library builds the file list and folder
   tree. Later views reuse that cache.

3. **Choose folders and file types.** Use the tree checkboxes to include or
   exclude folders. A partly excluded folder shows a dash. Excluding a parent
   excludes its descendants; re-including a child creates an explicit include
   override. Source-type toggles control which extensions are eligible. RAW is
   off by default and can be enabled in the settings.

4. **Review the plan.** Each file ends up in one bucket:

   - `convert` — encode to AVIF
   - `copy` — copy the original bytes unchanged
   - `skip` — leave it out

   Files below the minimum size are copied by default; clear **copy under-size
   files** to skip them instead. The budget card shows what fits. **Estimate**
   encodes a real sample instead of guessing a compression ratio. **Duplicates**
   finds identical content by size and MD5. **Dates** reports how many files
   have a real EXIF capture date, a recovered date, or no date. **Compare q**
   shows the original beside several AVIF quality levels.

5. **Start the conversion.** Quality, parallel jobs, and encoder speed are in
   the settings pane. **Overwrite** is opt-in; otherwise existing outputs are
   skipped. **Only new** restricts a run to files that sync reports as pending.

6. **Pause, resume, or cancel.** Pause is graceful: no new work is handed out,
   but encoders already in flight finish and land on disk. Resume continues the
   same job from the first unfinished file. Cancelling keeps completed outputs,
   which are skipped on the next run. A paused job survives closing the browser
   tab; reopening the page reattaches to it.

7. **Verify, sync, and undo.** The local API can verify a finished run by
   decoding outputs and checking dimensions and `DateTimeOriginal`. **Sync**
   reports new, changed, and up-to-date files, plus orphan outputs without
   matching sources. **Runs** lists previous manifests and provides undo.

### Pause and restart safety

Resume never redoes a file. The server keeps a set of completed relative paths,
and the converter also skips outputs that already exist on disk. The second
check means a resume still works after a server restart, when the in-memory job
list is gone.

A paused job blocks a new run until it is resumed or cancelled. Existing files
in the destination are never deleted automatically.

## Defaults

| Setting | Default | Notes |
|---|---|---|
| Quality | `q60` | Good size/quality balance for archival derivatives |
| Resize | none | Full resolution kept for print and crop |
| Metadata | kept | `-strip` deliberately omitted |
| Encoder speed | `heic:speed=6` | Much faster than 5 for a small size increase |
| RAW | off | Toggle it on per-run if you want it |
| Animated GIF | preserved | ImageMagick 7.1.2 + libheif ≥1.20 writes animated AVIF |
| Min size | 0 MB | Convert every file; raise it to copy or drop small files |
| Jobs | 2 | Safe default for high-resolution images; raise it for ordinary photos |
| Quality | 60 | AVIF quality slider range is 20–90 |
| Resize | none | Full resolution is kept |
| Metadata | kept | `-strip` is deliberately omitted |
| Encoder speed | 6 | `heic:speed=6` |
| RAW | off | Enable per run if needed |
| Animated GIF | preserved | **Flatten GIF** is optional |
| Minimum size | 1 MB | Smaller files are copied by default |
| Parallel jobs | 9 | Each job is one thread |
| Budget | 10 GB | Preview and planning target |

The converter runs the equivalent of:

```bash
magick <source> -auto-orient -colorspace sRGB -quality 60 -define heic:speed=6 AVIF:<output>
```

There is no `-strip`, no resize, and no `mogrify`. Originals are never written
to.

### Why quality 60 and encoder speed 6

aom's AV1 encoder dominates the conversion time. Representative q60 timings for
a 24 MP photo:

| Speed | Time | Output | Compared with speed 5 |
|---|---|---|---|
| 4 | 51.2 s | 0.90 MB | Same size, 2.6× slower |
| 5 | 18.2 s | 0.90 MB | Byte-identical to 4 |
| **6** | **4.6 s** | **1.03 MB** | **4× faster, +12% bytes — default** |
| 8 | 2.5 s | 1.05 MB | 7× faster, +14% bytes |
| 10 | 0.4 s | 0 bytes | Broken: exits 0 and writes an empty file |

Speed 6 is the knee of the curve. The UI caps the slider at 9, and the converter
treats an empty output file as a failure regardless of the encoder's exit code.

## ImageMagick

On startup the app searches for a usable ImageMagick build. Builds in
`imagemagick/` in the project root are preferred. On Linux, the app only offers
an automatic AppImage download when no system ImageMagick 7 with AVIF write
support is available; it will not replace a working system build.

If no usable build exists, the page shows an ImageMagick prompt. On Linux, a
build that cannot write AVIF also triggers the AppImage offer. Accepting it
downloads a managed build into `imagemagick/`. The same flow is available from
**Health → ImageMagick** and the header update pill.

### Windows portable build

The updater downloads the official portable Q16 archive for the current CPU
from the
[ImageMagick releases page](https://github.com/ImageMagick/ImageMagick/releases).
Windows 10+ includes `tar.exe`, which can unpack 7z archives; a normal 7-Zip
installation is also supported. The staged `magick.exe` is run and checked for
the expected version and writable AVIF support before it replaces anything.

A managed install looks like:

```text
imagemagick/
  current.txt
  ImageMagick-7.1.2-34-portable-Q16-x64/
    magick.exe
```

Unzipping the archive contents directly into `imagemagick/` also works:

```text
imagemagick/
  magick.exe
  ...
```

The updater removes only folders it created (marked with
`.picmagik-managed`) and stale backups. Hand-placed folders are left alone.

### Linux: system build or AppImage

Linux requires ImageMagick 7. The app looks in the project’s `imagemagick/`
folder, then common locations such as `~/.local/bin`, `/usr/local/bin`,
`/usr/bin`, `/snap/bin`, `/opt/ImageMagick/bin`, and finally `PATH`.

**Under-size slider.** The default is `0`, so every file is converted. Raising
it saves *time*, not space - a skipped file is copied at its original size.
Untick "copy under-size files" if you would rather drop them entirely.
If the system build is missing or cannot write AVIF, the app can install the
official x86_64 AppImage. The `gcc` build is preferred because it has the widest
glibc compatibility; the `clang` build is used when no `gcc` asset is available.
The download is checked against GitHub’s SHA-256 digest when supplied, checked
for the expected byte count, made executable, and tested for AVIF write support
before it is installed.

A managed AppImage looks like:

```text
imagemagick/
  current.txt
  .picmagik-appimage.json
  ImageMagick-7.1.2-34-gcc-x86_64.AppImage
```

**Cloud storage budget planning.** Set a target and the panel tells you what
fits, what does not, and which folders to drop to get under it.
A manually downloaded AppImage also works. Make it executable, place it in
`imagemagick/`, and press **Check again**. The newest AppImage in that folder is
discovered by filename.

AppImages normally need FUSE. If FUSE is unavailable, the app retries the first
run with `APPIMAGE_EXTRACT_AND_RUN=1` and keeps that setting for later
conversion workers. For a manual test:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./imagemagick/ImageMagick-*.AppImage -version
```

Automatic AppImage installs are x86_64 only. On other architectures, install
ImageMagick 7 with AVIF support from your distribution.

### Update checks

On page load the server asks GitHub for the latest official ImageMagick release
and caches the answer for 10 minutes. If a newer managed build exists, the
header shows an update pill and a one-time prompt offers the download. Choosing
**Not now** dismisses that version; it can be checked again from **Health**.

Updates are refused while a conversion is running or paused, and while another
ImageMagick download is in progress. If GitHub is unreachable, the app keeps
using the installed build and reports the check as offline.

## Safety

1. The source tree is opened read-only and is never written to or deleted from.
2. The destination may not be the source folder or sit inside it.
3. Existing outputs are skipped unless **Overwrite** is enabled.
4. Undo only removes paths recorded in a manifest and only inside that
   manifest’s destination.
5. Only the temporary scratch folder is removed automatically.
6. An empty output file is a failure even when the encoder exits successfully.
7. A killed encoder’s partial output is deleted so the next run cannot mistake
   it for a finished file.
8. A paused job blocks a new run until it is resumed or cancelled.
9. The original-preview route serves only image extensions and caps files at
   64 MB.
10. The ImageMagick updater writes only inside `imagemagick/`, trusts only the
    latest official GitHub release asset, and verifies the staged binary before
    replacing the current install.
11. **Quit** is refused while a conversion is running or paused, or while an
    ImageMagick download is in progress.

## Troubleshooting

### ImageMagick is missing or read-only

Run the format check shown in [Requirements](#requirements). On Linux, the
distribution may still ship ImageMagick 6; use a current ImageMagick 7 package
or the AppImage. On Windows, install the portable build when the page offers it, or unzip it
into `imagemagick/` manually.

### Windows

- **`bun` is not recognized.** Install Bun and open a new terminal. `start.bat`
  prints the official install command if Bun is missing.
- **The ImageMagick download cannot extract.** Make sure `tar.exe` is available
  (Windows 10 or newer) or install 7-Zip. You can always unzip the portable
  archive into `imagemagick/` yourself.
- **The folder picker does not open.** PowerShell may be restricted. Type the
  path directly into the field instead.
- **The browser does not open.** Visit `http://127.0.0.1:5178` manually. The
  server may still be starting; watch the minimised window for errors.

### Linux

- **`Permission denied` when starting.** Run `chmod +x start.sh` once.
- **No folder picker appears.** Install `zenity` or `kdialog`, or type the path
  directly. The picker also needs a desktop session.
- **ImageMagick 7 is installed but AVIF is read-only.** Install the AVIF/libheif
  support for your distribution, or use the official AppImage.
- **The AppImage fails to mount.** The app automatically retries with
  `APPIMAGE_EXTRACT_AND_RUN=1`. You can also install FUSE 2 if your
  distribution provides it, or run the AppImage manually with that environment
  variable.
- **The browser does not open.** `xdg-open` needs a desktop session. Open
  `http://127.0.0.1:5178` manually, or use `bun start` instead of
  `bun start:open`.
- **ARM64 or another non-x86_64 architecture.** Automatic AppImage installs are
  unavailable. Install ImageMagick 7 with AVIF support from your distribution.

### Both platforms

- **Port 5178 is already in use.** Stop the old server, or start on another
  port with `PORT=6000 bun start` (see [Install and run](#install-and-run)).
- **The ImageMagick update check is offline.** The app can still convert with
  the installed build. Check your network, proxy, or GitHub access.
- **A paused job blocks a new run.** Resume or cancel the paused job first.

## Development

```bash
bun install
bun run dev
```

`bun run dev` starts the server with hot reload. Open
`http://127.0.0.1:5178` after it starts.

Useful checks:

| Command | Purpose |
|---|---|
| `bun run typecheck` | TypeScript check |
| `bun run src/client.check.ts` | Undefined identifiers and missing element IDs in browser scripts |
| `bun run src/platform.check.ts` | Cross-platform path, AppImage, and safety checks |
| `bun run check` | Run all of the above |

GitHub Actions runs the checks on both Windows and Linux. The release workflow
also runs the checks and creates a source archive when a `v*` tag is pushed.

## Project layout

```text
src/
  server.ts       routes, static files, SSE, job registry
  scan.ts         one walk -> cached file list and directory tree
  policy.ts       selections -> convert | copy | skip
  convert.ts      ImageMagick worker pool, cancel, per-file results
  jobs.ts         run lifecycle and progress events
  estimate.ts     stratified sample -> measured size and time projection
  sync.ts         new / changed / up-to-date analysis
  dedupe.ts       MD5 duplicate detection
  verify.ts       decode and check dimensions / EXIF after a run
  meta.ts         identify, EXIF extraction, date recovery
  budget.ts       what fits under a cap, and what to cut
  manifest.ts     per-run record and precise undo
  health.ts       preflight checks
  platform.ts     OS constants and native path helpers
  paths.ts        ImageMagick discovery and path safety
  imagemagick.ts  release checks, portable/AppImage install and update
  version.ts      version parsing shared by discovery and updates
public/
  index.html      layout
  app.js          UI wiring
  treelogic.js    pure tree logic
  style.css       styling
imagemagick/      managed ImageMagick (downloaded or placed by hand)
start.bat         Windows launcher
start.sh          Linux launcher
```

`imagemagick/` is intentionally ignored by Git because the downloaded build is
large and is fetched on demand.

## Local API

The browser talks to a small JSON API on the same local server. It is internal,
has no authentication, and should only be reachable on `127.0.0.1`. POST routes
expect a JSON object; send `{}` when there are no fields.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/status` | Config, scan state, free space, available projects |
| `POST` | `/api/config` | Set source, destination, budget, policy |
| `POST` | `/api/validate` | Check a candidate source/destination pair |
| `POST` | `/api/pick` | Open the native folder picker |
| `POST` | `/api/scan` | Walk the library |
| `POST` | `/api/preview` | Apply policy; return counts, budget, and health |
| `POST` | `/api/estimate` | Measured sample projection |
| `POST` | `/api/sync` | New / changed / up-to-date analysis |
| `POST` | `/api/duplicates` | MD5 duplicate scan |
| `POST` | `/api/dates` | EXIF date audit |
| `POST` | `/api/compare` | Quality ladder for one file |
| `POST` | `/api/run` | Start a conversion |
| `GET` | `/api/stream/:id` | SSE progress stream |
| `POST` | `/api/pause/:id` | Graceful pause |
| `POST` | `/api/resume/:id` | Continue a paused job |
| `GET` | `/api/job/state?id=` | Snapshot for reattaching after a refresh |
| `POST` | `/api/cancel/:id` | Cancel a running or paused job |
| `POST` | `/api/verify` | Verify a finished run |
| `GET` | `/api/manifests` | Previous runs |
| `POST` | `/api/undo` | Remove a run’s output |
| `GET` | `/api/health` | Preflight checks |
| `POST` | `/api/shutdown` | Stop the local server when idle |
| `GET` | `/api/imagemagick` | Installed build and cached release info |
| `GET` | `/api/imagemagick/check` | Check GitHub for a newer build |
| `GET` | `/api/imagemagick/progress` | Download / verify / install progress |
| `POST` | `/api/imagemagick/install` | Download and install the latest managed build |
| `GET` | `/api/source-file?rel=` | Read-only source file for the compare view |

## Privacy

- All scanning, conversion, and verification happen locally.
- There are no analytics, telemetry, accounts, or cloud calls.
- The only outbound requests are the ImageMagick release check and an optional
  ImageMagick download, both to GitHub (`api.github.com` and
  `github.com/ImageMagick/ImageMagick`).
- The web server binds to `127.0.0.1` only.

## Out of scope

- Video. This is a still-image tool; video extensions are classified and
  skipped.
- Automatic deletion of destination files that have no matching source.
- Watch-folder auto-conversion.
- Automatic ImageMagick downloads on Linux ARM64 or macOS.
- macOS support.

## Contributing

Keep each change focused. Create a branch from `main`, make the change, run
`bun run check`, and open a pull request. Changes that affect path handling or
ImageMagick discovery should pass both the Windows and Linux CI jobs.

## Releasing

Push a version tag to trigger the release workflow:

```bash
git tag v1.0.0
git push origin main --tags
```

The workflow runs its checks on Windows, builds
`picmagick-gui-<tag>.zip` from the repository, and attaches it to the GitHub
release.

## License

MIT. See [LICENSE](LICENSE).

ImageMagick is distributed under its own license. This project downloads the
official build rather than bundling it.
