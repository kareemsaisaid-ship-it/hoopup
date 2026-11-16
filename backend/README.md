# HoopUp — ชุดออกแบบ Backend v0.1

วันที่: 26 ตุลาคม 2569  
ฐานข้อมูลกลางที่เสนอ: Supabase/PostgreSQL · แอปมือถือเรียกใช้ผ่าน Auth และ RPC

ชุดนี้เปลี่ยนแบบร่างให้เป็น SQL ตั้งต้นที่ตรวจได้และมีสัญญาข้อมูลสำหรับ frontend ยังไม่มีการ deploy Cloud และยังไม่ใช่ backend พร้อมเปิดรับผู้ใช้จริง

## 1. ไฟล์ที่ใช้

| ไฟล์ | หน้าที่ |
|---|---|
| [001_schema.sql](migrations/001_schema.sql) | 5 ตารางแกน + block/report, ความสัมพันธ์ CHECK/UNIQUE, ดัชนี และ invariant ข้ามตาราง |
| [002_commands.sql](migrations/002_commands.sql) | คำสั่งธุรกิจและการนับ/สรุปข้อมูล; helper ที่มีสิทธิ์พิเศษอยู่ใน schema ส่วนตัว |
| [003_api_and_permissions.sql](migrations/003_api_and_permissions.sql) | RPC ที่ frontend เรียก, สิทธิ์ตาราง และ RLS |
| [API_TH.md](API_TH.md) | วิธีเชื่อม frontend และพฤติกรรมของคำสั่ง |
| [frontend-contract.ts](frontend-contract.ts) | รูปร่างข้อมูลและ parameter RPC ที่เสนอ |
| [run_postgres_tests.py](tests/run_postgres_tests.py) | ทดสอบ SQL จริงบน PostgreSQL แยก โดยจำลองเฉพาะ auth.uid |
| [enable_postgis.sql](optional/enable_postgis.sql) | ส่วนเสริมเชิงพื้นที่ ยังไม่รวมในชุดทดสอบ core |
| [VALIDATION_TH.md](VALIDATION_TH.md) | ผลทดสอบจริงและข้อจำกัด รวมประวัติปัญหาตัวทดสอบ |

## 2. โครงสร้างข้อมูล

| ตาราง | ความหมาย |
|---|---|
| `profiles` | ผู้เล่น ผูกกับบัญชี Supabase Auth |
| `courts` | สนามและข้อมูลพื้นฐาน |
| `sessions` | นัดของหนึ่งทีม; มีผู้จัด สนาม เวลา จำนวนทีมและสถานะ |
| `session_members` | ผู้จัด สมาชิก คำขอ และการถอนตัว; PK เป็นคู่ session/user |
| `messages` | แชทในนัด; ป้องกันข้อความซ้ำด้วย client message ID |
| `user_blocks` | คู่ผู้ใช้ที่บล็อกกัน |
| `reports` | รายงานปัญหาอ้างเป้าหมาย user/session/message อย่างใดอย่างหนึ่ง |

ความสัมพันธ์สำคัญ: สนามหนึ่งแห่งมีหลายนัด ผู้เล่นหนึ่งคนเข้าหลายนัดได้ผ่านสมาชิก และข้อความทุกข้อความผูกกับนัดเดียว

## 3. กติกาที่ลงใน SQL

