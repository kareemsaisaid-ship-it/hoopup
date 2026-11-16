# HoopUp — API / RPC Contract v0.1

เอกสารสำหรับทีม frontend จับคู่กับ `frontend-contract.ts` ชื่อ RPC ตรงกับ SQL ในชุดนี้ แต่ยังไม่มี endpoint Cloud ที่ deploy แล้ว

## 1. การเรียกใช้

ใช้ Supabase client หลังเข้าสู่ระบบ ส่ง user access token ตามกลไก client ปกติ อย่าส่ง `userId` เพื่ออ้างว่าตนเป็นผู้เรียก และไม่ใช้ service-role/secret key ในมือถือ

```typescript
const { data, error } = await supabase.rpc('hoopup_create_session', {
  p_request_id: requestId, // UUID เดิมตลอดการ retry ของการสร้างครั้งเดียว
  p_input: {
    title: 'บาสเย็น รับคนเพิ่ม',
    courtId,
    startsAt: null, // ตอนนี้; เลือกวันเวลาให้ส่ง ISO timestamp พร้อม timezone
    teamSize: 5,
    guestCount: 2, // ไม่รวมผู้จัด
    skillLevel: 'regular',
    welcomesBeginners: true,
    wantedPositions: [],
    joinPolicy: 'instant',
    meetingPoint: 'ม้านั่งข้างทางเข้าสนาม',
  },
});
```

`requestId` และ `courtId` ในตัวอย่างเป็นตัวแปรจากแอป ไม่ใช่ข้อมูลตั้งต้นที่สร้างขึ้นให้ใช้จริง ก่อนสร้างนัดต้องมีโปรไฟล์จาก `hoopup_save_profile`

## 2. รายการคำสั่ง

| RPC | Parameters | ผลและสิทธิ์ |
|---|---|---|
| `hoopup_save_profile` | `p_input` ตาม ProfileInput | บันทึกโปรไฟล์ผู้เรียก; เป็น full form ไม่ใช่ patch ค่าว่างที่ไม่ส่งจะใช้ default/NULL |
| `hoopup_create_session` | `p_request_id`, `p_input` | สร้างนัด+ผู้จัดพร้อมกัน; retry ด้วย request ID เดิมคืนรายการเดิม ไม่แก้ payload เดิม |
| `hoopup_get_session` | `p_session_id` | SessionSummary หรือ null เมื่อไม่พบ/ไม่มีสิทธิ์เห็น |
| `hoopup_list_sessions` | `p_filter` optional | ฟีดนัด active+เปิดรับ+มีที่ว่าง; เรียง startsAt แล้ว id |
| `hoopup_my_sessions` | `p_limit`, `p_offset` optional | นัดที่จัดหรือเคยมี membership รวม pending/full/ended; frontend แยกหมวดตามสถานะ |
| `hoopup_join_session` | `p_session_id`, `p_position` optional | เข้าหรือขอร่วมในฐานะผู้เรียกเท่านั้น |
| `hoopup_decide_request` | `p_session_id`, `p_user_id`, `p_approve` | ผู้จัดตัดสิน pending ของผู้ใช้เป้าหมาย |
| `hoopup_withdraw` | `p_session_id` | ผู้เรียกถอนตัว/ยกเลิกคำขอของตนเมื่อ active |
| `hoopup_update_session` | `p_session_id`, `p_patch` | ผู้จัดแก้เฉพาะ field ของ SessionInput; field ไม่ส่งคงเดิม |
| `hoopup_set_recruitment` | `p_session_id`, `p_open` | ผู้จัดเปิด/ปิดรับในนัด active |
| `hoopup_end_session` | `p_session_id`, `p_lifecycle` | ผู้จัดเลือก completed หรือ cancelled; terminal ไม่ย้อนกลับ |
| `hoopup_send_message` | `p_session_id`, `p_client_message_id`, `p_body` | สมาชิก confirmed ส่งเมื่อ active; retry UUID เดิมคืนข้อความเดิม |
| `hoopup_block_user` | `p_user_id` | บล็อกผู้ใช้เป้าหมายในฐานะผู้เรียก |
| `hoopup_unblock_user` | `p_user_id` | ถอนบล็อกที่ผู้เรียกสร้าง |
| `hoopup_report` | `p_target_type`, `p_target_id`, `p_reason` | รายงานเป้าหมาย user/session/message; ตรวจสิทธิ์อ่านข้อความก่อนรับรายงาน message |

