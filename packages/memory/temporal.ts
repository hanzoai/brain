/**
 * UUIDv7 temporal-window helpers.
 *
 * UUIDv7 embeds a 48-bit ms-precision Unix timestamp in the high 48 bits.
 * That lets temporal filters use the primary key index directly:
 *
 *   WHERE id >= $floor_uuid AND id < $ceiling_uuid
 *
 * Instead of an extra timestamp column with its own index.
 */

/** Compose a UUIDv7 with the given epoch-ms in the timestamp field and zeroed entropy. Useful as a floor bound. */
export function v7Floor(epochMs: number): string {
  return v7FromTs(epochMs, false);
}

/** Compose a UUIDv7 with the given epoch-ms and max entropy. Useful as a ceiling bound. */
export function v7Ceiling(epochMs: number): string {
  return v7FromTs(epochMs, true);
}

function v7FromTs(epochMs: number, ceiling: boolean): string {
  const ts = BigInt(Math.max(0, Math.floor(epochMs)));
  const hex = ts.toString(16).padStart(12, "0").slice(-12);
  // Layout: time_high(8) - time_low(4) - ver+rand(4) - var+rand(4) - rand(12)
  const timeHigh = hex.slice(0, 8);
  const timeLow = hex.slice(8, 12);
  const verRand = ceiling ? "7fff" : "7000"; // ver=7 in high nibble
  const varRand = ceiling ? "bfff" : "8000"; // var=10 in high two bits
  const tail = ceiling ? "ffffffffffff" : "000000000000";
  return `${timeHigh}-${timeLow}-${verRand}-${varRand}-${tail}`;
}

export interface TemporalRange {
  from?: string; // ISO timestamp (inclusive)
  to?: string;   // ISO timestamp (exclusive)
}

/** Convert a TemporalRange to UUIDv7 bounds usable in WHERE id >= $1 AND id < $2. */
export function rangeBounds(range: TemporalRange): { floor: string; ceiling: string } {
  const from = range.from ? Date.parse(range.from) : 0;
  const to = range.to ? Date.parse(range.to) : Date.now() + 86_400_000;
  return { floor: v7Floor(from), ceiling: v7Ceiling(to) };
}

/** Named ranges Fortémi exposes. */
export type NamedRange = "last_minute" | "last_hour" | "today" | "this_week" | "this_month" | "this_quarter" | "this_year";

export function namedRange(name: NamedRange, now: number = Date.now()): TemporalRange {
  const d = new Date(now);
  const iso = (dt: Date) => dt.toISOString();
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay()); // Sunday
  const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const startOfQuarter = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  const startOfYear = new Date(d.getFullYear(), 0, 1);

  switch (name) {
    case "last_minute":  return { from: iso(new Date(now - 60_000)) };
    case "last_hour":    return { from: iso(new Date(now - 3_600_000)) };
    case "today":        return { from: iso(startOfDay) };
    case "this_week":    return { from: iso(startOfWeek) };
    case "this_month":   return { from: iso(startOfMonth) };
    case "this_quarter": return { from: iso(startOfQuarter) };
    case "this_year":    return { from: iso(startOfYear) };
  }
}
