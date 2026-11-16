# HoopUp — แบบร่างฐานข้อมูลและข้อตกลงกับ Frontend

วันที่: 26 ตุลาคม 2569 · ฉบับ 0.1  
สถานะ: ข้อเสนอการออกแบบสำหรับ Supabase/PostgreSQL ตาม stack ที่ทีมเสนอ ยังไม่ใช่ migration และยังไม่ได้ทดสอบกับฐานข้อมูลจริง

**อัปเดตหลังผู้ใช้ให้เริ่มออกแบบ:** มี [ชุด Backend v0.1](backend/README.md) ที่แปลงข้อเสนอนี้เป็น migrations, RPC และ frontend contract แล้ว ทดสอบ core บน PostgreSQL ในเครื่องด้วย Auth จำลอง ดู [ผลตรวจ](backend/VALIDATION_TH.md) ยังไม่ deploy หรือยืนยันฐานข้อมูลเดิมของทีม รายละเอียดในชุด v0.1 ระบุ baseline ที่ใช้ทดสอบและส่วนที่ยังไม่ทำไว้แยกกัน

> **ให้นัดเล่น (`sessions`) เป็นข้อมูลกลาง ฟีด แผนที่ นัดของฉัน และแชทใช้ `session_id` เดียวกัน**

## 1. ภาพรวมตาราง

| ตาราง | หน้าที่ | ความสัมพันธ์ |
|---|---|---|
| `profiles` | ข้อมูลผู้เล่นที่ใช้ในแอป | ผูกกับ `auth.users` ของ Supabase |
| `courts` | ข้อมูลสนามตั้งต้น | หนึ่งสนามมีหลายนัด |
| `sessions` | รายละเอียดและสถานะนัด | มีผู้จัดหนึ่งคนและสนามหนึ่งแห่ง |
| `session_members` | ผู้จัด สมาชิก และคำขอเข้าร่วม | ผูกผู้ใช้กับนัด; หนึ่งคู่มีหนึ่งแถว |
| `messages` | ข้อความในนัด | ผูกผู้ส่งกับนัด |

ใช้ Supabase Auth จัดการบัญชีและการเข้าสู่ระบบ ไม่สร้างตารางรหัสผ่านของแอปเอง ส่วน `user_blocks` และ `reports` เป็นตารางสนับสนุนที่ต้องเตรียมก่อนเปิดรับผู้ใช้จริง ไม่ใช่สิ่งที่เก็บแทนในข้อความแชท

ตารางฟีดไม่จำเป็นในขอบเขตนี้ ฟีดเป็นผลอ่านจากนัดและข้อมูลที่เกี่ยวข้อง ส่วนรีวิวสนาม ก๊วนประจำ และโพสต์ทั่วไปค่อยแยกตารางเมื่อเลือกทำฟีเจอร์นั้น

## 2. ตารางหลักและฟิลด์ที่เสนอ

ใช้ UUID เป็นรหัสหลัก และ `timestamptz` สำหรับวันเวลาที่เป็นเหตุการณ์ เช่น เวลาเริ่มและเวลาสร้าง แสดงผลเวลาไทยที่ UI ไม่เก็บเวลาเริ่มเป็นข้อความว่า “วันนี้หนึ่งทุ่ม”

### `profiles`

| ฟิลด์ | ชนิด/กติกา |
|---|---|
| `id` | UUID, PK, FK ไป `auth.users.id` |
| `display_name` | text, จำเป็น |
| `avatar_path` | text, ไม่บังคับ; path ของรูป ไม่เก็บไฟล์ภาพเป็นข้อความในแถว |
| `skill_level` | text, `casual / regular / competitive`, ระบุเอง |
| `primary_position`, `secondary_position` | text, ไม่บังคับ; จำกัดค่าตำแหน่งที่แอปรองรับ |
| `plays_any_position` | boolean |
| `height_cm` | smallint, ไม่บังคับ; ถ้ามีต้องเป็นค่าบวก |
| `created_at`, `updated_at` | timestamptz |

ไม่คัดลอกรหัสผ่านหรือ token จาก Auth มาไว้ที่นี่ ไม่เก็บพิกัดสดของผู้ใช้เพื่อเปิดต่อสาธารณะ การเลือกพื้นที่ค้นหาทำเป็น input ของคำค้นได้

