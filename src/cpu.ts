/**
 * Dynamic CPU detection, affinity masking, and process throttling.
 *
 * Allows bounding ImageMagick's processor utilization to a user-selected
 * percentage (default 70%, adjustable 10% - 100%) mid-run.
 */
import os from "node:os";
import { dlopen, FFIType } from "bun:ffi";

export function getTotalCpus(): number {
  return os.availableParallelism?.() ?? os.cpus().length ?? 1;
}

/**
 * Calculates a CPU affinity bitmask corresponding to the requested CPU percentage.
 *
 * For example, on an 8-thread system:
 *   70% -> 5 cores -> mask 0x1Fn (0b00011111)
 *   50% -> 4 cores -> mask 0x0Fn (0b00001111)
 *  100% -> 8 cores -> mask 0xFFn (0b11111111)
 */
export function calculateAffinityMask(percent: number, totalCpus = getTotalCpus()): bigint {
  const pct = Math.max(10, Math.min(100, Math.round(percent) || 70));
  if (pct >= 100) {
    return (1n << BigInt(totalCpus)) - 1n;
  }
  const allowed = Math.max(1, Math.min(totalCpus, Math.floor(totalCpus * (pct / 100))));
  return (1n << BigInt(allowed)) - 1n;
}

// Windows kernel32 dynamic bindings for process affinity
type Kernel32 = {
  symbols: {
    OpenProcess: (dwDesiredAccess: number, bInheritHandle: boolean, dwProcessId: number) => number | bigint | null;
    SetProcessAffinityMask: (hProcess: any, dwProcessAffinityMask: bigint) => boolean;
    CloseHandle: (hObject: any) => boolean;
  };
};

let k32: Kernel32 | null = null;

if (process.platform === "win32") {
  try {
    k32 = dlopen("kernel32.dll", {
      OpenProcess: {
        args: [FFIType.u32, FFIType.bool, FFIType.u32],
        returns: FFIType.ptr,
      },
      SetProcessAffinityMask: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.bool,
      },
      CloseHandle: {
        args: [FFIType.ptr],
        returns: FFIType.bool,
      },
    }) as unknown as Kernel32;
  } catch {
    k32 = null;
  }
}

// PROCESS_ALL_ACCESS = 0x1F0FFF (or PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION)
const PROCESS_AFFINITY_ACCESS = 0x1F0FFF;

/**
 * Applies CPU affinity and background process priority to a running process.
 * Can be called repeatedly on active processes to adjust CPU limits mid-run.
 */
export function applyProcessCpuLimit(pid: number | undefined, percent: number): boolean {
  if (!pid || pid <= 0) return false;
  let success = false;

  if (k32) {
    try {
      const mask = calculateAffinityMask(percent);
      const handle = k32.symbols.OpenProcess(PROCESS_AFFINITY_ACCESS, false, pid);
      if (handle) {
        success = Boolean(k32.symbols.SetProcessAffinityMask(handle, mask));
        k32.symbols.CloseHandle(handle);
      }
    } catch {
      // Fallback silently if OS denies affinity change
    }
  }

  try {
    // Set priority class to BELOW_NORMAL so the system stays responsive
    os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // Ignore priority errors
  }

  return success;
}
