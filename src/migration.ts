/**
 * Migration helper for upgrading from legacy picmagick-gui to Compakta.
 *
 * Ensures existing users do not lose downloaded ImageMagick or FFmpeg binaries,
 * or existing undo manifests, when the app data path changes to Compakta.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

export type MigrationSummary = {
  migratedMagick: boolean;
  migratedFfmpeg: boolean;
  migratedManifests: number;
};

/**
 * Returns candidate directory paths where older picmagick-gui releases
 * stored user state on Windows and Linux/macOS.
 */
export function getLegacyDataCandidates(appDataRoot?: string): string[] {
  const roaming = appDataRoot || process.env.APPDATA || "";
  const local = process.env.LOCALAPPDATA || "";
  const home = process.env.HOME || process.env.USERPROFILE || "";

  const candidates: string[] = [];

  if (roaming) {
    candidates.push(path.join(roaming, "picmagick-gui"));
    candidates.push(path.join(roaming, "PicMagick GUI"));
  }
  if (local) {
    candidates.push(path.join(local, "picmagick-gui"));
    candidates.push(path.join(local, "PicMagick GUI"));
    candidates.push(path.join(local, "com.github.esconer.picmagick-gui"));
  }
  if (home) {
    candidates.push(path.join(home, ".config", "picmagick-gui"));
    candidates.push(path.join(home, ".config", "PicMagick GUI"));
    candidates.push(path.join(home, ".local", "share", "picmagick-gui"));
    candidates.push(path.join(home, ".local", "share", "PicMagick GUI"));
    candidates.push(path.join(home, "Library", "Application Support", "picmagick-gui"));
    candidates.push(path.join(home, "Library", "Application Support", "PicMagick GUI"));
  }

  // De-duplicate paths
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of candidates) {
    const norm = path.resolve(c).toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(c);
    }
  }

  return unique;
}

/**
 * Migrate legacy managed binaries and manifests into targetDir if targetDir
 * does not already have them.
 */
export function migrateLegacyData(
  targetDir: string,
  candidateDirs?: string[],
): MigrationSummary {
  const candidates = candidateDirs ?? getLegacyDataCandidates();
  const summary: MigrationSummary = {
    migratedMagick: false,
    migratedFfmpeg: false,
    migratedManifests: 0,
  };

  const resolvedTarget = path.resolve(targetDir);

  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    if (path.resolve(candidate).toLowerCase() === resolvedTarget.toLowerCase()) continue;

    try {
      // 1. ImageMagick
      const oldMagick = path.join(candidate, "imagemagick");
      const targetMagick = path.join(targetDir, "imagemagick");
      const hasOldMagick = existsSync(oldMagick) && readdirSync(oldMagick).length > 0;
      const hasTargetMagick = existsSync(targetMagick) && readdirSync(targetMagick).length > 0;

      if (hasOldMagick && !hasTargetMagick) {
        mkdirSync(targetMagick, { recursive: true });
        cpSync(oldMagick, targetMagick, { recursive: true });
        summary.migratedMagick = true;
        console.log(`[compakta] Migrated ImageMagick from ${oldMagick} -> ${targetMagick}`);
      }

      // 2. FFmpeg
      const oldFfmpeg = path.join(candidate, "ffmpeg");
      const targetFfmpeg = path.join(targetDir, "ffmpeg");
      const hasOldFfmpeg = existsSync(oldFfmpeg) && readdirSync(oldFfmpeg).length > 0;
      const hasTargetFfmpeg = existsSync(targetFfmpeg) && readdirSync(targetFfmpeg).length > 0;

      if (hasOldFfmpeg && !hasTargetFfmpeg) {
        mkdirSync(targetFfmpeg, { recursive: true });
        cpSync(oldFfmpeg, targetFfmpeg, { recursive: true });
        summary.migratedFfmpeg = true;
        console.log(`[compakta] Migrated FFmpeg from ${oldFfmpeg} -> ${targetFfmpeg}`);
      }

      // 3. Manifests subdirectory if present
      const oldManifestsDir = path.join(candidate, "manifests");
      const targetManifestsDir = path.join(targetDir, "manifests");
      if (existsSync(oldManifestsDir)) {
        mkdirSync(targetManifestsDir, { recursive: true });
        const list = readdirSync(oldManifestsDir);
        for (const item of list) {
          const srcItem = path.join(oldManifestsDir, item);
          const dstItem = path.join(targetManifestsDir, item);
          if (!existsSync(dstItem)) {
            cpSync(srcItem, dstItem, { recursive: true });
            summary.migratedManifests++;
          }
        }
      }

      // 4. Loose manifest JSON files in root of candidate
      const entries = readdirSync(candidate, { withFileTypes: true });
      for (const ent of entries) {
        if (
          ent.isFile() &&
          (ent.name.startsWith(".picmagic-manifest-") || ent.name.startsWith(".compakta-manifest-"))
        ) {
          const srcFile = path.join(candidate, ent.name);
          const dstFile = path.join(targetDir, ent.name);
          if (!existsSync(dstFile)) {
            cpSync(srcFile, dstFile);
            summary.migratedManifests++;
          }
        }
      }
    } catch (err) {
      console.warn(`[compakta] Notice: Legacy data migration check for ${candidate} had error:`, err);
    }
  }

  return summary;
}
