/**
 * Speaker diarization backend trait. pyannote-3.1 reference HTTP client
 * provided. Also exposes `alignSpeakers()` — pure JS that takes
 * diarization segments + transcription words and produces a unified
 * timeline.
 */
import type { TranscriptionSegment } from "./transcription.js";

export interface DiarizationSegment {
  startSecs: number;
  endSecs: number;
  speaker: string;
}

export interface DiarizationRequest {
  audio: Uint8Array;
  /** Optional hint for expected number of speakers. */
  numSpeakers?: number;
}

export interface DiarizationResponse {
  segments: DiarizationSegment[];
  model?: string;
}

export interface DiarizationBackend {
  diarize(req: DiarizationRequest): Promise<DiarizationResponse>;
}

// ── pyannote sidecar HTTP client ──────────────────────────────────────

export interface PyannoteHttpOpts {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class PyannoteHttp implements DiarizationBackend {
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: PyannoteHttpOpts = {}) {
    this.baseUrl = opts.baseUrl ?? "http://pyannote:8001";
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async diarize(req: DiarizationRequest): Promise<DiarizationResponse> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(req.audio)]), "audio");
    if (req.numSpeakers) form.append("num_speakers", String(req.numSpeakers));
    const res = await this.fetchImpl(`${this.baseUrl}/diarize`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`pyannote: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { segments: Array<{ start: number; end: number; speaker: string }> };
    return {
      segments: data.segments.map((s) => ({ startSecs: s.start, endSecs: s.end, speaker: s.speaker })),
      model: "pyannote/speaker-diarization-3.1",
    };
  }
}

// ── alignment ─────────────────────────────────────────────────────────

/**
 * Attach a speaker label to each transcript segment by overlapping it
 * against the diarization timeline. The dominant overlap wins.
 */
export function alignSpeakers(
  transcript: TranscriptionSegment[],
  diarization: DiarizationSegment[],
): Array<TranscriptionSegment & { speaker: string }> {
  return transcript.map((t) => {
    const overlaps = new Map<string, number>();
    for (const d of diarization) {
      const overlap = Math.max(0, Math.min(t.endSecs, d.endSecs) - Math.max(t.startSecs, d.startSecs));
      if (overlap > 0) overlaps.set(d.speaker, (overlaps.get(d.speaker) ?? 0) + overlap);
    }
    let best = "UNKNOWN";
    let bestOverlap = 0;
    for (const [sp, ov] of overlaps) if (ov > bestOverlap) { bestOverlap = ov; best = sp; }
    return { ...t, speaker: best };
  });
}

/** Apply a user-supplied speaker label map. */
export function relabelSpeakers(
  segments: Array<TranscriptionSegment & { speaker: string }>,
  mapping: Record<string, string>,
): Array<TranscriptionSegment & { speaker: string }> {
  return segments.map((s) => ({ ...s, speaker: mapping[s.speaker] ?? s.speaker }));
}
