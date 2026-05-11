/**
 * Thumbnail sprite-sheet WebVTT — emits the WebVTT seek-bar map for a
 * grid sprite. The image generation itself lives in `hanzo-tools-video`;
 * this module is the pure cue-list builder Fortémi's
 * `sprite_handler.rs` produces.
 */

export interface SpriteGrid {
  /** Frames per row. */
  cols: number;
  /** Total rows. */
  rows: number;
  /** Thumbnail width in pixels. */
  cellWidth: number;
  /** Thumbnail height in pixels. */
  cellHeight: number;
  /** Sprite sheet URL (relative or absolute). */
  spriteUrl: string;
  /** Per-cell duration in seconds. */
  intervalSecs: number;
  /** Optional cap to truncate. */
  totalDurationSecs?: number;
}

export function renderSpriteVtt(grid: SpriteGrid): string {
  const total =
    grid.totalDurationSecs ?? grid.intervalSecs * grid.rows * grid.cols;
  const out: string[] = ["WEBVTT", ""];
  let cue = 1;
  for (let i = 0; ; i++) {
    const start = i * grid.intervalSecs;
    const end = Math.min(start + grid.intervalSecs, total);
    if (start >= total) break;
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    if (row >= grid.rows) break;
    out.push(`${cue++}`);
    out.push(`${fmt(start)} --> ${fmt(end)}`);
    out.push(
      `${grid.spriteUrl}#xywh=${col * grid.cellWidth},${row * grid.cellHeight},${grid.cellWidth},${grid.cellHeight}`,
    );
    out.push("");
    if (end >= total) break;
  }
  return out.join("\n");
}

function fmt(secs: number): string {
  const ms = Math.floor((secs - Math.floor(secs)) * 1000);
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad3(ms)}`;
}

function pad(n: number): string { return n.toString().padStart(2, "0"); }
function pad3(n: number): string { return n.toString().padStart(3, "0"); }
