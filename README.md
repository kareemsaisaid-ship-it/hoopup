# HoopUp

แอปหาคนเติมทีม / นัดเล่นบาสที่สนามสาธารณะ (กรุงเทพฯ)

## โครงสร้าง

| โฟลเดอร์ | คืออะไร |
|---|---|
| `app/` | หน้าแอป React 19 + Vite + TypeScript, แผนที่ MapLibre, เทส Playwright |
| `backend/server/` | API Fastify + PostgreSQL, ไฟล์แผนที่ `tiles/bangkok.pmtiles`, ข้อมูลสถานที่ `data/` |
| `backend/migrations/`, `backend/server/sql/` | SQL schema และ seed สนาม |
| `docs/` | เอกสารแนวคิด ฐานข้อมูล และสถานะฟีเจอร์ |

## รันแบบ demo (ไม่ต้องมี backend)

```bash
cd app
npm install
npm run dev
```

เปิด http://localhost:5173 แล้วเลือกผู้ใช้ทดลองจากแถบ DEMO

แผนที่ฐาน: ตั้ง `VITE_MAP_PMTILES_URL` ให้ชี้ไปที่ `bangkok.pmtiles` ที่ backend เสิร์ฟ (ดู `app/.env.example`)
ถ้าไม่ตั้ง แผนที่จะแสดงเฉพาะหมุดสนามบนพื้นเรียบ

## รัน backend

ดู `backend/server/README_TH.md` (ต้องมี PostgreSQL) — คัดลอก `.env.example` เป็น `.env` แล้วเปลี่ยนรหัสผ่าน / `JWT_SECRET` เอง ห้าม commit ไฟล์ `.env`

## ทดสอบ

```bash
cd app && npm test && npm run e2e
cd backend/server && npm test
```

ข้อมูลแผนที่ © OpenStreetMap contributors (ODbL), Protomaps; สถานที่ © Overture Maps Foundation — ดู `NOTICE_OVERTURE.md` และ `app/public/THIRD_PARTY_NOTICES.md`
