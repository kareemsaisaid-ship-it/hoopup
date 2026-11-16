# ผลตรวจ Backend v0.1 — 26 ตุลาคม 2569

**ผลรอบล่าสุด: PASS — 82 checks และ 4 สถานการณ์คำสั่งพร้อมกัน**

ใช้ PostgreSQL 16.1 บน Windows กับ cluster ชั่วคราวที่ test runner สร้างแยก ไม่มีการเชื่อมฐานข้อมูลจริงของผู้ใช้

## คำสั่งที่รันจริง

```powershell
python -u 'C:\D_Drive\terminter01\garage\project_ideas\basketball\backend\tests\run_postgres_tests.py' --pg-bin 'C:\D_Drive\terminter01\dsl-auto-master\tools\pgsql\bin'
```

ผลจากโปรแกรมรอบล่าสุด:

```text
PASS: 82 checks; 4 concurrent scenarios. Auth is a local SQL stub; no cloud deployment tested.
Receipt: C:\D_Drive\terminter01\garage\project_ideas\basketball\backend\tests\last_run.json
```

## สิ่งที่ตรวจ

- core migrations ทั้งสามไฟล์ใช้กับฐานว่างได้
- ผู้จัดและเพื่อนนับไม่ซ้ำ คำขอ pending ไม่กินที่นั่ง และการเรียก create/join/message ซ้ำตามกติกาไม่เพิ่มรายการซ้ำ
- อนุมัติ ถอนตัว ปิดรับ จบ และยกเลิกได้ตามสิทธิ์/สถานะ
- ปฏิเสธการแก้ตารางตรงจาก client และการแก้นัด/อนุมัติของผู้อื่น
- คนรออนุมัติ คนนอก และคนถอนตัวอ่านแชทไม่ได้; สมาชิก confirmed อ่านแชทได้ และนัดจบแล้วส่งข้อความใหม่ไม่ได้
- ฟีดไม่รวมนัดเต็ม แต่นัดของฉันยังพบได้
- การบล็อกและการอ่านรายงานมีขอบเขตตาม baseline
- failed create และนัดที่ไม่มีสมาชิกผู้จัดไม่ค้างในฐาน
- constraint ข้ามตารางปฏิเสธจำนวนเกินและการทำให้ผู้จัดไม่เป็น confirmed
- wrapper ใน public ไม่เป็น SECURITY DEFINER และ authenticated เรียก invariant trigger function เองไม่ได้

| สถานการณ์พร้อมกัน | สิ่งที่ตรวจได้ |
|---|---|
| 8 คนแย่งที่นั่งสุดท้าย | มี 1 คนเข้าร่วม อีก 7 คนได้ session_full; จำนวนไม่เกิน |
| อนุมัติชนกับเข้าได้เลย | มีผู้ได้ที่นั่งสุดท้ายหนึ่งคำสั่ง อีกคำสั่งไม่เพิ่มสมาชิกเกิน |
| เพิ่ม guest ชนกับเข้าร่วม | มีการเพิ่มจำนวนสำเร็จได้หนึ่งฝั่ง; อีกฝั่งถูกปฏิเสธตามสถานะล่าสุด |
| ยกเลิกชนกับเข้าร่วม | สถานะสุดท้ายยกเลิก และคำขอใหม่หลังยกเลิกไม่ผ่าน; ผลของคำสั่งที่เริ่มพร้อมกันขึ้นกับลำดับที่ได้ล็อก |

ผลเหล่านี้ยืนยันเฉพาะกรณีและสภาพแวดล้อมที่รัน ไม่ใช่ข้อพิสูจน์ทุกลำดับเหตุการณ์หรือทุกระดับ isolation

## ประวัติข้อผิดพลาดของตัวทดสอบ

เก็บผลรอบก่อนใน [validation_history.json](tests/validation_history.json) โดยไม่ลบเหตุการณ์ที่ล้มเหลว:

1. เริ่ม PostgreSQL บน Windows แล้ว pg_ctl output pipe ยังถูก process ลูกถืออยู่ เกิด timeout แก้ตัว runner ให้ใช้ log file แทน pipe และหยุด cluster ของรอบนั้นแล้ว
2. runner อ่าน SQL NULL ที่คืนจากกรณีถูกบล็อกเป็น JSON ไม่ได้ ทำให้ suite หยุดหลัง 55 checks ข้อความ exception ว่างยังทำให้ raw receipt รายงาน passed ผิด จึงเก็บ [raw receipt](tests/runner_failure_raw.json) ไว้ และแก้ history เป็น failed พร้อมเหตุผล ตัว runner ปัจจุบันจัดการ SQL NULL และตรวจว่ารันถึงจบจริงก่อนให้ผ่าน
3. รอบล่าสุดรันครบและผ่านตามผลด้านบน

## สิ่งที่ยังไม่ได้ยืนยัน

- Supabase Cloud/Auth/JWT จริง และการเรียก RPC ผ่าน Data API
- extension/คำค้น PostGIS; SQL optional แยกไว้และยังไม่ได้รัน
- Realtime, push, Storage upload/policies และการแจ้งสมาชิกเมื่อแก้นัด
- frontend integration, load/performance benchmark และงานผู้ดูแลรายงาน
- การลบบัญชี/ข้อมูล การส่งต่อผู้จัด และการแทน guest ด้วยบัญชีจริง

ดู [last_run.json](tests/last_run.json) สำหรับรายการ checks ผล observed และผลคำสั่งพร้อมกัน รอบล่าสุดมีคำสั่งหยุด cluster พร้อม exit code ให้ตรวจด้วย
