/**
 * Date & Time utilities for HoopUp Sessions
 * Stores ISO strings with timezone, formats in Asia/Bangkok (Thai locale).
 */

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/**
 * Format an ISO datetime string into a readable Thai string in Asia/Bangkok timezone.
 * Example: "28 ต.ค. 2569, 18:00 น." or "วันนี้, 18:00 น."
 */
export function formatThaiDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'ตอนนี้ (สร้างทันที)';

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    // Use Intl to get parts in Asia/Bangkok timezone
    const formatter = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const p of parts) {
      partMap[p.type] = p.value;
    }

    const day = partMap.day || date.getDate().toString();
    const monthNum = parseInt(partMap.month || `${date.getMonth() + 1}`, 10);
    const monthName = THAI_MONTHS_SHORT[monthNum - 1] || `${monthNum}`;
    const yearStr = partMap.year || `${date.getFullYear() + 543}`;
    const hour = partMap.hour || date.getHours().toString().padStart(2, '0');
    const minute = partMap.minute || date.getMinutes().toString().padStart(2, '0');

    // Check if it's today
    const now = new Date();
    const todayFormatter = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const todayParts = todayFormatter.formatToParts(now);
    const todayMap: Record<string, string> = {};
    for (const p of todayParts) {
      todayMap[p.type] = p.value;
    }

    if (todayMap.day === day && todayMap.month === `${monthNum}` && todayMap.year === yearStr) {
      return `วันนี้, ${hour}:${minute} น.`;
    }

    return `${day} ${monthName} ${yearStr}, ${hour}:${minute} น.`;
  } catch {
    return isoString;
  }
}

/**
 * Format only the time part in Asia/Bangkok (e.g. "18:00 น.")
 */
export function formatThaiTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const formatter = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${formatter.format(date)} น.`;
  } catch {
    return isoString;
  }
}

/**
 * Checks whether an ISO string is in the past compared to current client time.
 */
export function isPastDateTime(isoString: string): boolean {
  try {
    const target = new Date(isoString).getTime();
    const now = Date.now();
    return target < now - 60000; // Allow 1 minute grace period for clock skew
  } catch {
    return false;
  }
}

/**
 * Converts a standard datetime-local HTML input value (YYYY-MM-DDTHH:mm)
 * to an ISO string with explicit Asia/Bangkok timezone offset (+07:00).
 */
export function localInputToBangkokIso(localValue: string): string {
  if (!localValue) return '';
  // If user enters "2026-10-28T18:00", append "+07:00" to make it explicit Bangkok time
  if (localValue.length === 16) {
    return `${localValue}:00+07:00`;
  }
  if (localValue.length === 19) {
    return `${localValue}+07:00`;
  }
  return new Date(localValue).toISOString();
}

/**
 * Converts an ISO string into datetime-local format for HTML inputs.
 */
export function isoToLocalInputValue(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    
    // Convert to Bangkok time representation
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    // en-CA formats like: "YYYY-MM-DD, HH:mm" or "YYYY-MM-DD HH:mm"
    const formatted = formatter.format(d).replace(', ', 'T').replace(' ', 'T');
    return formatted.slice(0, 16);
  } catch {
    return '';
  }
}
