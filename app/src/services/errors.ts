import type { FailureCode } from './types';

const THAI_ERROR_MESSAGES: Record<FailureCode, string> = {
  invalid_input: 'ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  invalid_action: 'ไม่สามารถดำเนินการนี้ได้ในสถานะปัจจุบัน',
  profile_required: 'กรุณากรอกโปรไฟล์ให้สมบูรณ์ก่อนดำเนินการ',
  start_in_past: 'เวลาเริ่มนัดต้องอยู่ในอนาคตหรือเลือก "ตอนนี้"',
  not_found: 'ไม่พบข้อมูลที่ต้องการ',
  forbidden: 'คุณไม่มีสิทธิ์ดำเนินการในรายการนี้',
  session_inactive: 'นัดนี้ไม่ได้เปิดใช้งานหรือถูกปิดไปแล้ว',
  recruitment_closed: 'นัดนี้ปิดรับสมาชิกเพิ่มแล้ว',
  session_full: 'นัดนี้มีผู้เข้าร่วมครบตามจำนวนแล้ว',
  request_not_found: 'ไม่พบคำขอเข้าร่วมนี้',
  request_not_pending: 'คำขอนี้ไม่ได้อยู่ในสถานะรอพิจารณาแล้ว',
  host_cannot_withdraw: 'ผู้จัดนัดไม่สามารถถอนตัวได้ กรุณาจัดการนัดหรือยกเลิกนัด',
  not_participating: 'คุณไม่ได้เป็นสมาชิกในนัดนี้',
  capacity_conflict: 'จำนวนคนใหม่ขัดแย้งกับสมาชิกที่มีอยู่แล้ว',
  cannot_block_self: 'ไม่สามารถบล็อกบัญชีของตนเองได้',
  not_configured: 'ระบบยังไม่ได้เชื่อมต่อกับ Supabase กรุณาใช้โหมด Demo',
  network_error: 'การเชื่อมต่อขัดข้อง กรุณาลองใหม่อีกครั้ง',
};

export function getErrorMessage(code: FailureCode | string | undefined, defaultMsg = 'เกิดข้อผิดพลาดในการทำรายการ'): string {
  if (!code) return defaultMsg;
  if (code in THAI_ERROR_MESSAGES) {
    return THAI_ERROR_MESSAGES[code as FailureCode];
  }

  // Handle postgres SQL error codes safely
  if (typeof code === 'string') {
    if (code.startsWith('22') || code === '23502' || code === '23514') {
      return 'ข้อมูลไม่ตรงตามรูปแบบที่กำหนด กรุณาตรวจสอบฟอร์ม';
    }
    if (code === '23503') {
      return 'ข้อมูลอ้างอิงไม่ถูกต้องหรือไม่พบในระบบ';
    }
    if (code === '42501') {
      return 'ไม่มีสิทธิ์เข้าถึงหรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    }
    if (code === '40001' || code === '40P01') {
      return 'ระบบกำลังประมวลผลคำขอพร้อมกัน กรุณาลองใหม่อีกครั้ง';
    }
  }

  return defaultMsg;
}
