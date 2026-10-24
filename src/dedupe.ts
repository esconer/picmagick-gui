/**
 * Content-hash duplicate detection.
 *
 * Size + name matching alone produces false positives (WhatsApp re-exports,
 * camera bursts). MD5 of the bytes is decisive. Files are streamed in chunks so
 * a 65 MB RAW does not land in memory all at once.
 */
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import type { ScannedFile } from "./scan.ts";
import type { Policy } from "./policy.ts";
import { classify } from "./policy.ts";
import { relTop } from "./platform.ts";

export type DuplicateGroup = {
  hash: string;
  size: number;
  members: { rel: string; abs: string; size: number; category: string }[];
  /** rel paths of members that are inside excluded folders */
  spreadAcrossFolders: boolean;
};

export type DedupeResult = {
  groups: DuplicateGroup[];
  duplicateFiles: number;
  duplicateBytes: number;
  hashedFiles: number;
  hashedBytes: number;
  durationMs: number;
};

function hashFile(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("md5");
    const s = createReadStream(abs);
    s.on("data", (c) => h.update(c));
    s.on("error", reject);
    s.on("end", () => resolve(h.digest("hex")));
  });
}

/** Cheap pre-pass: only files sharing a byte size can possibly collide. */
export function candidatesBySize(files: ScannedFile[], policy: Policy): ScannedFile[] {
  const out: ScannedFile[] = [];
  const bySize = new Map<number, ScannedFile[]>();
  for (const f of files) {
    if (classify(f, policy).verdict === "skip") continue;
    if (f.size === 0) continue;
    const arr = bySize.get(f.size);
    if (arr) arr.push(f); else bySize.set(f.size, [f]);
  }
  for (const [, arr] of bySize) if (arr.length > 1) out.push(...arr);
  return out;
}

export async function findDuplicates(
  files: ScannedFile[],
  policy: Policy,
  opts: { maxHash?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<DedupeResult> {
  const started = Date.now();
  const maxHash = opts.maxHash ?? 40_000;
  const cands = candidatesBySize(files, policy).slice(0, maxHash);

  // Hash with a small concurrency cap; disk I/O bound anyway.
  const CONC = 8;
  const hashes = new Map<string, ScannedFile[]>();
  let hashedFiles = 0;
  let hashedBytes = 0;
  let cursor = 0;

  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (cursor < cands.length) {
        if (opts.signal?.aborted) return;
        const f = cands[cursor++];
        let hash: string;
        try {
          hash = await hashFile(f.abs);
        } catch {
          continue;
        }
        hashedFiles++;
        hashedBytes += f.size;
        const arr = hashes.get(hash);
        if (arr) arr.push(f); else hashes.set(hash, [f]);
        opts.onProgress?.(hashedFiles, cands.length);
      }
    }),
  );

  const groups: DuplicateGroup[] = [];
  let duplicateFiles = 0;
  let duplicateBytes = 0;

  for (const [hash, members] of hashes) {
    if (members.length < 2) continue;
    const size = members[0].size;
    const rels = members.map((m) => m.rel);
    const folders = new Set(rels.map((r) => relTop(r)));
    groups.push({
      hash,
      size,
      members: members.map((m) => ({
        rel: m.rel, abs: m.abs, size: m.size, category: m.category,
      })),
      spreadAcrossFolders: folders.size > 1,
    });
    duplicateFiles += members.length;
    duplicateBytes += size * (members.length - 1);
  }

  groups.sort((a, b) => (b.size * (b.members.length - 1)) - (a.size * (a.members.length - 1)));

  return {
    groups,
    duplicateFiles,
    duplicateBytes,
    hashedFiles,
    hashedBytes,
    durationMs: Date.now() - started,
  };
}