ฟิลเตอร์ฟีด: `courtId`, `teamSize`, `skillLevel`, `from`, `to`, `limit`, `offset` ค่า `to` ไม่รวมขอบบน ใช้ limit เริ่มต้น 20 และไม่เกิน 100 นัดที่เริ่มไปแล้วแต่ผู้จัดยังเปิดรับจะยังอยู่ได้ ถ้าต้องการเฉพาะช่วงเวลาต้องส่ง from/to

การใช้ offset ใน v0.1 อาจทำให้รายการเลื่อนเมื่อมีนัดใหม่ระหว่างโหลด จึง deduplicate ด้วย session ID; เปลี่ยนเป็น keyset ได้หลังตกลง UX pagination

## 3. รูปร่างผลลัพธ์

คำสั่งเขียนส่วนใหญ่คืน `{ok, code, session?}`; ข้อความคืน `message`, โปรไฟล์คืน `profile`, รายงานคืน `reportId` ดูชนิดเต็มใน TypeScript ที่แนบ ผลอ่าน get/list เป็นข้อมูลโดยตรง ไม่ได้ครอบด้วย `{ok}`

SessionSummary ใช้ camelCase แต่ MessageRow/ProfileRow ที่คืนจากคำสั่งและการอ่านตารางใช้ snake_case ให้แปลงผ่าน adapter กลางของ frontend ไม่เดาชื่อฟิลด์เอง

`confirmedCount` รวมผู้จัดแล้ว, `guestCount` ไม่รวมผู้จัด, `occupiedCount = confirmedCount + guestCount`, `seatsRemaining = teamSize - occupiedCount` ข้อมูลนี้มาจากบริการ ไม่ให้ frontend ส่งกลับเป็นความจริงเพื่ออนุมัติที่นั่ง

`updatedAt` ใน v0.1 คือเวลาที่แถวนัดเปลี่ยน ไม่ใช่ version ของข้อมูลรวมสมาชิกทั้งหมด หลังเปลี่ยนสมาชิกต้องใช้ผลตอบกลับหรือ refresh ไม่ใช้ timestamp นี้เพียงค่าเดียวตัดสินว่าจำนวนคนยังเหมือนเดิม

สถานะจอ: `open / full / closed / completed / cancelled` สถานะสมาชิก: `pending / confirmed / declined / withdrawn` หากไม่เคยมีแถวเป็น null

## 4. ผลธุรกิจและ transport errors

| ผลลัพธ์ | UI ที่คาดหวัง |
|---|---|
| `created / already_created` | เปิดนัดเดิม; retry ไม่สร้างห้องซ้ำ |
| `joined / already_joined` | ยืนยันการเข้าร่วม และใช้ข้อมูลนัดล่าสุด |
| `pending` | แสดงรออนุมัติ ไม่เพิ่มจำนวนผู้เล่น |
| `approved / declined / already_decided` | อัปเดตคำขอและนัด |
| `withdrawn / already_withdrawn` | อัปเดตสมาชิกและจำนวน; ถอนซ้ำไม่ลดจำนวนอีก |
| `session_full` | แจ้งคนครบแล้วและ refresh รายละเอียด |
| `recruitment_closed / session_inactive` | แจ้งปิดรับหรือสิ้นสุด และ refresh |
| `capacity_conflict` | แจ้งว่าจำนวนใหม่ต่ำกว่าคนที่มี/รับเกิน พร้อมให้แก้ฟอร์ม |
| `profile_required` | พาไปสร้างโปรไฟล์แล้วกลับมาทำรายการเดิม |
| `start_in_past` | ให้เลือกเวลาใหม่หรือเลือกตอนนี้ |
| `forbidden / not_found` | แจ้งทำรายการไม่ได้/ไม่พบ โดยไม่เปิดข้อมูลภายใน |
| `invalid_input / request_not_pending / request_not_found` | ปรับฟอร์มหรือ refresh ตามสถานการณ์ |
| `host_cannot_withdraw` | ผู้จัดต้องจัดการนัด ไม่ถอนแบบสมาชิก |

