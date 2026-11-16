# HoopUp MVP — Basketball Pickup Game Mobile Web App

เว็บแอปพลิเคชันรวมพลคนเล่นบาสเกตบอล (Pickup Game & Court Discovery) พัฒนาด้วย React 19 + TypeScript + Vite

---

## 1. วิธีเริ่มใช้งานและรันระบบ

### 1.1 โหมดจำลองข้อมูลในเครื่อง (Demo Mode) — แนะนำสำหรับการพัฒนาและทดสอบ E2E
ไม่ต้องตั้งค่า Cloud หรือ Supabase ใดๆ ตัวแอปจะจำลองฐานข้อมูล สนาม ผู้เล่น และการซิงค์ข้อมูลระหว่างหน้าต่าง/แท็บผ่าน `localStorage` และ `BroadcastChannel` ทันที

```bash
cd app
npm install
npm run dev
```
เปิดบราวเซอร์ที่: [http://localhost:5173](http://localhost:5173)

- **ผู้เล่นจำลอง:** สลับตัวละครได้ทันทีผ่านแถบด้านบน (Host Demo, Joiner 1 Demo, Joiner 2 Demo) โดยแต่ละแท็บสามารถเลือกผู้เล่นแยกกันได้อย่างอิสระ
- **รีเซ็ตข้อมูล Mock:** กดปุ่ม "รีเซ็ต" บนแถบด้านบน หรือเรียก `window.__HOOPUP_DEMO_RESET__()` ใน Console หรือเปิด URL ด้วย query `?demo_reset=true`

### 1.2 โหมดเชื่อมต่อ Supabase จริง (Connected Mode)
ใช้สำหรับทดสอบร่วมกับ Supabase Database ที่รัน migrations เรียบร้อยแล้ว

1. คัดลอกไฟล์การตั้งค่า:
   ```bash
   cp .env.example .env
   ```
2. แก้ไขค่า `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ในไฟล์ `.env` ด้วยค่า Publishable Anon Key เท่านั้น (**ห้ามใช้ Secret / Service-Role Key เด็ดขาด**)
3. เริ่มรันแอป:
   ```bash
   npm run dev
   ```
4. หากไม่ได้ระบุตัวแปรสภาพแวดล้อม แอปจะแจ้งเตือนว่า **Not Configured** และเปิดให้ใช้งานผ่าน Demo Mode โดยไม่แอบสลับเป็น Mock แบบเงียบๆ

---

## 2. วิธี Seed ข้อมูลสนามสำหรับ Development

ในสภาพแวดล้อม Dev ที่มี Supabase รันอยู่:
1. ตรวจสอบว่าได้รัน migrations ใน `../backend/migrations/` (001, 002, 003) แล้ว
2. Seed ข้อมูลสนามตัวอย่างเข้าตาราง `public.courts`:
```sql
insert into public.courts (id, name, address, latitude, longitude, surface_type, is_indoor, has_lighting, hoop_count, opening_hours_note)
values
  ('c1111111-1111-4111-8111-111111111111', 'สวนเบญจกิติ (Benjakitti Park)', 'ถ.รัชดาภิเษก แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร', 13.7314, 100.5583, 'Polyurethane Outdoor', false, true, 4, 'เปิดทุกวัน 05:00 - 21:00 น.'),
  ('c2222222-2222-4222-8222-222222222222', 'สวนลุมพินี (Lumpini Park Court)', 'ถ.พระรามที่ 4 แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร', 13.7317, 100.5414, 'Asphalt Outdoor', false, true, 2, 'เปิดทุกวัน 05:00 - 20:30 น.'),
  ('c3333333-3333-4333-8333-333333333333', 'สนามบาสเกตบอล กกท. หัวหมาก', 'ถ.รามคำแหง แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร', 13.7558, 100.6225, 'Indoor Parquet', true, true, 6, 'เปิด 08:00 - 21:00 น.');
```

---

## 3. คำสั่งการทดสอบและ Build

- **Typecheck:** `npm run typecheck`
- **Unit Tests:** `npm run test`
- **E2E Tests (Playwright):** `npm run e2e`
- **Production Build:** `npm run build`

---

## 4. ข้อจำกัดและรายการที่ยังไม่ตรวจใน MVP v0.1

1. **Authentication Providers จริง:** ยังไม่ได้ผูก Google/Apple OAuth ใน MVP รองรับการเข้าสู่ระบบด้วย Password ใน Connected Mode และ Identity Switcher ใน Demo Mode
2. **Realtime Push Notifications / WebSockets:** การอัปเดตข้อมูลยังใช้ Polling/Manual Refresh หรือ Cross-tab BroadcastChannel ในโหมด Demo
3. **การอัปโหลดไฟล์รูปภาพ:** รูปโปรไฟล์และภาพสนามใช้ URL/Path อ้างอิง ยังไม่มี Supabase Storage Upload
4. **PostGIS Radius Query:** ใช้การเรียงตามเวลาและตัวกรองพื้นฐาน
