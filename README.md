# picmagick-gui

A local, Windows-first GUI for converting a photo library to AVIF derivatives
without touching the originals. It scans a folder, lets you include or exclude
subfolders, previews the output size against a storage budget, converts with
ImageMagick, and verifies the results.

Everything runs on your machine. There is no account, no telemetry, and no
upload. The only network request the app makes is an optional check of the
official ImageMagick GitHub releases feed for portable-build updates.

## Requirements

- Windows 10 or 11
- [Bun](https://bun.sh) 1.1 or newer
- ImageMagick 7 with AVIF write support (the app can download a portable build)

## Quick start

Download the latest source archive from the GitHub Releases page, extract it,
then run:

```bat
bun install
start.bat
```

`start.bat` starts the local server, waits for it to answer, and opens
`http://127.0.0.1:5178` in your browser. Close the minimised **picmagick-gui**
window to stop the server, or use **Quit** in the header. Quit refuses while a
conversion is running or paused.

From a terminal:

```bash
bun install          # first time only
bun start            # then open http://127.0.0.1:5178
bun start:open       # same, but opens the browser
bun run dev          # hot reload while editing
```

Change the port with `PORT=6000 bun start` (PowerShell:
`$env:PORT=6000; bun start`).

The initial source folder is your Pictures folder, or your home folder if that
does not exist. Set it in the UI, or override the defaults with:

```bat
set PICMAGIK_SOURCE=D:\Photos
set PICMAGIK_DESTINATION=D:\Photos-avif
```

`PICMAGIK_DESTINATION` defaults to `<source>-avif`.

If ImageMagick is not installed but Bun is, the app starts, checks GitHub for
the latest portable build, and asks on page load whether to install it. Accepting
downloads the build into `imagemagick/` at the project root. You can also trigger
the same flow from the header pill or **Health → ImageMagick portable**.

| Command | Does |
|---|---|
| `bun start` | Start the server |
| `bun run typecheck` | TypeScript check |
| `bun run src/client.check.ts` | Check browser scripts for undefined identifiers |

## Portable ImageMagick and updates

The portable app is kept in `imagemagick/` at the project root. Two layouts are
recognised:

```
imagemagick/
  current.txt                                  <- written by the updater
  ImageMagick-7.1.2-34-portable-Q16-x64/       <- versioned install
    magick.exe
```

or an archive unzipped directly into the folder:

```
imagemagick/
  magick.exe
  ...
```

On page load the server asks the GitHub releases API for the newest
`7.1.2-*` release (cached for 10 minutes). If ImageMagick is missing, a prompt
asks whether to install the latest portable build into `imagemagick/`; choosing
**Not now** only dismisses it for that page load. If a newer portable Q16 build
exists for an installed copy, the header shows an update pill and a one-time
prompt asks whether to download it. The same check is available from
**Health → ImageMagick portable**.

Choosing download runs this sequence on the server:

1. fetches `ImageMagick-<version>-portable-Q16-<arch>.7z` from
   `github.com/ImageMagick/ImageMagick/releases`
2. extracts it to a staging folder (Windows `tar.exe`, or 7-Zip if installed)
3. runs the staged `magick.exe -version` and `-list format`, requiring the
   expected version and writable AVIF support
4. moves it to `imagemagick/ImageMagick-<version>-portable-Q16-<arch>/`, updates
   `current.txt`, and removes the previous install that this app created

A manual install is just as valid: download the portable Q16 archive from the
releases page and unzip it into `imagemagick/`. Existing folders are never
deleted unless they carry the updater's `.picmagik-managed` marker.

Updates are refused while a conversion is running or paused, because replacing
the binaries under live encoders is unsafe on Windows. If github.com cannot be
reached, the app keeps working with the installed copy and the panel says the
check is offline.

## What it does

**Scan.** One walk of the library builds a cached file list and a directory
tree. Everything after that reads the cache, so dragging a slider never
re-touches the disk.

**Source folder.** Type a path or use the folder picker at the top of the
Folders pane, then press Scan. The path is validated before anything else
happens:

- a folder that does not exist, or a path that is a file rather than a folder,
  is rejected with a plain explanation
- choosing a destination that would sit *inside* the new source is refused,
  since the mirror would recurse into its own output

Changing the source clears the server-side scan cache and every result derived
from it (preview, estimate, duplicates, dates, sync), so nothing from the old
library can leak into a new run.

**Plan.** Every file lands in exactly one bucket: `convert`, `copy`, or `skip`.

- `convert` - re-encode to AVIF
- `copy` - place verbatim into the output tree, original bytes preserved
- `skip` - leave alone

**Convert.** Runs `magick.exe` through a worker pool with per-process thread
pinning, streams progress over SSE, and can be paused or cancelled.

**Pause and resume.** Pause is *graceful*: it stops handing out new work but
lets encoders already in flight finish and land on disk, so nothing is left
half-written. Resume continues the same job from the first unprocessed file.

Resume never redoes a file. Two independent mechanisms guarantee that:

1. the job keeps a set of rel paths it has completed, and
2. the converter skips any output that already exists on disk

The second one means a resume still behaves correctly after a server restart,
which loses the first. Cancelling instead of resuming is fine too, since the
files already written stay on disk and get skipped next time.

A paused job survives closing the browser tab. Reopening re-attaches to it and
shows the Resume button, because the job lives in the server, not the page.

**Sync.** Compares input against output and reports what is new, what changed,
and what is already done, so the second run is cheap instead of a full re-do.

## Defaults

| Setting | Value | Why |
|---|---|---|
| Quality | `q60` | Good size/quality balance for archival derivatives |
| Resize | none | Full resolution kept for print and crop |
| Metadata | kept | `-strip` deliberately omitted |
| Encoder speed | `heic:speed=6` | Much faster than 5 for a small size increase |
| RAW | off | Toggle it on per-run if you want it |
| Animated GIF | preserved | ImageMagick 7.1.2 + libheif ≥1.20 writes animated AVIF |
| Min size | 1 MB | Under-size files are copied, not re-encoded |
| Jobs | 9 | Each job is one thread, so ~75% of a 12-thread CPU |

The exact command the converter runs:

```
magick <src> -auto-orient -colorspace sRGB -quality 60 -define heic:speed=6 AVIF:<out>
```

No `-strip`, no `-resize`, never `mogrify`.

### Encoder speed

aom's AV1 encoder is the whole cost. Representative q60 timings for a 24 MP
photo:

| speed | time | output | vs speed 5 |
|---|---|---|---|
| 4 | 51.2 s | 0.90 MB | same size, 2.6× slower than 5 |
| **5** | **18.2 s** | **0.90 MB** | byte-identical to 4, so it buys nothing |
| **6** | **4.6 s** | **1.03 MB** | **4× faster, +12% bytes - default** |
| 8 | 2.5 s | 1.05 MB | 7× faster, +14% bytes |
| 10 | 0.4 s | **0 bytes** | **broken: exits 0 and writes an empty file** |

Speed 5 sits at the worst point on the curve. 6 is the knee.

That zero-byte behaviour at 10 is why the converter treats an empty output as a
failure regardless of exit code, and why the UI caps the slider at 9.

## Feature notes

**Folder include/exclude.** The tree has tri-state checkboxes; a partly-excluded
folder shows as a dash. Excluding a folder excludes everything under it, since
exclusion is prefix-based. Only the folder itself is stored - never its
descendants - so the payload stays small regardless of tree depth.

Re-including a subfolder of an excluded parent records an explicit include
override rather than cancelling the parent's exclusion. Include always beats
exclude, so you can rescue one folder out of `backup` without quietly putting
the whole subtree back into the run.

Folders holding nothing convertible are badged so you can see them at a glance
rather than wondering why they contribute nothing.

**Under-size slider.** Skipping saves *time*, not space - a skipped file is
copied at its original size. Untick "copy under-size files" if you would rather
drop them entirely.

**Estimate.** Encodes a real stratified sample and measures the result instead
of trusting a guessed ratio. The measured ratio then becomes the flat ratio used
by the instant previews.

**Budget.** Set a cap and the panel tells you what fits, what does not, and which
folders to drop to get under it.

**Duplicates.** MD5 over content, pre-filtered by byte size. Avoids converting the
same photo three times.

**Dates.** EXIF audit: how many files carry a real capture date, how many are
recovered from the filename, and which are genuinely undated.

**Compare q.** Original next to q30/50/60/70/80 renders, so you can settle the
quality question with your eyes instead of a guess.

**Verify.** After a run, decode the outputs back and check they open, that
dimensions match the source, and that `DateTimeOriginal` survived. An encoder
exit code is not proof.

**Undo.** Every run writes a manifest. Undo removes exactly the files that run
created and refuses anything outside its own destination.

**Sync (incremental).** Reports `new` / `changed` / `up to date`, and offers to
convert only the pending ones. Changed is detected by the output file being
older than its source. Outputs with no matching source are reported as orphans
and never deleted automatically.

## Safety

1. The source tree is opened **read-only**. It is never written to or deleted from.
2. The destination may not sit inside the source. The server refuses to start a
   run that would recurse into its own output.
3. Existing outputs are skipped, so runs are restartable. Overwriting is opt-in.
4. Undo only deletes paths recorded in a manifest, and only inside that
   manifest's destination.
5. Only the scratch folder is ever removed automatically.
6. An empty output file is treated as a failure even when the encoder exits 0.
7. The in-browser original preview only serves image extensions, capped at
   64 MB, streamed from disk.
8. A killed encoder's truncated output is deleted, so it cannot be mistaken for
   a finished file on the next run.
9. A paused job blocks a new run until it is resumed or cancelled.
10. The ImageMagick updater writes only inside `imagemagick/`, fetches only the
    latest official GitHub release asset, and verifies the staged binary's
    version and AVIF support before replacing the current install. It refuses
    to run while a conversion is live.

## Performance notes

- `GET /api/status` and previews use `fs.statfs()` rather than shelling out to
  PowerShell, so free-space checks take microseconds instead of seconds.
- Scans read each directory once and cache the result for every later operation.
- The run panel emits an event when a file enters the encoder, so a long encode
  is visibly a long encode rather than a frozen UI.

## Unicode paths

Path matching folds to NFC and treats every slash-like character as `/`. A folder
name can contain **U+2044 FRACTION SLASH** instead of ASCII `/`; the two look
identical in most fonts, so a path typed or copied by hand can silently become a
different string.

Folding means such a mismatch shows up as "excluded" (visible) instead of
"converted anyway" (not visible). The scan also reports `riskyNames` so you can
see these folders. The tool never renames anything on its own.

## Layout

```
src/
  server.ts     routes, static, SSE hub, job registry
  scan.ts       one walk -> cached file list + directory tree
  policy.ts     selections -> convert | copy | skip
  convert.ts    magick.exe worker pool, cancel, per-file results
  jobs.ts       run lifecycle and progress events
  estimate.ts   stratified sample -> measured size + time projection
  sync.ts       new / changed / up-to-date analysis
  dedupe.ts     MD5 duplicate detection
  verify.ts     post-convert decode and dimension/EXIF checks
  meta.ts       identify, EXIF extraction, date recovery
  budget.ts     what fits under a cap, and what to cut
  manifest.ts   per-run record and precise undo
  health.ts     preflight checks
  paths.ts      magick discovery, path safety invariants
  imagemagick.ts GitHub release check, portable download and install
  version.ts    version parsing shared by discovery and updates
public/
  treelogic.js  pure tree logic (toggle, tri-state, include/exclude)
  index.html    layout
  app.js        wiring
  style.css
imagemagick/    portable ImageMagick (downloaded or placed by hand)
```

`imagemagick/` is intentionally ignored by Git: the portable build is large and
is downloaded on demand.

## API

| Route | Purpose |
|---|---|
| `GET /api/status` | Config, scan state, free space, sibling folders |
| `POST /api/config` | Set source, destination, budget, policy |
| `POST /api/validate` | Check a candidate source/destination pair |
| `POST /api/pick` | Native folder picker |
| `POST /api/scan` | Walk the library |
| `POST /api/preview` | Apply policy, return counts + budget + health |
| `POST /api/estimate` | Sample-based projection |
| `POST /api/sync` | New / changed / up-to-date |
| `POST /api/duplicates` | MD5 scan |
| `POST /api/dates` | EXIF audit |
| `POST /api/compare` | Quality ladder for one file |
| `POST /api/run` | Start a conversion |
| `GET /api/stream/:id` | SSE progress |
| `POST /api/pause/:id` | Graceful pause: stop dispatching, finish in flight |
| `POST /api/resume/:id` | Continue the same job from where it stopped |
| `GET /api/job/state?id=` | Snapshot for re-attaching after a refresh |
| `POST /api/cancel/:id` | Stop, or abandon a paused run |
| `GET /api/manifests` | Past runs |
| `POST /api/undo` | Remove a run's output |
| `GET /api/health` | Preflight |
| `POST /api/shutdown` | Stop the local server when no conversion is running |
| `GET /api/imagemagick` | Installed build + cached release info |
| `GET /api/imagemagick/check` | Check GitHub for a newer portable build |
| `GET /api/imagemagick/progress` | Download/extract/verify progress |
| `POST /api/imagemagick/install` | Download and install the latest portable build |
| `GET /api/source-file?rel=` | Read-only passthrough for the compare view |

## Out of scope

Video, by design. This tool handles still images only; `.mp4`, `.mov`, `.avi`
and other video extensions are classified and skipped.

Also out of scope: watch-folder auto-conversion and automatic deletion of files
in the destination that have no matching source.

## Privacy

- All scanning, conversion and verification happen locally.
- No analytics, telemetry or cloud calls.
- The only outbound request is the ImageMagick release check and, if you accept
  an update, the download from `github.com/ImageMagick/ImageMagick`.
- The app binds to `127.0.0.1` only.

## Releasing

The repository includes a GitHub Actions workflow that runs the checks and
attaches a source archive when a tag is pushed:

```bash
git tag v1.0.0
git push origin main --tags
```

## License

MIT. See [LICENSE](LICENSE).

ImageMagick is distributed under its own license; the app downloads the
official portable build rather than bundling it.
