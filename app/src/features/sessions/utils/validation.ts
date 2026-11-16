/**
 * Validation rules for Session creation and editing
 */

import type { SessionInput } from '../../../services/types';
import { isPastDateTime } from './dateTime';

export interface ValidationErrorMap {
  title?: string;
  courtId?: string;
  startsAt?: string;
  teamSize?: string;
  guestCount?: string;
  meetingPoint?: string;
  notes?: string;
  general?: string;
}

export interface SessionValidationOptions {
  originalStartsAt?: string | null;
}

export function validateSessionInput(
  input: Partial<SessionInput>,
  isNowTiming: boolean,
  options?: SessionValidationOptions
): { isValid: boolean; errors: ValidationErrorMap } {
  const errors: ValidationErrorMap = {};

  // Title
  if (!input.title || input.title.trim().length === 0) {
    errors.title = 'กรุณาระบุชื่อนัดบาส';
  } else if (input.title.trim().length > 120) {
    errors.title = 'ชื่อนัดต้องไม่เกิน 120 ตัวอักษร';
  }

  // Court
  if (!input.courtId) {
    errors.courtId = 'กรุณาเลือกสนามบาสเกตบอล';
  }

  // Timing
  if (!isNowTiming) {
    if (!input.startsAt) {
      errors.startsAt = 'กรุณาระบุวันและเวลาที่นัดเล่น';
    } else {
      const isUnchangedStartsAt =
        !!options?.originalStartsAt &&
        (input.startsAt === options.originalStartsAt ||
          Math.abs(new Date(input.startsAt).getTime() - new Date(options.originalStartsAt).getTime()) < 60000);

      if (!isUnchangedStartsAt && isPastDateTime(input.startsAt)) {
        errors.startsAt = 'ไม่สามารถเลือกเวลาในอดีตได้';
      }
    }
  }

  // Team Size
  const teamSize = input.teamSize ?? 5;
  if (teamSize !== 3 && teamSize !== 5) {
    errors.teamSize = 'ขนาดทีมต้องเป็น 3 หรือ 5 คน';
  }

  // Guest Count: 0 to teamSize - 1
  const guestCount = input.guestCount ?? 0;
  if (guestCount < 0) {
    errors.guestCount = 'จำนวนเพื่อนที่มาด้วยต้องไม่ติดลบ';
  } else if (guestCount > teamSize - 1) {
    errors.guestCount = `เพื่อนที่มาด้วยต้องไม่เกิน ${teamSize - 1} คน (สำหรับทีม ${teamSize} คน รวมตัวคุณ)`;
  }

  // Meeting point
  if (input.meetingPoint && input.meetingPoint.length > 500) {
    errors.meetingPoint = 'จุดนัดพบต้องไม่เกิน 500 ตัวอักษร';
  }

  // Notes
  if (input.notes && input.notes.length > 2000) {
    errors.notes = 'หมายเหตุต้องไม่เกิน 2000 ตัวอักษร';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates capacity conflict when editing an existing session.
 * Cannot reduce team size below (confirmedCount + guestCount).
 */
export function validateCapacityConflict(
  newTeamSize: 3 | 5,
  newGuestCount: number,
  confirmedCount: number
): { hasConflict: boolean; message?: string } {
  const totalOccupied = confirmedCount + newGuestCount;
  if (totalOccupied > newTeamSize) {
    return {
      hasConflict: true,
      message: `จำนวนคนใหม่ (${totalOccupied} คน) สูงกว่าขนาดทีม (${newTeamSize} คน) เนื่องจากมีสมาชิกเข้าร่วมแล้ว ${confirmedCount} คน`,
    };
  }
  return { hasConflict: false };
}
