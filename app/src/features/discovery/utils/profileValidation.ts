/**
 * Validation rules for user profile settings (ProfilePage)
 */

/**
 * Validates height input in centimeters.
 * - Empty string, null, or undefined is allowed (returns null).
 * - If provided, must be an integer between 100 and 250 cm inclusive.
 * - Returns a Thai error message if invalid, or null if valid.
 */
export function validateHeight(heightStr: string | number | null | undefined): string | null {
  if (heightStr === null || heightStr === undefined) return null;
  const str = String(heightStr).trim();
  if (str === '') return null;

  const num = Number(str);
  if (isNaN(num) || !Number.isInteger(num) || num < 100 || num > 250) {
    return 'กรุณาระบุส่วนสูงที่ถูกต้อง (ระหว่าง 100 ถึง 250 ซม.)';
  }
  return null;
}
