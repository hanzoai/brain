/**
 * Hardware tier detection.
 *
 * Pure JS — looks at NODE-side `os` for CPU/mem, and optionally accepts
 * a user-provided GPU report. Returns a tier slug consumers can pass to
 * model selectors.
 */

import os from "node:os";

export type Tier = "edge" | "gpu-12gb" | "gpu-24gb" | "cpu-only";

export interface GpuInfo {
  vramGb?: number;
  name?: string;
}

export interface SystemReport {
  tier: Tier;
  cpuCount: number;
  totalRamGb: number;
  gpu?: GpuInfo;
}

export function detectHardware(gpu?: GpuInfo): SystemReport {
  const cpuCount = os.cpus()?.length ?? 1;
  const totalRamGb = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;
  return { tier: pickTier(gpu), cpuCount, totalRamGb, gpu };
}

export function pickTier(gpu?: GpuInfo): Tier {
  if (!gpu || !gpu.vramGb || gpu.vramGb === 0) return "cpu-only";
  if (gpu.vramGb >= 24) return "gpu-24gb";
  if (gpu.vramGb >= 12) return "gpu-12gb";
  return "edge";
}

/** Recommend models given a tier. Returns provider-qualified slugs. */
export function recommendModels(tier: Tier): { gen: string; embed: string; vision: string } {
  switch (tier) {
    case "cpu-only":
      return {
        gen: "ollama:qwen3.5:7b",
        embed: "ollama:nomic-embed-text",
        vision: "ollama:qwen3.5:7b",
      };
    case "edge":
      return {
        gen: "ollama:qwen3.5:9b",
        embed: "ollama:nomic-embed-text",
        vision: "ollama:qwen3.5:9b",
      };
    case "gpu-12gb":
      return {
        gen: "ollama:qwen3.5:9b",
        embed: "ollama:nomic-embed-text",
        vision: "ollama:qwen3.5:9b",
      };
    case "gpu-24gb":
      return {
        gen: "ollama:qwen3.5:27b",
        embed: "ollama:nomic-embed-text",
        vision: "ollama:qwen3.5:27b",
      };
  }
}
