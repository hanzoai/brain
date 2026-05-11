/** Audio adapter — calls a TranscriptionBackend; optionally diarizes. */
import { renderVtt, renderSrt } from "../captions.js";
import type { TranscriptionBackend } from "../inference/transcription.js";
import type { DiarizationBackend } from "../inference/diarization.js";
import { alignSpeakers } from "../inference/diarization.js";
import type { ExtractionAdapter } from "./index.js";

export interface AudioAdapterOpts {
  transcription: TranscriptionBackend;
  diarization?: DiarizationBackend;
  language?: string;
}

export function makeAudioAdapter(opts: AudioAdapterOpts): ExtractionAdapter {
  return {
    strategy: "audio",
    async extract({ bytes, filename }) {
      const t = await opts.transcription.transcribe({ audio: bytes, language: opts.language });
      let segments = t.segments;
      let labelled: Array<typeof segments[number] & { speaker?: string }> = segments;
      if (opts.diarization) {
        const d = await opts.diarization.diarize({ audio: bytes });
        labelled = alignSpeakers(t.segments, d.segments);
      }
      const text = labelled.map((s) => {
        const sp = (s as { speaker?: string }).speaker;
        return sp ? `${sp}: ${s.text}` : s.text;
      }).join("\n");
      return {
        text: `# ${filename}\n\n${text}`,
        metadata: { language: t.language, segments: labelled.length },
        derived: [
          {
            filename: `${filename}.vtt`,
            mimeType: "text/vtt",
            bytes: new TextEncoder().encode(renderVtt(labelled.map((s) => ({
              startSecs: s.startSecs,
              endSecs: s.endSecs,
              text: s.text,
              speaker: (s as { speaker?: string }).speaker,
            })))),
            role: "captions-vtt",
          },
          {
            filename: `${filename}.srt`,
            mimeType: "application/x-subrip",
            bytes: new TextEncoder().encode(renderSrt(labelled.map((s) => ({
              startSecs: s.startSecs,
              endSecs: s.endSecs,
              text: s.text,
              speaker: (s as { speaker?: string }).speaker,
            })))),
            role: "captions-srt",
          },
        ],
      };
    },
  };
}
