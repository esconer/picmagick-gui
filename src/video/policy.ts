/**
 * Video policy normalization, destination mode resolution (merge, subfolder, custom),
 * and worklist classification.
 */
import path from "node:path";

import { VIDEO_EXTS, extOf } from "../paths.ts";
import { CASE_INSENSITIVE, relTop } from "../platform.ts";
import type { ScannedFile, ScanResult } from "../scan.ts";
import {
  DEFAULT_VIDEO_FORMAT,
  VIDEO_FORMAT_SPECS,
  type AudioMode,
  type MaxFps,
  type MaxResolution,
  type VideoContainer,
  type VideoOutputFormat,
} from "./formats.ts";

export type VideoDestMode = "merge" | "subfolder" | "custom";

export type VideoPolicy = {
  // Folder & File Selection
  excludedFolders: string[];
  includedFolders: string[];
  excludedFiles: string[];
  includedFiles: string[];
  extEnabled: Record<string, boolean>;
  minSizeBytes: number;
  copyUndersized: boolean;

  // Destination Mode
  destMode: VideoDestMode;

  // Core Codec & Quality
  outputFormat: VideoOutputFormat;
  container: VideoContainer;
  quality: number;
  speed: number;

  // Tinkerer Knobs
  maxResolution: MaxResolution;
  maxFps: MaxFps;
  audioMode: AudioMode;
  tenBit: boolean;
  filmGrain: number;
  skipAlreadyEfficient: boolean;
  customParams: string;
};

export const DEFAULT_VIDEO_POLICY: VideoPolicy = {
  excludedFolders: [],
  includedFolders: [],
  excludedFiles: [],
  includedFiles: [],
  extEnabled: Object.fromEntries(VIDEO_EXTS.map((e) => [e, true])),
  minSizeBytes: 1024 * 1024, // 1 MB
  copyUndersized: true,

  destMode: "merge",
  outputFormat: DEFAULT_VIDEO_FORMAT,
  container: "mp4",
  quality: 60, // CRF 28
  speed: 6,    // Preset 6

  maxResolution: 0,
  maxFps: 0,
  audioMode: "auto",
  tenBit: true,
  filmGrain: 0,
  skipAlreadyEfficient: true,
  customParams: "",
};

export type VideoVerdict = "convert" | "copy" | "skip";

export type VideoDecision = {
  file: ScannedFile;
  verdict: VideoVerdict;
  reason: string;
};

export type VideoPreview = {
  convert: VideoDecision[];
  copy: VideoDecision[];
  skip: VideoDecision[];
  sourceBytes: number;
  estOutputBytes: number;
  estOutputFiles: number;
  compressionRatio: number;
  byFolder: {
    rel: string;
    convertCount: number;
    copyCount: number;
    convertBytes: number;
    copyBytes: number;
    estOutputBytes: number;
  }[];
};

export function normaliseVideoPolicy(p?: Partial<VideoPolicy>): VideoPolicy {
  const base = { ...DEFAULT_VIDEO_POLICY, ...(p ?? {}) };
  const extEnabled: Record<string, boolean> = {};
  for (const ext of VIDEO_EXTS) {
    extEnabled[ext] = base.extEnabled?.[ext] ?? true;
  }

  const cleanFolders = (v: string[] | undefined) => [
    ...new Set(
      (v ?? [])
        .filter((s) => typeof s === "string" && s.length > 0)
        .map((s) => s.replace(/[\\/]+$/, "")),
    ),
  ];
  const cleanFiles = (v: string[] | undefined) => [
    ...new Set((v ?? []).filter((s) => typeof s === "string" && s.length > 0)),
  ];

  return {
    ...base,
    excludedFolders: cleanFolders(base.excludedFolders),
    includedFolders: cleanFolders(base.includedFolders),
    excludedFiles: cleanFiles(base.excludedFiles),
    includedFiles: cleanFiles(base.includedFiles),
    extEnabled,
    minSizeBytes: Math.max(0, Math.round(Number(base.minSizeBytes) || 0)),
    copyUndersized: Boolean(base.copyUndersized),
    destMode: base.destMode === "subfolder" || base.destMode === "custom" ? base.destMode : "merge",
    outputFormat: base.outputFormat ?? DEFAULT_VIDEO_FORMAT,
    container: base.container ?? "mp4",
    quality: Math.max(20, Math.min(84, Math.round(Number(base.quality) || 60))),
    speed: Math.max(1, Math.min(10, Math.round(Number(base.speed) || 6))),
    maxResolution: [0, 2160, 1440, 1080, 720].includes(base.maxResolution as any)
      ? base.maxResolution
      : 0,
    maxFps: [0, 60, 30].includes(base.maxFps as any) ? base.maxFps : 0,
    audioMode: ["auto", "copy", "opus128", "opus64", "mute"].includes(base.audioMode)
      ? base.audioMode
      : "auto",
    tenBit: base.tenBit !== false,
    filmGrain: Math.max(0, Math.min(24, Math.round(Number(base.filmGrain) || 0))),
    skipAlreadyEfficient: base.skipAlreadyEfficient !== false,
    customParams: typeof base.customParams === "string" ? base.customParams.trim() : "",
  };
}

