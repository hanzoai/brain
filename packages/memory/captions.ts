/**
 * Caption / subtitle rendering from time-coded segments.
 *
 * Supports WebVTT (W3C), SRT (SubRip), and RTTM (NIST diarization).
 */

export interface CaptionSegment {
  startSecs: number;
  endSecs: number;
  text: string;
  /** Optional speaker label (used for diarization-aware output). */
  speaker?: string;
}

// ── WebVTT ─────────────────────────────────────────────────────────────

export function renderVtt(segs: CaptionSegment[]): string {
  let out = "WEBVTT\n\n";
  segs.forEach((s, i) => {
    out += `${i + 1}\n`;
    out += `${vttTime(s.startSecs)} --> ${vttTime(s.endSecs)}\n`;
    if (s.speaker) out += `<v ${s.speaker}>${s.text}</v>\n\n`;
    else out += `${s.text}\n\n`;
  });
  return out;
}

function vttTime(secs: number): string {
  const ms = Math.floor((secs - Math.floor(secs)) * 1000);
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

// ── SRT ────────────────────────────────────────────────────────────────

export function renderSrt(segs: CaptionSegment[]): string {
  let out = "";
  segs.forEach((s, i) => {
    out += `${i + 1}\n`;
    out += `${srtTime(s.startSecs)} --> ${srtTime(s.endSecs)}\n`;
    if (s.speaker) out += `${s.speaker}: ${s.text}\n\n`;
    else out += `${s.text}\n\n`;
  });
  return out;
}

function srtTime(secs: number): string {
  const ms = Math.floor((secs - Math.floor(secs)) * 1000);
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

// ── RTTM (NIST Rich Transcription Time Marked) ─────────────────────────

export function renderRttm(segs: CaptionSegment[], uri: string = "audio"): string {
  let out = "";
  for (const s of segs) {
    if (!s.speaker) continue;
    const duration = (s.endSecs - s.startSecs).toFixed(3);
    out += `SPEAKER ${uri} 1 ${s.startSecs.toFixed(3)} ${duration} <NA> <NA> ${s.speaker} <NA> <NA>\n`;
  }
  return out;
}

function pad2(n: number): string { return n.toString().padStart(2, "0"); }
function pad3(n: number): string { return n.toString().padStart(3, "0"); }
