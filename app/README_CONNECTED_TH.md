# คู่มือการเชื่อมต่อ HoopUp Frontend กับ Backend Server (Connected Mode)

เอกสารฉบับนี้อธิบายสถาปัตยกรรม วิธีการตั้งค่า และขั้นตอนการทดสอบโหมดเชื่อมต่อ API จริง (`connected-api`) ของแอปพลิเคชัน HoopUp

---

## 1. ภาพรวมสถาปัตยกรรม (Architecture Overview)

HoopUp รองรับโหมดการทำงาน 3 โหมดผ่าน `AppServicesProvider` (`src/services/AppServicesProvider.tsx`):

1. **Connected API (`connected-api`)**: เชื่อมต่อไปยัง Fastify Backend Server ของเราเอง ผ่าน `ApiAuthService` และ `ApiDataService` ใน `src/services/apiAdapter.ts`
2. **Connected Supabase (`connected-supabase`)**: เชื่อมต่อไปยัง Supabase ผ่าน `SupabaseAuthService` และ `SupabaseDataService`
3. **Demo (`demo`)**: ใช้งานข้อมูลจำลองในเครื่อง (Mock In-Memory Adapter)

ลำดับความสำคัญ (Precedence):
- หากมีการตั้งค่า `VITE_API_BASE_URL` ในสภาพแวดล้อม แอปพลิเคชันจะเลือกใช้งานโหมด **`connected-api`** เป็นหลัก
- หากไม่มี `VITE_API_BASE_URL` แต่มี `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` จะทำงานในโหมด **`connected-supabase`**
- หากไม่มีการตั้งค่าใดๆ หรือผู้ใช้กดสลับโหมดในหน้าจอ จะทำงานในโหมด **`demo`**

---

## 2. การตั้งค่า Environment Variables

สร้างหรือแก้ไขไฟล์ `.env` ในไดเรกทอรี `app/`:

```env
# URL ของ Fastify Backend Server ของเรา (เช่น รันบนพอร์ต 3000)
VITE_API_BASE_URL=http://localhost:3000
```

> **หมายเหตุความปลอดภัย:**
> ไม่ต้องระบุคีย์ลับหรือ JWT Secret บน Frontend! ฝั่ง Frontend รับและส่ง Access Token ผ่าน Bearer Header เท่านั้น

---

## 3. สัญญาณข้อมูลและ Contract Mapping (contractMapping.ts)

Backend Server สื่อสารผ่าน REST Endpoints และ RPC Endpoints (15 ฟังก์ชัน hoopup_*):

| เส้นทาง (Endpoint) | เมธอด (Method) | คำอธิบาย |
|---|---|---|
| `/auth/signup` | POST | ลงทะเบียนบัญชีใหม่ (email, password 10-72 ไบต์, displayName) |
| `/auth/login` | POST | เข้าสู่ระบบและรับ JWT Access Token |
| `/auth/me` | GET | ตรวจสอบข้อมูลผู้ใช้ปัจจุบันจาก Bearer Token |
| `/courts` | GET | ดึงรายชื่อสนามบาสเกตบอลที่บันทึกไว้ |
| `/messages?sessionId=...` | GET | ดึงประวัติการแชทประจำนัด (ถูกกรองด้วย RLS ตามสิทธิ์สมาชิก) |
| `/session_members?sessionId=...` | GET | รายชื่อสมาชิกในนัด |
| `/rpc/hoopup_*` | POST | เรียกใช้งาน 15 คำสั่งทางธุรกิจ (สร้างนัด, เข้าร่วม, ถอนตัว, ส่งข้อความ ฯลฯ) |

ฟังก์ชันแปลงรูปแบบข้อมูล (`contractMapping.ts`):
- `mapProfileRowToUserProfile`: แปลงโครงสร้าง snake_case จาก PostgreSQL สู่ camelCase (UserProfile)
- `mapBackendCommandResult`: แปลงผลลัพธ์คำสั่งจาก backend
- `mapCourtRowToCourt`: แปลงข้อมูลแถวสนามสู่โมเดล Court

---

## 4. มาตรการความปลอดภัยและ Token Lifecycle

1. **Storage Isolation**: Token ถูกจัดเก็บในหน่วยความจำ (in-memory) และสำรองใน sessionStorage เพื่อรองรับการรีเฟรชหน้าจอ (ไม่จัดเก็บใน localStorage เพื่อป้องกัน Token ค้างถาวร)
2. **Auto-Eviction เมื่อ 401**: หากฝั่ง Backend ปฏิเสธ Token ด้วยรหัส HTTP 401 (หมดอายุหรือถูกแก้ไข) apiAdapter จะล้าง Token ทันทีและส่งสัญญาณรีเซ็ตสถานะล็อกอิน
3. **No Leakage Policy**: รหัสผ่านและ JWT Token จะไม่มีการแสดงผลใน DOM (นอกเหนือจากช่องกรอกรหัสผ่านที่ถูก Mask ไว้) และไม่มีการบันทึกลง Console Log
4. **Thai Client Validation**:
   - อีเมล: ตรวจสอบรูปแบบ Regex ตามมาตรฐาน
   - รหัสผ่าน: ความยาว 10 ถึง 72 ไบต์ตามมาตรฐานความปลอดภัย
   - ชื่อที่แสดง: ความยาวไม่เกิน 60 ตัวอักษร

---

## 5. คำสั่งการทดสอบ (Testing)

### ก) การรัน Connected E2E Acceptance Tests
รันชุดการทดสอบ E2E อัตโนมัติ (จะเปิด Temporary PostgreSQL Cluster + Fastify Server + Vite อัตโนมัติ):

```bash
npm run e2e:connected
```

ผลลัพธ์การทดสอบ 7 รายการ:
- **TC-BE2-01**: ลงทะเบียนผู้ใช้ 2 คนผ่าน UI พร้อมจับภาพหน้าจอ Login และ Sign-up ขนาด 360x800
- **TC-BE2-02**: โฮสต์สร้างนัด 3x3, ผู้เข้าร่วมกด Join, สมาชิกทั้งสองคนส่งข้อความแชทโต้ตอบกัน
- **TC-BE2-03**: บุคคลภายนอกไม่สามารถมองเห็นข้อความแชท (ตรวจสอบทั้ง UI Banner และการเรียก GET /messages ตรงตาม RLS)
- **TC-BE2-04**: การทดสอบ Concurrency: ผู้สมัคร 8 คนแย่งที่นั่งสุดท้ายพร้อมกัน ได้รับผลสำเร็จ 1 คน และติด Conflict 7 คน
- **TC-BE2-05**: ป้อนรหัสผ่านผิด แสดงข้อความภาษาไทย "อีเมลหรือรหัสผ่านไม่ถูกต้อง" โดยไม่รั่วไหล Token หรือรหัสผ่าน
- **TC-BE2-06**: การกดออกจากระบบ (Sign Out) ล้าง Token และรีโหลดไม่ล็อกอินซ้ำ
- **TC-BE2-07**: เมื่อพบ Token ขยะหรือหมดอายุใน sessionStorage ระบบกลับสู่หน้าล็อกอินอย่างปลอดภัย

### ข) การรัน Baseline Demo Suites
- Typecheck: `npm run typecheck`
- Unit Tests: `npm test`
- Production Build: `npm run build`
- Linter: `npm run lint`
- Demo Playwright Tests: `npx playwright test`