export function resolveVideoDestination(
  sourceRoot: string,
  photoDest: string,
  customDest: string,
  policy: VideoPolicy,
): string {
  const custom = customDest.trim();
  if (policy.destMode === "custom") {
    if (custom) return custom;
    const suffix = VIDEO_FORMAT_SPECS[policy.outputFormat].destinationSuffix;
    return `${sourceRoot.replace(/[\\/]+$/, "")}-${suffix}`;
  }
  if (policy.destMode === "subfolder") {
    return path.join(photoDest, "video");
  }
  const defaultSuffix = `${sourceRoot.replace(/[\\/]+$/, "")}-${VIDEO_FORMAT_SPECS[policy.outputFormat].destinationSuffix}`;
  if (custom && custom !== defaultSuffix) {
    return custom;
  }
  return photoDest;
}

export function videoOutputPathFor(
  decision: VideoDecision,
  sourceRoot: string,
  effectiveDest: string,
  policy: VideoPolicy,
): string {
  if (decision.verdict === "copy") {
    return path.join(effectiveDest, decision.file.rel);
  }

  const outExt = policy.outputFormat === "vp9" ? "webm" : policy.container;
  const dir = decision.file.dir === "." ? "" : decision.file.dir;
  const ext = path.extname(decision.file.name);
  const base = ext ? decision.file.name.slice(0, -ext.length) : decision.file.name;
  return path.join(effectiveDest, dir, `${base}.${outExt}`);
}

function pathMatches(a: string, b: string): boolean {
  return CASE_INSENSITIVE ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function folderInRules(rules: string[], dir: string): boolean {
  if (!dir || dir === ".") return false;
  for (const r of rules) {
    if (pathMatches(dir, r)) return true;
    if (
      dir.length > r.length &&
      (dir[r.length] === "/" || dir[r.length] === "\\") &&
      pathMatches(dir.slice(0, r.length), r)
    ) {
      return true;
    }
  }
  return false;
}

function fileInRules(rules: string[], rel: string): boolean {
  return rules.some((r) => pathMatches(rel, r));
}

function classifyVideo(
  file: ScannedFile,
  policy: VideoPolicy,
): { verdict: VideoVerdict; reason: string } {
  const rel = file.rel;
  const dir = file.dir === "." ? "" : file.dir;

  if (fileInRules(policy.includedFiles, rel)) {
    // Included explicitly
  } else if (fileInRules(policy.excludedFiles, rel)) {
    return { verdict: "skip", reason: "file-excluded" };
  } else if (folderInRules(policy.includedFolders, dir)) {
    // Included explicitly
  } else if (folderInRules(policy.excludedFolders, dir)) {
    return { verdict: "skip", reason: "folder-excluded" };
  }

  const ext = file.ext || extOf(file.name);
  if (policy.extEnabled[ext] === false) {
    return { verdict: "skip", reason: "ext-disabled" };
  }

  if (file.size < policy.minSizeBytes) {
    return policy.copyUndersized
      ? { verdict: "copy", reason: "undersized" }
      : { verdict: "skip", reason: "undersized-dropped" };
  }

  return { verdict: "convert", reason: "ok" };
}

export function applyVideoPolicy(
  scan: ScanResult,
  policyInput?: Partial<VideoPolicy>,
  ratio?: number,
): VideoPreview {
  const policy = normaliseVideoPolicy(policyInput);
  const effectiveRatio = ratio ?? VIDEO_FORMAT_SPECS[policy.outputFormat].defaultRatio;

  const convert: VideoDecision[] = [];
  const copy: VideoDecision[] = [];
  const skip: VideoDecision[] = [];

  for (const file of scan.files) {
    const ext = file.ext || extOf(file.name);
    // Ignore non-video files completely so the video preview plans strictly videos
    if (file.category !== "video" && !(VIDEO_EXTS as readonly string[]).includes(ext)) {
      continue;
    }

    const { verdict, reason } = classifyVideo(file, policy);
    const d: VideoDecision = { file, verdict, reason };
    if (verdict === "convert") convert.push(d);
    else if (verdict === "copy") copy.push(d);
    else skip.push(d);
  }

  const convertBytes = convert.reduce((a, d) => a + d.file.size, 0);
  const copyBytes = copy.reduce((a, d) => a + d.file.size, 0);
  const estOutputBytes = Math.round(convertBytes * effectiveRatio + copyBytes);
  const estOutputFiles = convert.length + copy.length;

  const folderMap = new Map<
    string,
    { convertCount: number; copyCount: number; convertBytes: number; copyBytes: number }
  >();

  const bump = (rel: string, key: "convert" | "copy", bytes: number) => {
    const top = relTop(rel);
    const e = folderMap.get(top) ?? {
      convertCount: 0,
      copyCount: 0,
      convertBytes: 0,
      copyBytes: 0,
    };
    if (key === "convert") {
      e.convertCount++;
      e.convertBytes += bytes;
    } else {
      e.copyCount++;
      e.copyBytes += bytes;
    }
    folderMap.set(top, e);
  };

  for (const d of convert) bump(d.file.rel, "convert", d.file.size);
  for (const d of copy) bump(d.file.rel, "copy", d.file.size);

  const byFolder = [...folderMap.entries()]
    .map(([rel, e]) => ({
      rel,
      convertCount: e.convertCount,
      copyCount: e.copyCount,
      convertBytes: e.convertBytes,
      copyBytes: e.copyBytes,
      estOutputBytes: Math.round(e.convertBytes * effectiveRatio + e.copyBytes),
    }))
    .sort((a, b) => b.estOutputBytes - a.estOutputBytes);

  return {
    convert,
    copy,
    skip,
    sourceBytes: convertBytes + copyBytes,
    estOutputBytes,
    estOutputFiles,
    compressionRatio: effectiveRatio,
    byFolder,
  };
}
