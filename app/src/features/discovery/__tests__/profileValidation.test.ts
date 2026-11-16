import { describe, expect, it } from 'vitest';
import { validateHeight } from '../utils/profileValidation';

describe('Profile Validation (F09)', () => {
  it('allows empty string, whitespace, null, and undefined as optional height', () => {
    expect(validateHeight('')).toBeNull();
    expect(validateHeight('   ')).toBeNull();
    expect(validateHeight(null)).toBeNull();
    expect(validateHeight(undefined)).toBeNull();
  });

  it('accepts valid integer heights between 100 and 250 cm', () => {
    expect(validateHeight('100')).toBeNull();
    expect(validateHeight(100)).toBeNull();
    expect(validateHeight('178')).toBeNull();
    expect(validateHeight(185)).toBeNull();
    expect(validateHeight('250')).toBeNull();
    expect(validateHeight(250)).toBeNull();
  });

  it('rejects heights below 100 cm with a Thai error message', () => {
    const errorMsg = 'กรุณาระบุส่วนสูงที่ถูกต้อง (ระหว่าง 100 ถึง 250 ซม.)';
    expect(validateHeight('99')).toBe(errorMsg);
    expect(validateHeight('0')).toBe(errorMsg);
    expect(validateHeight('-185')).toBe(errorMsg);
    expect(validateHeight(-50)).toBe(errorMsg);
  });

  it('rejects heights above 250 cm with a Thai error message', () => {
    const errorMsg = 'กรุณาระบุส่วนสูงที่ถูกต้อง (ระหว่าง 100 ถึง 250 ซม.)';
    expect(validateHeight('251')).toBe(errorMsg);
    expect(validateHeight('300')).toBe(errorMsg);
    expect(validateHeight('99999')).toBe(errorMsg);
    expect(validateHeight(999)).toBe(errorMsg);
  });

  it('rejects non-numeric and decimal values', () => {
    const errorMsg = 'กรุณาระบุส่วนสูงที่ถูกต้อง (ระหว่าง 100 ถึง 250 ซม.)';
    expect(validateHeight('abc')).toBe(errorMsg);
    expect(validateHeight('180.5')).toBe(errorMsg);
  });
});