- มีนัดชนิดเดียว เลือก “ตอนนี้” ด้วย `startsAt: null` ให้บริการบันทึกเวลาจริง หรือส่งวันเวลาในอนาคต
- `team_size` เป็น 3 หรือ 5 คน หมายถึงผู้เล่นฝั่งเดียวของเกม 3x3/5x5
- ผู้จัดต้องเป็นสมาชิก confirmed ของนัดตนเอง และสร้างสองแถวใน transaction เดียวกัน
- คนที่มี = confirmed ทั้งหมดซึ่งรวมผู้จัดแล้ว + guest_count; pending ไม่จองที่นั่ง
- “เต็ม” คำนวณจากจำนวนคน แยกจากปิดรับ จบ และยกเลิก
- คำสั่งเข้าร่วม อนุมัติ ถอนตัว แก้จำนวน ปิดรับ จบ ยกเลิก และส่งข้อความล็อกแถวนัดก่อนดำเนินการ
- constraint trigger แบบ deferred ตรวจทั้งผู้จัดและจำนวนคนก่อน commit ป้องกันฐานข้อมูลค้างในสถานะที่ไม่สมบูรณ์
- client ไม่มีสิทธิ์ insert/update/delete ตารางโดยตรง ต้องผ่านคำสั่งที่ตรวจผู้เรียก
- helper ใช้ `security definer` ใน `hoopup_private`; `public.hoopup_*` เป็น `security invoker` และเปิด execute เฉพาะ authenticated
- ฟีดเป็นคำค้นนัดที่เปิดรับและมีที่ว่าง ส่วน “นัดของฉัน” รวมสถานะอื่นด้วย
- ไม่มีข้อมูลสนามจริงในชุดนี้ ข้อมูลทดสอบเป็น mock ทั้งหมด

พฤติกรรมที่เพิ่มจากแบบร่างและยังต้องให้ทีมรับร่วมกัน: pending เดิมไม่ถูกอนุมัติเองเมื่อเปลี่ยน join policy; withdrawn/declined ส่งคำขอใหม่ได้; ผู้จัดยืนยันคำขอได้เฉพาะตอนเปิดรับ; ถอนตัวได้ก่อนนัดจบ; terminal state ไม่ย้อนกลับ; ผู้จัดถอนตัวแบบสมาชิกทั่วไปไม่ได้

## 4. สิทธิ์เริ่มต้น

| ผู้ใช้ | ทำอะไรได้ |
|---|---|
| ยังไม่เข้าสู่ระบบ | ยังไม่เปิดอ่านข้อมูลแอปใน v0.1 นี้; รูปแบบ guest browsing ต้องคุยเพิ่ม |
| เข้าสู่ระบบ | อ่านโปรไฟล์ที่ใช้ในแอป สนาม และนัดที่ตนมีสิทธิ์เห็น |
| ผู้ขอรออนุมัติ | เห็นคำขอของตน ไม่อ่านแชทหรือรายชื่อ pending ของผู้อื่น |
| สมาชิก confirmed | เห็นสมาชิก confirmed ของนัด อ่านแชท และส่งได้เมื่อ active |
| ผู้จัด | จัดการนัดและคำขอของนัดตน |
| ผู้รายงาน | เห็นรายงานของตน; ผู้ถูกรายงานไม่ได้อ่านรายงานโดยอัตโนมัติ |

โปรไฟล์ในตารางนี้เป็นข้อมูลที่ใช้แสดงในแอป ไม่เก็บรหัสผ่าน token หรือพิกัดสดของบุคคล สถานที่นัดพบเป็นข้อมูลทั่วไปในสนาม ไม่ใช้ส่งเบอร์หรือข้อมูลส่วนตัว

บล็อกใน v0.1: ความสัมพันธ์บล็อกระหว่างผู้จัดกับคนใหม่ซ่อนนัดจากคนนั้นและกันการรับใหม่ ผู้ที่เป็นสมาชิกอยู่แล้วไม่ถูกไล่ออกจากนัดหรือหายจากแชทเอง ต้องตกลงพฤติกรรมกรณีสมาชิกในกลุ่มบล็อกกันก่อนเปิดจริง

## 5. พิกัดและ PostGIS

core เก็บ latitude/longitude แบบ WGS84 พร้อมตรวจขอบเขตและบังคับให้มีทั้งคู่หรือว่างทั้งคู่ จึงทำ pin บนแผนที่ได้และทดสอบบน PostgreSQL ที่ไม่มี PostGIS ได้

ส่วนเสริมสร้างคอลัมน์ geography ที่คำนวณจากสองค่านี้และ GiST index เมื่อตรวจและเปิด PostGIS แล้ว ไม่ให้แก้ geography แยกจากพิกัดหลัก ถ้ามี extension อยู่ schema อื่น script จะหยุดให้ปรับก่อน ไม่ย้าย extension ของระบบเดิมเอง

