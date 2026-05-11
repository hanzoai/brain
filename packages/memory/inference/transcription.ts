/**
 * Audio transcription backend trait. Concrete implementations talk to
 * Whisper / faster-whisper / whisper.cpp / cloud STT APIs.
 */

export interface TranscriptionSegment {
  startSecs: number;
  endSecs: number;
  text: string;
  /** Optional per-word timestamps from word-level alignment. */
  words?: Array<{ word: string; startSecs: number; endSecs: number }>;
}

export interface TranscriptionRequest {
  audio: Uint8Array;
  language?: string;
  /** Optional offset for chunked uploads. */
  startOffsetSecs?: number;
}

export interface TranscriptionResponse {
  segments: TranscriptionSegment[];
  language?: string;
  model?: string;
}

export interface TranscriptionBackend {
  transcribe(req: TranscriptionRequest): Promise<TranscriptionResponse>;
}

// ── Whisper-compatible HTTP client ─────────────────────────────────────

export interface WhisperHttpOpts {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class WhisperHttp implements TranscriptionBackend {
  private baseUrl: string;
  private apiKey?: string;
  private model: string;
  private fetchImpl: typeof fetch;

  constructor(opts: WhisperHttpOpts = {}) {
    this.baseUrl = opts.baseUrl ?? "http://whisper:8000";
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "whisper-1";
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async transcribe(req: TranscriptionRequest): Promise<TranscriptionResponse> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(req.audio)]), "audio");
    form.append("model", this.model);
    form.append("response_format", "verbose_json");
    if (req.language) form.append("language", req.language);
    const res = await this.fetchImpl(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
      body: form,
    });
    if (!res.ok) throw new Error(`whisper: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { segments?: Array<{ start: number; end: number; text: string }>, language?: string };
    const offset = req.startOffsetSecs ?? 0;
    return {
      segments: (data.segments ?? []).map((s) => ({
        startSecs: s.start + offset,
        endSecs: s.end + offset,
        text: s.text,
      })),
      language: data.language,
      model: this.model,
    };
  }
}