ตรวจทั้ง `error` จาก Supabase และ `data.ok` เพราะ validation จาก type/CHECK/FK/NOT NULL อาจเป็น SQL error ไม่ได้คืน `{ok:false}` เช่น SQLSTATE กลุ่ม `22...`, `23502`, `23503`, `23514` ให้แสดงข้อความตรวจข้อมูลที่เหมาะสม ไม่พิมพ์ SQL ดิบลง UI

SQLSTATE `42501` ใช้กับสิทธิ์/ไม่ได้เข้าสู่ระบบ; `40001` หรือ `40P01` เป็นกลุ่ม transaction retry ได้ตามข้อกำหนดของแอป แต่ต้องรักษา request/message ID เดิมและจำกัด retry อย่าแสดงสำเร็จเองหาก network timeout

## 5. การอ่านรายการที่ใช้ RLS

- `courts`: อ่านสนามตั้งต้นผ่าน Data API ได้หลังเข้าสู่ระบบ
- `profiles`: อ่านข้อมูลโปรไฟล์ที่ใช้ในแอป ไม่มี password/token ในตาราง
- `session_members`: อ่านนัดเป้าหมาย; เจ้าตัวเห็นแถวตน ผู้จัดเห็นทั้งหมด และสมาชิกเห็น confirmed ในกลุ่ม
- `messages`: อ่านด้วย session ID และเรียง `created_at, id` พร้อม limit; ผู้ที่ยังไม่ confirmed จะไม่เห็นแถว
- `reports`, `user_blocks`: อ่านเฉพาะที่ผู้เรียกสร้าง

ห้ามใช้ insert/update/delete ตารางเหล่านี้จากมือถือ คำสั่งเขียนทั้งหมดผ่าน RPC เพื่อรักษากติกาเดียวกัน

## 6. สิ่งที่ frontend ควรเตรียม

- แยก mock service กับ Supabase adapter โดยใช้ contract เดียวกัน
- เก็บ UUID ของ create/message ข้าม retry ของคำสั่งเดิม
- หลัง mutation สำเร็จใช้ session ที่คืนมาอัปเดต cache ตาม ID และ invalidate ฟีด/นัดของฉันตามจำเป็น
- หลัง business failure ที่เกี่ยวกับสถานะ ให้ refresh นัด ไม่เชื่อว่าปุ่มที่เห็นก่อนกดยังใช้ได้เสมอ
- ทำ manual refresh/poll ตาม UX ก่อน; Realtime subscription และ push ยังไม่ได้ตั้งค่าในชุดนี้
- ไม่บังคับเปิด GPS เพื่อสร้างนัด เลือกสนามจากรายการได้
- เก็บ state loading/error ในเครื่อง ข้อมูลสมาชิกและการตัดสินที่นั่งใช้ผลบริการ

ข้อจำกัดที่ยังไม่เชื่อม: Auth providers จริง, การอัปโหลดรูป/Storage policies, Cloud Data API, PostGIS radius query, guest-account replacement, Realtime, push, การแจ้งสมาชิกเมื่อนัดเปลี่ยน และหน้าผู้ดูแลรายงาน