นี่เป็นรายละเอียดการติดตั้งที่ปรับจากแบบร่างก่อนหน้า ซึ่งเสนอ geography โดยตรง ฟีเจอร์เรียงระยะทาง/radius RPC ยังไม่ได้ทำใน core; frontend จึงไม่ควรแสดงระยะทางที่คำนวณขึ้นเองเป็นเวลาเดินทาง

## 6. วิธีทดสอบในเครื่อง

ต้องมี Python และ PostgreSQL binaries ที่เชื่อถือได้ ไม่ต้องติดตั้ง Python packages เพิ่ม ตัวอย่างคำสั่ง PowerShell จากโฟลเดอร์ `backend`:

```powershell
python .\tests\run_postgres_tests.py --pg-bin 'C:\path\to\PostgreSQL\bin'
```

test runner สร้าง cluster ใหม่ใน `.local-test/run-*`, bind เฉพาะ loopback ด้วย port ชั่วคราว และหยุด cluster ของตนใน finally ไม่เชื่อมฐานข้อมูลเดิม ไม่อ่าน connection string หรือ credentials ของระบบจริง เก็บผลใน `tests/last_run.json` และเก็บข้อมูล mock/log ชั่วคราวไว้เพื่อตรวจย้อนหลัง

การจำลอง Auth ใน tests ใช้ค่า request setting แทน JWT ที่ตรวจลายเซ็นแล้ว จึงทดสอบพฤติกรรม SQL/RLS ตาม role ได้ แต่ไม่ยืนยัน Auth จริง Data API หรือ Cloud

ผลรอบล่าสุดวันที่จัดทำ: **82 checks ผ่าน และ 4 สถานการณ์พร้อมกันผ่าน** รายละเอียดและรอบที่ล้มเหลวก่อนแก้ตัว runner อยู่ใน VALIDATION_TH.md และ receipt ไม่อ้างว่าการผ่าน local เท่ากับขึ้นระบบสำเร็จ

## 7. ขอบเขตที่ยังต้องทำก่อนขึ้นระบบจริง

- ตรวจ source/schema ของแอปที่ทีมมีอยู่จริง; รอบนี้ยังไม่พบ source HoopUp ใน workspace ที่ค้น
- เลือก project/environment และทดลอง migrations บน Supabase development ที่ไม่มีข้อมูลจริงก่อน
- ตรวจ exposed schemas: ใช้ `public` สำหรับ wrapper; **ห้ามเปิด `hoopup_private` ผ่าน Data API**
- ตรวจ Auth providers, JWT จริง, API errors และ grants บน Supabase จริง
- ทำการแทน guest ด้วยบัญชีโดยมีความยินยอมและกติกาชัดเจน; v0.1 ไม่จับคู่จากชื่อเอง
- เพิ่ม idempotency สำหรับการรายงานปัญหาเมื่อเลือก UX การลองส่งใหม่; create/join/message มีการกันซ้ำตามขอบเขตที่ระบุแล้ว
- ทำการแจ้งเตือนสมาชิกเมื่อรายละเอียดนัดเปลี่ยน Realtime/push และการนำส่งหลัง commit
- ทำ pagination คำค้นเชิงพื้นที่ นโยบายการเก็บข้อมูล/ลบบัญชี และหน้าผู้ดูแลรายงาน
- กำหนด rate limits และทดสอบการใช้งานร่วมกับ frontend ภายใต้ข้อมูลจริงตามขอบเขตนำร่อง

ไฟล์ migrations ชุดแรกใช้กับฐานว่างเท่านั้น มี guard ปฏิเสธหากพบตารางชื่อเดียวกัน จึงไม่ควรนำไปทับฐานเดิมหรือใช้ `drop` เพื่อให้ผ่าน ต้องเขียน upgrade migration หลังเห็น schema เดิม

## 8. หลักฐานอ้างอิง

- แนวทาง `security invoker`/`security definer`, search_path และ execute grants: [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- แนวทาง RLS และ helper function: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- กลไก row lock ของ PostgreSQL: [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- รายงานผลในเครื่อง: `tests/last_run.json`; อ่านข้อจำกัดของผลทดสอบก่อนนำไปอ้างว่า deploy สำเร็จ