### `courts`

| ฟิลด์ | ชนิด/กติกา |
|---|---|
| `id` | UUID, PK |
| `name`, `address` | text; ชื่อจำเป็น |
| `location` | PostGIS `geography(Point,4326)`, ถ้ายังไม่ทราบให้ NULL |
| `surface_type` | text, ไม่บังคับ |
| `is_indoor`, `has_lighting` | boolean, ยอมให้ NULL หมายถึงไม่ทราบ |
| `hoop_count` | smallint, ไม่บังคับ; ถ้ามีต้องไม่ติดลบ |
| `opening_hours_note`, `photo_path` | text, ไม่บังคับ |
| `verified_at`, `created_at`, `updated_at` | timestamptz; `verified_at` ว่างได้ |

ระยะแรกให้ทีมดูแลข้อมูลสนามตั้งต้น รายงานพื้นเปียกหรือสนามปิดเป็นเหตุการณ์ที่มีเวลา ไม่ควรเขียนทับข้อมูลถาวรให้ดูเหมือนจริงตลอดไป เมื่อทำรายงานสภาพสนามจึงค่อยเพิ่มตารางแยก

PostGIS รองรับการเก็บจุดและคำค้นเชิงพื้นที่ เช่น ระยะห่างและจุดใกล้เคียง ตาม [Supabase: PostGIS](https://supabase.com/docs/guides/database/extensions/postgis) ให้ตรวจ schema ที่ติดตั้ง extension ก่อนเขียน migration จริง

รายละเอียดใน v0.1: core ใช้ latitude/longitude แบบตรวจขอบเขตก่อน และมี optional SQL สร้าง geography จากพิกัดสองค่านี้ จึงไม่มี location อีกชุดให้แก้แยก ดู backend/README.md; ส่วนเสริม PostGIS ยังไม่ได้รันทดสอบ

### `sessions`

| ฟิลด์ | ชนิด/กติกา |
|---|---|
| `id` | UUID, PK |
| `host_id` | UUID, FK ไป `profiles.id`, ผู้จัดปัจจุบัน |
| `court_id` | UUID, FK ไป `courts.id` |
| `title` | text, จำเป็น |
| `starts_at` | timestamptz, จำเป็น; เลือก “ตอนนี้” ก็เขียนเป็นเวลาจริง |
| `team_size` | smallint, CHECK เป็น 3 หรือ 5; UI แปลงเป็น 3x3/5x5 |
| `guest_count` | smallint, ค่าเริ่มต้น 0; จำนวนเพื่อนที่ยังไม่มีบัญชีในนัด ไม่รวมผู้จัด |
| `skill_level` | text, `casual / regular / competitive` |
| `welcomes_beginners` | boolean |
| `wanted_positions` | text[], ค่าว่างหมายถึงตำแหน่งไหนก็ได้; จำกัดค่าภายในให้ตรงชุดตำแหน่งที่รองรับ |
| `join_policy` | text, `instant / approval` |
| `lifecycle` | text, `active / completed / cancelled` |
| `recruitment_open` | boolean, ผู้จัดเปิด/ปิดการรับเพิ่ม |
| `meeting_point`, `notes` | text; ใช้ข้อมูลนัดพบทั่วไป ไม่เปิดข้อมูลติดต่อส่วนตัวในฟีด |
| `created_at`, `updated_at`, `ended_at` | timestamptz; `ended_at` ว่างได้ |

ไม่เก็บ `instant_mode` และ `scheduled_mode` เพราะเป็นนัดชนิดเดียวกัน ไม่จำเป็นต้องเก็บ `format` ซ้ำกับ `team_size` ในขอบเขตปัจจุบัน

CHECK ภายในแถวตรวจ `0 <= guest_count <= team_size - 1` ได้ แต่การตรวจรวมกับสมาชิกในอีกตารางต้องทำใน transaction ของงานนั้น ไม่ใช้ CHECK ธรรมดาเพียงตัวเดียวแทนการป้องกันรับเกิน

### `session_members`

| ฟิลด์ | ชนิด/กติกา |
|---|---|
| `session_id` | UUID, FK ไป `sessions.id` |
| `user_id` | UUID, FK ไป `profiles.id` |
| `status` | text, `pending / confirmed / declined / withdrawn` |
| `position` | text, ไม่บังคับ; ตำแหน่งที่ตกลงเล่นในนัด |
| `requested_at`, `updated_at` | timestamptz |
| `confirmed_at` | timestamptz, ว่างได้ |
| `decided_by` | UUID, FK ไป `profiles.id`, ว่างได้; ใช้บันทึกผู้ตัดสินคำขอ |

กำหนด PK หรือ UNIQUE เป็น `(session_id, user_id)` ไม่ให้หนึ่งบัญชีมีหลายแถวในนัดเดียวกัน

**ผู้จัดอยู่ในตารางนี้ด้วยและมีสถานะ `confirmed`** สร้างแถวของผู้จัดพร้อมนัดใน transaction เดียวกัน การเป็นผู้จัดตรวจจาก `sessions.host_id` ไม่เก็บ `is_host` ซ้ำอีกแห่ง

สถานะคำขอและการเป็นสมาชิกใช้แถวเดียวกันในระยะแรก: ขอ → pending, อนุมัติ/เข้าทันที → confirmed, ไม่อนุมัติ → declined, ถอน/ยกเลิกคำขอ → withdrawn หากต้องเก็บประวัติการเปลี่ยนทุกครั้งจึงค่อยเพิ่ม event log ไม่อ้างว่าแถวนี้เก็บประวัติทุกคำขอครบแล้ว

### `messages`

| ฟิลด์ | ชนิด/กติกา |
|---|---|
| `id` | UUID, PK |
| `session_id` | UUID, FK ไป `sessions.id` |
| `sender_id` | UUID, FK ไป `profiles.id` |
| `client_message_id` | UUID ที่ client สร้างไว้ใช้ส่งซ้ำโดยไม่สร้างข้อความซ้ำ |
| `body` | text, ต้องไม่เป็นข้อความว่าง |
| `created_at` | timestamptz จากบริการ/ฐานข้อมูล |

เพิ่ม UNIQUE `(session_id, sender_id, client_message_id)` การส่งซ้ำด้วย ID เดิมต้องคืนข้อความเดิมและไม่เขียนทับข้อความจาก payload ใหม่ สถานะ “กำลังส่ง/ส่งไม่สำเร็จ” เป็นสถานะใน client ไม่ควรสร้างข้อความที่ยืนยันแล้วก่อนบริการตอบกลับ

## 3. จำนวนคนและสถานะที่ frontend เห็น

```text
confirmed_count = จำนวนแถว session_members ที่ status = confirmed
occupied_count  = confirmed_count + guest_count
seats_remaining = team_size - occupied_count
```

**สูตรนี้นับผู้จัดใน confirmed_count แล้ว ห้ามบวกผู้จัดอีก 1 คน** จึงให้ผลเดียวกับ brief frontend ที่เขียนว่า ผู้จัด + เพื่อน + สมาชิกอื่น

อย่าเก็บ `current_count`, `remaining_count` และ `is_full` เป็นค่าที่ frontend แก้เอง ในระยะแรกคำนวณจากข้อมูลหลัก หากต้องเพิ่ม cache ภายหลังต้องมีเจ้าของการอัปเดตและการตรวจความสอดคล้องที่ชัดเจน

| เงื่อนไขตามลำดับ | สถานะแสดงผล |
|---|---|
| lifecycle = cancelled | ยกเลิก |
| lifecycle = completed | จบแล้ว |
| active และ recruitment_open = false | ปิดรับ |
| active และเปิดรับ แต่ seats_remaining = 0 | เต็ม |
| active และเปิดรับ และ seats_remaining > 0 | เปิดรับ |

กติกาต้องรักษา `occupied_count <= team_size` ถ้าพบค่าผิดให้ตรวจต้นเหตุ ไม่ใช้การตัดตัวเลขเหลือศูนย์ใน UI กลบปัญหา เมื่อคนถอนจากนัดเต็มและยังเปิดรับอยู่ สถานะจะกลับมาเปิดรับได้โดยไม่ต้องเปลี่ยน `is_full` อีกแถว

## 4. งานเขียนต้องผ่านทางที่ควบคุมกติกา

เสนอบริการ/คำสั่งชื่อเชิงแนวคิดต่อไปนี้ ชื่อยังไม่ใช่ endpoint หรือ RPC ที่เปิดจริง:

| คำสั่ง | งานสำคัญ |
|---|---|
| `create_session` | สร้างนัดและสมาชิกผู้จัดพร้อมกัน; ถ้าอย่างใดล้มเหลวไม่เหลือนัดครึ่งเดียว |
| `join_session` | ตรวจผู้เรียก สิทธิ์ สถานะ การบล็อก จำนวนที่นั่ง และ join policy; คืน confirmed หรือ pending |
| `decide_join_request` | ผู้จัดอนุมัติ/ปฏิเสธ pending; การอนุมัติต้องตรวจที่นั่งใหม่ |
| `withdraw_membership` | เจ้าตัวถอน confirmed หรือยกเลิก pending; ผู้จัดยังถอนแบบสมาชิกทั่วไปไม่ได้ |
| `update_session` | ผู้จัดแก้ข้อมูล; หากเปลี่ยน team_size/guest_count ต้องตรวจยอดรวมใหม่ |
| `set_recruitment` | ผู้จัดปิด/เปิดรับ; เปิดได้เฉพาะนัด active |
| `end_session` | ผู้จัดจบหรือยกเลิก; ใช้สถานะปลายทางที่ชัดเจน |
| `replace_guest_with_member` | ผู้จัดระบุบัญชีที่จะมาแทน guest พร้อมความยินยอมของผู้เข้าร่วม; ลด guest และเพิ่ม confirmed ใน transaction เดียว |
| `send_message` | ตรวจผู้ส่งเป็นสมาชิก confirmed และนัดยัง active ก่อนเขียนข้อความ |

เมื่อมี pending อยู่แล้วหรือเป็นสมาชิกแล้ว การเรียกซ้ำต้องคืนสถานะเดิม ไม่แทรกซ้ำและไม่อนุมัติตัวเองผ่าน join ใหม่ หากเปลี่ยนวิธีรับคน ข้อเสนอระยะแรกคือคำขอ pending เดิมยังให้ผู้จัดตัดสิน ไม่แปลงทุกคนเป็น confirmed เอง ส่วน declined/withdrawn จะส่งคำขอใหม่ได้ตามกติกาที่ต้องยืนยัน

คำสั่งเปลี่ยนสมาชิก จำนวนเพื่อน จำนวนทีม การรับคน และสถานะนัด ต้องใช้ transaction และล็อกแถวนัดเดียวกันก่อนตรวจ/แก้ข้อมูล เพื่อไม่ให้แต่ละเส้นทางข้ามกัน

ตัวอย่างแนวทางสำหรับเข้าร่วมทันที — ไม่ใช่ SQL พร้อมรัน:

```text
ตรวจตัวตนจาก session/JWT ที่บริการตรวจแล้ว
เริ่ม transaction
  ล็อก sessions แถวเป้าหมายด้วย SELECT ... FOR UPDATE
  ตรวจ active / recruitment_open / สิทธิ์ / การบล็อก
  ตรวจสมาชิกเดิม ป้องกันการเรียกซ้ำ
  อ่านยอด confirmed และ guest_count หลังได้ล็อก
  หากไม่มีที่นั่ง คืน session_full โดยไม่เขียนสมาชิก
  หากเข้าได้เลย เปลี่ยน/เพิ่มเป็น confirmed
  หากรออนุมัติ เปลี่ยน/เพิ่มเป็น pending โดยไม่จองที่นั่ง
  คืนผลและจำนวนคนล่าสุด
commit
```

PostgreSQL อธิบายว่า `FOR UPDATE` ล็อกแถวต่อ transaction อื่นที่ต้องการล็อก/แก้แถวเดียวกันจนจบ transaction ตาม [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) การออกแบบนี้จึงจะใช้ได้เมื่อ **ทุกทางที่กระทบจำนวนและสถานะใช้ล็อกนัดเดียวกัน** และห้าม client เขียนข้ามบริการโดยตรง ต้องเลือก isolation และทดสอบ concurrency จริงก่อนใช้; หากใช้ระดับที่เกิด serialization failure ต้องรองรับ retry ที่ปลอดภัย

ไม่แยก “อ่านจำนวนที่ว่าง” กับ “เขียนเข้าร่วม” เป็นคนละ request แล้วหวังว่าจะไม่มีใครแทรกระหว่างกลาง

## 5. สิทธิ์และขอบเขตข้อมูล

| ข้อมูล | นโยบายตั้งต้นที่เสนอ |
|---|---|
| โปรไฟล์ | อ่านเฉพาะข้อมูลที่ใช้แสดงในแอป; เจ้าของแก้ของตัวเอง |
| สนาม | อ่านข้อมูลสนามตั้งต้น; ให้ทีม/ผู้ดูแลแก้ในระยะแรก |
| สรุปนัด | คืนข้อมูลสาธารณะที่ใช้ค้นหาและจำนวนรวม |
| สมาชิก/คำขอ | เจ้าตัวเห็นสถานะตน; ผู้จัดเห็นคำขอของนัดตน; รายชื่อ confirmed เปิดให้สมาชิกที่เกี่ยวข้องตามกติกา |
| ข้อความ | ผู้จัด/สมาชิก confirmed อ่าน; ส่งได้เมื่อยัง active; pending/บุคคลนอกอ่านไม่ได้ |
| การบล็อก | เจ้าของรายการอ่านและจัดการของตน ไม่เปิดรายชื่อบล็อกต่อสาธารณะ |
| รายงานปัญหา | ผู้รายงานและผู้ดูแลตามหน้าที่ ไม่ให้ผู้ถูกรายงานแก้หรืออ่านข้อมูลผู้รายงานโดยอัตโนมัติ |

ใช้ RLS ร่วมกับ grants และการตรวจผู้เรียก ไม่พึ่งเพียงการซ่อนปุ่มใน frontend ตาม [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) การคืนจำนวนรวมสำหรับฟีดต้องผ่านคำค้น/บริการที่ตั้งสิทธิ์ให้ถูก ไม่เปิดเผยรายชื่อ pending ทั้งหมดเพียงเพื่อให้ client นับได้

ข้อเสนอระยะแรก: สมาชิก confirmed อ่านประวัติแชทของนัด completed/cancelled ได้แต่ส่งไม่ได้; ผู้ถอนตัวเสียสิทธิ์อ่าน/ส่ง การเก็บข้อความนานเท่าไรยังต้องตกลงและไม่ควรผูกกับการลบสมาชิกทันที

หากใช้ database functions ให้ตรวจสิทธิ์ทุกคำสั่ง เลือก `security invoker` เมื่อเพียงพอ หากต้องใช้ `security definer` ให้แยก helper ใน schema ที่ไม่เปิด Data API, กำหนด `search_path`, จำกัด execute และตรวจตัวตน/ขอบเขตข้อมูลใน helper ด้วย การให้สิทธิ์ execute ไม่ได้แทนการตรวจเจ้าของข้อมูล ตาม [Supabase: Database Functions](https://supabase.com/docs/guides/database/functions) ต้องออกแบบ read summaries และช่องทางเขียนให้สอดคล้องกับ RLS ก่อนเปิดจริง

## 6. ตารางสนับสนุนและดัชนี

- `user_blocks`: `blocker_id`, `blocked_id`, `created_at`; PK เป็นคู่ผู้ใช้และห้ามบล็อกตัวเอง ต้องตกลงผลเมื่อคนที่บล็อกกันอยู่ในนัดเดียวกันแล้ว ไม่ลบคนออกเองโดยไม่มีข้อตกลง
- `reports`: `id`, `reporter_id`, เป้าหมาย user/session/message, `reason`, `status`, `created_at`; ต้องระบุเป้าหมายที่มีอยู่จริงและตรวจว่าอ้าง message/session สอดคล้องกัน หากต้องลบข้อความให้พิจารณาการเก็บหลักฐานรายงานก่อน

ดัชนีเริ่มต้นที่เสนอ:

| ดัชนี | ใช้กับ |
|---|---|
| `sessions(court_id, starts_at)` | นัดของสนามและช่วงเวลา |
| `sessions(host_id, starts_at)` | นัดที่ฉันจัด |
| `sessions(starts_at)` แบบ partial สำหรับ active + เปิดรับ | ค้นหานัดที่ยังเกี่ยวข้อง; เงื่อนไขที่ว่างยังต้องอ่านจำนวนสมาชิก |
| UNIQUE/PK `session_members(session_id, user_id)` | สมาชิกไม่ซ้ำและค้นหาคนในนัด |
| `session_members(user_id, status, session_id)` | นัดของฉัน |
| `messages(session_id, created_at, id)` | แชทแบบแบ่งหน้า |
| GiST บน `courts.location` | ค้นหาสนามเชิงพื้นที่เมื่อใช้ PostGIS |

ไม่สร้างดัชนีทุกคอลัมน์โดยไม่มีคำค้นรองรับ ตรวจแผนคำค้นหลังมีข้อมูลทดลอง และตรวจว่าการนับภายใต้ RLS ให้ค่าตรงกับที่บริการต้องการจริง

## 7. สิ่งที่ส่งให้ frontend เป็นข้อตกลงร่วม

ตัวอย่างผลอ่านนัดหนึ่งรายการ — ข้อมูลสมมติ:

```json
{
  "id": "session-demo-01",
  "title": "บาสเย็น รับคนเพิ่ม",
  "teamSize": 5,
  "confirmedCount": 1,
  "guestCount": 2,
  "occupiedCount": 3,
  "seatsRemaining": 2,
  "displayStatus": "open",
  "myMembershipStatus": null,
  "joinPolicy": "instant"
}
```

ID ข้างต้นเป็น placeholder สำหรับอธิบาย ไม่ใช่ UUID ที่จะใช้จริง เพิ่มข้อมูลสนาม เวลา ผู้จัด และสิทธิ์ปุ่มตามที่หน้าจอต้องใช้ อย่าส่งแถวฐานข้อมูลทั้งหมดโดยไม่เลือกฟิลด์

ตกลงรหัสผลลัพธ์ เช่น `joined`, `pending`, `already_joined`, `session_full`, `recruitment_closed`, `session_inactive`, `forbidden` ให้ frontend แสดงข้อความและอัปเดตนัดเดียวกันทุกหน้า รหัสเหล่านี้เป็นข้อเสนอ ยังไม่ใช่ API ที่ติดตั้งแล้ว

## 8. ลำดับทำและการตรวจที่ต้องผ่าน

1. ตรวจ schema/โค้ดเดิมก่อน ไม่ rename ตาราง `games` หรือ migrate ข้อมูลที่มีอยู่ทันทีตามเอกสารฉบับนี้
2. ตกลง field, สถานะ, รูปแบบผลตอบกลับ และกติกาบัญชี/guest กับ frontend
3. เขียน migration ตาราง ความสัมพันธ์ CHECK/UNIQUE และดัชนี
4. ทำสิทธิ์อ่านและคำสั่งเขียนแบบ transaction; ตั้ง grants/RLS ให้ client ข้ามทางเขียนที่คุมกติกาไม่ได้
5. ทดสอบการสร้างนัดล้มเหลวแล้วไม่ค้างครึ่งเดียว สมาชิกซ้ำ และคำขอ pending ไม่นับที่นั่ง
6. ทดสอบหลาย client แย่งที่นั่งสุดท้าย รวมถึงอนุมัติพร้อม join, เพิ่ม guest พร้อม join, ลด team_size พร้อมอนุมัติ และยกเลิกพร้อม join
7. ทดสอบผู้จัด/สมาชิก/pending/คนนอก อ่านหรือแก้ข้อมูลได้ตามสิทธิ์ โดยเฉพาะข้อความ คำขอ และรายงาน
8. เชื่อม frontend และตรวจว่าจำนวน/สถานะในฟีด รายละเอียด และนัดของฉันตรงกัน

รายการข้างต้นเป็นแผนตรวจจากแบบร่างเดิม ปัจจุบันมีการตรวจ SQL/RLS และ concurrency ของ core ในเครื่องแล้วตาม backend/VALIDATION_TH.md ส่วน Supabase จริงและ frontend integration ยังไม่ตรวจ ต้องยืนยันนโยบายลบบัญชี/ข้อมูลและประวัติก่อนกำหนด `ON DELETE` ของทุกความสัมพันธ์; migrations v0.1 ยังไม่ใส่ cascade ลบข้อมูลต่อกันอัตโนมัติ

เอกสารที่ใช้คู่กัน: [Frontend Brief](HoopUp_Frontend_Brief_TH.md) และ [รายงานแนวคิดฉบับรวม](HoopUp_Combined_Concept_Report_TH_2026-10-26.md)
