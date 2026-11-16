# HoopUp Backend Server (Node.js + PostgreSQL + Own JWT Auth)

คู่มือระบบเซิร์ฟเวอร์ Backend สำหรับโปรเจกต์ HoopUp พัฒนาขึ้นเพื่อทดแทน Supabase Cloud ด้วยเซิร์ฟเวอร์ Node.js + PostgreSQL ตัวเองตามมติโปรเจกต์ 2 พฤศจิกายน 2569

---

## 1. ข้อมูลภาพรวมและเทคโนโลยี (Architecture Overview)

เซิร์ฟเวอร์นี้ทำหน้าที่เป็น HTTP API Gateway ขนาดเล็ก ปลอดภัย ครอบฟังก์ชัน PostgreSQL และระบบ RLS เดิมที่มีอยู่แล้ว (Migrations 001–003) โดยเพิ่มระบบยืนยันตัวตนด้วยอีเมล/รหัสผ่านและออก JWT token เอง

- **Runtime**: Node.js v24.19.0 (ESM mode: `"type": "module"`)
- **HTTP Framework**: Fastify `5.12.7` (ประสิทธิภาพสูง, กำหนด bodyLimit 64 kB, ใส่ Security Headers อัตโนมัติ)
- **Database Driver**: `pg` `8.23.1` (PostgreSQL Connection Pooling, รองรับ Transaction-scoped GUC config)
- **Authentication**: `jose` `6.2.14` (ลงนามและตรวจสอบ JWT ด้วยอัลกอริทึม HS256 ที่รัดกุม ป้องกัน `alg: none`)
- **Password Hashing**: `bcryptjs` `3.0.3` (Salt rounds = 12)
- **Test Framework**: `node:test` + `node:assert` (Built-in ของ Node.js ไม่ใช้ dependency ภายนอก)

---

## 2. วิธีการติดตั้งและรันเซิร์ฟเวอร์ (How to Run)

คำสั่งด้านล่างเป็นคำสั่ง PowerShell ที่รันได้จริงบน Windows:

### 2.1 ติดตั้ง Dependencies

```powershell
cd C:\D_Drive\terminter01\garage\project_ideas\basketball\backend\server
npm.cmd install
```

### 2.2 การรันชุดทดสอบอัตโนมัติ (Automated Tests)

ชุดทดสอบจะทำการสร้าง Temp PostgreSQL Cluster บนพอร์ตสุ่มอัตโนมัติ (ใช้ portable binaries จาก `tools\pgsql\bin`), รัน migrations 001–004, สตาร์ตเซิร์ฟเวอร์บนพอร์ตสุ่ม และทดสอบ HTTP ครบ 14 สถานการณ์:

```powershell
cd C:\D_Drive\terminter01\garage\project_ideas\basketball\backend\server
npm.cmd test
```

### 2.3 การรันเซิร์ฟเวอร์ในสภาพแวดล้อมจริง (Development / Production)

1. คัดลอกไฟล์การตั้งค่าสภาพแวดล้อม:
```powershell
Copy-Item .env.example .env
```
2. แก้ไขค่าในไฟล์ `.env` เช่น `DATABASE_URL` และ `JWT_SECRET`
3. สตาร์ตเซิร์ฟเวอร์:
```powershell
node src/index.js
# หรือ
npm.cmd start
```

### 2.4 การใส่สนามจริงจาก OSM (ใส่สนามจริงจาก OSM)

ระบบรองรับการนำเข้ารายชื่อสนามบาสเกตบอลจริงในกรุงเทพฯ จาก OpenStreetMap (OSM) เพื่อบันทึกเป็น Seed Data ลงในตาราง `public.courts`:

> [!NOTE]
> ข้อมูลสนามจาก OpenStreetMap เป็นข้อมูลที่ไม่ผ่านการตรวจสอบยืนยันโดยตรงจากทีมงาน (Unverified OSM Data) ดังนั้นคอลัมน์ `verified_at` ในฐานข้อมูลจะถูกคงค่าเป็น `NULL` เสมอ (OSM is not verification)

#### ขั้นตอนการสร้าง Seed SQL และการนำเข้า:
1. **สร้างไฟล์ SQL Seed จากข้อมูล OSM ล่าสุด**:
   ```powershell
   cd C:\D_Drive\terminter01\garage\project_ideas\basketball\backend\server
   node scripts/generate-osm-seed.mjs
   ```
   สคริปต์จะอ่านข้อมูลจาก `../../app/src/data/osmCourtsBangkok.json` ข้ามรายการ `osmQuality = 'excluded'` และสร้าง Primary Key ด้วย UUID v5 (`osm:<osmType>:<osmId>`) ซึ่งเป็น Deterministic ID ทำให้การรันซ้ำไม่เกิดข้อมูลซ้ำซ้อน (`INSERT ... ON CONFLICT (id) DO NOTHING`) จากนั้นบันทึกลงไฟล์ `sql/005_seed_osm_courts.sql` (148 แถว: unverified 146 แห่ง, positive 2 แห่ง)

2. **การนำไฟล์ Seed เข้าฐานข้อมูล PostgreSQL**:
   ```powershell
   psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -f sql/005_seed_osm_courts.sql
   ```
   *(หมายเหตุ: ในการรันชุดทดสอบอัตโนมัติ `npm.cmd test` ตัวช่วย `test/helpers/temp-postgres.js` จะนำ `sql/005_seed_osm_courts.sql` ไปประยุกต์ใช้ต่อจาก migration 004 ใน temp cluster ให้อัตโนมัติ)*

### 2.5 การเสิร์ฟแผนที่ PMTiles (เสิร์ฟแผนที่ PMTiles)

เซิร์ฟเวอร์รองรับการให้บริการไฟล์แผนที่เวกเตอร์แบบสถิตเพียงไฟล์เดียว (Protomaps PMTiles archive) สำหรับแสดงแผนที่ในเว็บเบราว์เซอร์ผ่าน HTTP Range Requests:

- **Route**: `GET /tiles/:file` และ `HEAD /tiles/:file` (เข้าถึงได้แบบสาธารณะ ไม่ต้องใช้ Bearer Token และไม่ถูกนับใน Auth Rate Limiter)
- **เงื่อนไขชื่อไฟล์**: ชื่อไฟล์ `:file` ต้องตรงตาม Regex `^[a-z0-9][a-z0-9_-]{0,63}\.pmtiles$` (เช่น `bangkok.pmtiles`) หากชื่อไฟล์ไม่ถูกต้องหรือมีความพยายาม Traversal (เช่น `..`, `%2f`, ตัวพิมพ์ใหญ่, ช่องว่าง, NUL byte) เซิร์ฟเวอร์จะคืนค่า 404 ด้วย Generic JSON body ทันทีโดยไม่มี Path Leakage
- **ไดเรกทอรีจัดเก็บ**: กำหนดผ่านตัวแปรสภาพแวดล้อม `TILES_DIR` (หรือค่าเริ่มต้นคือ `<backend/server>/tiles`) โดยระบบจะ resolve path และปฏิเสธ Symbolic Link รวมถึง path ที่อยู่นอกไดเรกทอรี
- **การเชื่อมต่อจากแอปพลิเคชัน (Frontend Integration)**:
  แอปพลิเคชัน Frontend (Protomaps PMTiles JS / MapLibre GL) จะชี้ URL แผนที่มาที่:
  ```
  http://127.0.0.1:3000/tiles/bangkok.pmtiles
  ```
  ไคลเอนต์จะส่ง HTTP Header `Range: bytes=start-end` เพื่อดึงเฉพาะ byte range ของ tile ที่ต้องการ และเซิร์ฟเวอร์จะตอบกลับด้วย `206 Partial Content` สตรีมผ่าน `fs.createReadStream({ start, end })` โดยไม่โหลดทั้งไฟล์เข้าหน่วยความจำ
- **ข้อกำหนด Reverse Proxy (สำคัญมาก)**:
  เมื่อรันหลัง Reverse Proxy (เช่น Nginx, Caddy, Cloudflare หรือ AWS ALB):
  - **ต้องอนุญาตให้ HTTP Header `Range` และ `If-None-Match` ส่งผ่าน (pass through) มายังเซิร์ฟเวอร์ Node.js ได้อย่างสมบูรณ์**
  - **ต้องเปิดให้ส่งต่อ Header ขาตอบกลับ**: `Content-Range`, `Content-Length`, `Accept-Ranges`, และ `ETag` กลับไปยังเบราว์เซอร์
  - Reverse Proxy ต้องไม่แคชแบบแปลง 206 เป็น 200 ทั้งก้อน หรือดรอป Header `Range`
- **การแคช (Cache Policy)**:
  - เซิร์ฟเวอร์ตอบกลับพร้อม `Cache-Control: public, max-age=3600` และ `ETag` (สร้างจากขนาดไฟล์และเวลาแก้ไขล่าสุด mtime)
  - รองรับ `If-None-Match`: เมื่อ ETag ตรงกัน เซิร์ฟเวอร์จะตอบ `304 Not Modified` ทันทีโดยไม่มี Body เพื่อประหยัดแบนด์วิดท์สูงสุด

### 2.6 ร้านค้า/สถานที่ใกล้สนาม (/places)

เซิร์ฟเวอร์ให้บริการ API ค้นหาสถานที่ใกล้สนามบาสเกตบอล (เช่น ร้านอาหาร ร้านสะดวกซื้อ ยิม/ฟิตเนส จุดจอดรถ สถานีรถไฟฟ้า ฯลฯ) จากชุดข้อมูล Overture Places ที่ผ่านการคัดกรองแล้ว:

- **Endpoint**: `GET /places?bbox=minLon,minLat,maxLon,maxLat&limit=300&cats=food,shop,...` (Public API ไม่ต้องใช้ Token)
- **พารามิเตอร์การค้นหา**:
  - `bbox`: ขอบเขตพิกัด 4 ค่าคั่นด้วยจุลภาค `minLon,minLat,maxLon,maxLat` ตรวจสอบความถูกต้องอย่างเข้มงวด (ต้องเป็นตัวเลขจริง, span กว้างไม่เกิน `0.06` องศาแต่ละแกน, พิกัดอยู่ในพื้นที่กรุงเทพฯ และปริมณฑล)
  - `limit`: จำนวนผลลัพธ์สูงสุด (ตัวเลขจำนวนเต็ม `1` ถึง `500`, ค่าเริ่มต้น `300`)
  - `cats`: ตัวเลือกกลุ่มหมวดหมู่ (คั่นด้วยจุลภาค) จาก 8 กลุ่มที่รองรับ:
    - `food`: ร้านอาหาร, คาเฟ่, กาแฟ, เบเกอรี่, บาร์, ฟาสต์ฟู้ด, สตรีทฟู้ด
    - `shop`: ร้านสะดวกซื้อ (7-Eleven), ซูเปอร์มาร์เก็ต, ห้างสรรพสินค้า, ตลาด
    - `sports`: ยิม, ฟิตเนส, สเตเดียม, สนามกีฬา, ร้านอุปกรณ์กีฬา
    - `parking`: ลานจอดรถ, อาคารจอดรถ
    - `transport`: สถานีรถไฟฟ้า BTS/MRT, สถานีรถไฟ, ท่าเรือ, ป้ายรถเมล์, สนามบิน
    - `health`: โรงพยาบาล, คลินิก, ร้านขายยา, ศูนย์กายภาพบำบัด
    - `education`: โรงเรียน, มหาวิทยาลัย, วิทยาลัย, ห้องสมุด
    - `lodging`: โรงแรม, โฮสเทล, รีสอร์ต, เกสต์เฮาส์
- **ดัชนีในหน่วยความจำ (In-Memory Uniform Grid Index)**:
  - โหลดข้อมูลจากไฟล์ NDJSON แบบ Lazy เมื่อมี Request แรกเข้ามา
  - จัดเก็บลงใน Uniform Grid Cell ขนาด ~0.005 องศา (~550 เมตร) เพื่อให้การค้นหาระดับ Viewport ตอบสนองได้อย่างรวดเร็ว (Latency ต่ำกว่า 10ms)
- **การตอบกลับและการตัดทอนข้อมูล (Truncation Policy)**:
  - โครงสร้าง JSON: `{ places: [{ i, n, c, g, x, y }], total, truncated }`
  - เมื่อจำนวนสถานที่ที่ตรงเงื่อนไขเกินกว่า `limit` ระบบจะตั้งค่า `truncated: true` และคัดเลือกสถานที่ที่มีค่าความเชื่อมั่น (Confidence) สูงที่สุดขึ้นมาก่อนเสมออย่างสม่ำเสมอ (Deterministic)
- **HTTP Headers และ Rate Limiter**:
  - แคช: `Cache-Control: public, max-age=300` พร้อม `ETag` (รองรับ `If-None-Match -> 304 Not Modified`)
  - Rate Limiter: จำกัด 120 requests/นาที ต่อ IP แยกบัคเก็ตอิสระจาก Credential Endpoints
- **ตัวอย่างคำสั่งเรียกใช้งาน (Example Requests)**:
  ```powershell
  # ค้นหาด้วยชื่อภาษาอังกฤษ
  curl.exe -s "http://127.0.0.1:3000/places/search?q=paragon&limit=3&near=100.534,13.746"

  # ค้นหาด้วยชื่อภาษาไทย (UTF-8 percent-encoded)
  curl.exe -s "http://127.0.0.1:3000/places/search?q=%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1%E0%B8%9E%E0%B8%B2%E0%B8%A3%E0%B8%B2%E0%B8%81%E0%B8%AD%E0%B8%99&limit=3&near=100.534,13.746"
  ```
- **ตัวอย่างผลลัพธ์ (JSON Response)**:
  ```json
  {
    "places": [
      {
        "i": "f9ca8592-403d-4068-83aa-36aa5b22a090",
        "n": "SIAM PARAGON",
        "c": "pharmacy",
        "g": "health",
        "x": 100.53489,
        "y": 13.74673,
        "d": 126
      }
    ],
    "total": 89,
    "truncated": true
  }
  ```

---

## 3. ตัวแปรสภาพแวดล้อม (Environment Variables)

ดูตัวอย่างไฟล์ [.env.example](.env.example):

| ตัวแปร | ค่าเริ่มต้น / ตัวอย่าง | จำเป็น? | คำอธิบาย |
|---|---|---|---|
| `PORT` | `3000` | ไม่ | พอร์ตที่เซิร์ฟเวอร์เปิดรับการเชื่อมต่อ |
| `HOST` | `127.0.0.1` | ไม่ | โฮสต์ที่เซิร์ฟเวอร์ bind (แนะนำ `127.0.0.1` สำหรับ local) |
| `DATABASE_URL` | `postgres://hoopup_api:hoopup_api_dev_password@127.0.0.1:5432/postgres` | **ใช่** | Connection string สำหรับ PostgreSQL (ใช้ role `hoopup_api`) |
| `JWT_SECRET` | *(string ความยาว >= 32 ตัวอักษร)* | **ใช่** | Secret key สำหรับ sign/verify JWT tokens ด้วย HS256 (ห้ามใช้ค่า dev ใน production) |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:5199` | แนะนำ | รายการ Origin ที่อนุญาต CORS (คั่นด้วยจุลภาค) |
| `LOG_LEVEL` | `info` | ไม่ | ระดับการบันทึก Log (`debug`, `info`, `warn`, `error`) |
| `TRUST_PROXY` | *(unset = false)* | แนะนำเมื่ออยู่หลัง proxy | ระบุ IP หรือ CIDR ของ Reverse Proxy (เช่น `127.0.0.1` หรือ `127.0.0.1,10.0.0.0/8`) หรือ hop count ห้ามตั้ง `true` หรือ `*` |
| `AUTH_RATE_LIMIT_MAX` | `10` | ไม่ | จำนวนครั้งสูงสุดที่อนุญาตให้เรียก endpoint `/auth/*` ต่อรอบเวลา ต่อ IP |
| `AUTH_RATE_LIMIT_WINDOW_MS`| `60000` | ไม่ | ระยะเวลารอบ Rate Limit ของ Auth (มิลลิวินาที, ค่าเริ่มต้น 1 นาที) |
| `LOGIN_LOCK_MAX` | `5` | ไม่ | จำนวนครั้งเข้าสู่ระบบล้มเหลวสูงสุดต่ออีเมล ก่อนล็อกคำขอชั่วคราว (ค่าเริ่มต้น 5 ครั้ง) |
| `LOGIN_LOCK_WINDOW_MS` | `900000` | ไม่ | กรอบเวลาสะสมความผิดพลาดของอีเมล (มิลลิวินาที, ค่าเริ่มต้น 15 นาที) |
| `LOGIN_LOCK_SECONDS` | `60` | ไม่ | ระยะเวลาการล็อกคำขอของอีเมลเมื่อครบขีดจำกัด (วินาที, ค่าเริ่มต้น 60 วินาที) |
| `RPC_RATE_LIMIT_MAX` | `120` | ไม่ | จำนวนครั้งสูงสุดที่อนุญาตให้เรียก endpoint `/rpc/*` ต่อผู้ใช้ (token sub) ต่อรอบเวลา |
| `RPC_RATE_LIMIT_WINDOW_MS` | `60000` | ไม่ | ระยะเวลารอบ Rate Limit ของ RPC (มิลลิวินาที, ค่าเริ่มต้น 1 นาที) |
| `DATA_RATE_LIMIT_MAX` | `300` | ไม่ | จำนวนครั้งสูงสุดที่อนุญาตให้เรียก GET data routes (`/courts`, `/messages*`, `/session_members*`, `/profiles/*`) ต่อผู้ใช้ |
| `DATA_RATE_LIMIT_WINDOW_MS` | `60000` | ไม่ | ระยะเวลารอบ Rate Limit ของ Data Routes (มิลลิวินาที, ค่าเริ่มต้น 1 นาที) |
| `USER_STATUS_CACHE_MS` | `30000` | ไม่ | อายุแคชสถานะผู้ใช้ในหน่วยความจำ (มิลลิวินาที, ค่าเริ่มต้น 30 วินาที, ตั้งเป็น 0 เพื่อปิดแคชและค้นหาฐานข้อมูลทุก request) |
| `DB_STATEMENT_TIMEOUT_MS` | `10000` | ไม่ | ขีดจำกัดเวลาสูงสุดในการประมวลผลคำสั่ง SQL (มิลลิวินาที, ค่าเริ่มต้น 10 วินาที) |
| `DB_IDLE_TX_TIMEOUT_MS` | `15000` | ไม่ | ขีดจำกัดเวลาสูงสุดของ Transaction ที่ค้างอยู่เฉยๆ (มิลลิวินาที, ค่าเริ่มต้น 15 วินาที) |
| `TILES_DIR` | `./tiles` | ไม่ | ไดเรกทอรีจัดเก็บไฟล์แผนที่ `.pmtiles` (ค่าเริ่มต้นคือ `<backend/server>/tiles`) |
| `PLACES_FILE` | `./data/places-bangkok.ndjson` | ไม่ | ไฟล์ข้อมูลสถานที่ Overture ในรูปแบบ NDJSON |
| `PLACES_RATE_LIMIT_MAX` | `240` | ไม่ | จำนวนครั้งสูงสุดที่อนุญาตให้เรียก endpoint `/places` ต่อรอบเวลา ต่อ IP |
| `PLACES_RATE_LIMIT_WINDOW_MS` | `60000` | ไม่ | ระยะเวลารอบ Rate Limit ของ `/places` (มิลลิวินาที, ค่าเริ่มต้น 1 นาที) |
| `PLACES_SEARCH_RATE_LIMIT_MAX` | `120` | ไม่ | จำนวนครั้งสูงสุดที่อนุญาตให้เรียก endpoint `/places/search` ต่อรอบเวลา ต่อ IP |
| `PLACES_SEARCH_RATE_LIMIT_WINDOW_MS` | `60000` | ไม่ | ระยะเวลารอบ Rate Limit ของ `/places/search` (มิลลิวินาที, ค่าเริ่มต้น 1 นาที) |
| `OIDC_PROVIDERS` | *(unset = ว่าง)* | ไม่ | รายชื่อ Provider สำหรับ OIDC คั่นด้วยจุลภาค (เช่น `google,line`) หากเว้นว่างจะปิดฟีเจอร์ OIDC (คืน 404) |
| `OIDC_ALLOWED_RETURN_URLS` | *(unset = ว่าง)* | ไม่ | รายชื่อ Return URLs ที่อนุญาตแบบ Exact match คั่นด้วยจุลภาค |
| `OIDC_<NAME>_CLIENT_ID` | *(unset = ว่าง)* | OIDC | Client ID ของ Provider (เช่น `OIDC_GOOGLE_CLIENT_ID`) |
| `OIDC_<NAME>_CLIENT_SECRET` | *(unset = ว่าง)* | OIDC | Client Secret ของ Provider |
| `OIDC_<NAME>_REDIRECT_URI` | *(unset = ว่าง)* | OIDC | Redirect URI ของ Backend ที่ลงทะเบียนไว้กับ Provider |

---

### ความปลอดภัย / Security settings

ระบบได้รับการปรับปรุงตามมาตรฐานความปลอดภัยเชิงลึก (Security Hardening):

1. **การตั้งค่า Reverse Proxy (`TRUST_PROXY`)**:
   - ค่าเริ่มต้นเมื่อไม่ระบุ (unset) คือ `false` ซึ่งระบบจะไม่เชื่อถือ Header `X-Forwarded-*` ใดๆ และจะใช้ IP จาก Direct Socket Connection เท่านั้น
   - เมื่อรันเซิร์ฟเวอร์หลัง Caddy หรือ Nginx ต้องตั้งค่า `TRUST_PROXY=127.0.0.1` หรือระบุ Subnet `127.0.0.1,10.0.0.0/8`
   - ระบบปฏิเสธค่า `true`, `*` และค่าว่าง (`''`) ทันทีตอนบูตระบบ เพื่อป้องกันการปลอมแปลง Header (IP Spoofing)
   - ข้อควรระวัง (ผู้จัดการเพิ่มหลังตรวจ): แบบ hop count (เช่น `TRUST_PROXY=1`) เชื่อ peer ทุกตัวที่ต่อเข้ามา ถ้าเครื่องภายนอกต่อเข้า backend ตรงๆ ได้ จะปลอม `X-Forwarded-For` เพื่อเลี่ยงตัวจำกัดได้ ทดสอบแล้ว ดังนั้นให้ใช้ IP/CIDR ของ proxy (เช่น `127.0.0.1`) เป็นหลัก และใช้ hop count ก็ต่อเมื่อ backend เข้าถึงได้ผ่าน proxy เท่านั้น (ค่าเริ่มต้น `HOST=127.0.0.1`)
2. **ความรัดกุมของ `JWT_SECRET`**:
   - ต้องมีความยาวอย่างน้อย 32 ตัวอักษรขึ้นไป (256 บิต)
   - สร้างคีย์สุ่มที่ปลอดภัยได้ด้วยคำสั่ง: `openssl rand -base64 48`
   - ในสภาพแวดล้อม Production (`NODE_ENV=production`) ระบบจะตรวจสอบ Blocklist และปฏิเสธคีย์ตัวอย่างจากการพัฒนาทันที
3. **การจำกัดอัตราคำขอรายบัญชีผู้ใช้ (Per-User Rate Limiting on Authenticated Traffic)**:
   - Route `/rpc/*`: จำกัดโควตาพื้นฐาน 120 ครั้ง/นาที ต่อบัญชีผู้ใช้ (`sub` ใน JWT)
   - ฟังก์ชันที่มีความสำคัญสูง (`hoopup_send_message`, `hoopup_create_session`, `hoopup_report`) มี Strict Limit เพิ่มเติมเป็นพิเศษที่ **20 ครั้ง/นาที ต่อผู้ใช้**
   - GET Data Routes (`/courts`, `/messages*`, `/session_members*`, `/profiles/*`): จำกัดโควตารวม 300 ครั้ง/นาที ต่อบัญชีผู้ใช้
   - เมื่อคำขอเกินโควตา ระบบจะตอบกลับด้วย HTTP `429 Too Many Requests` พร้อม Header `Retry-After`
   - Route สาธารณะ (`/health`, `/tiles/*`, `/places*`) และ `/auth/me` ไม่แชร์บัคเก็ตกับตัวจำกัดนี้
4. **การควบคุม Timeout ของการเชื่อมต่อฐานข้อมูล (DB Pool Timeouts)**:
   - `statement_timeout`: ค่าเริ่มต้น 10,000 ms (10 วินาที) ป้องกัน Long-running Queries จากการล็อกตารางหรือกิน CPU
   - `idle_in_transaction_session_timeout`: ค่าเริ่มต้น 15,000 ms (15 วินาที) ป้องกัน Transaction ค้าง
   - หากคำสั่งเกินเวลาที่กำหนด PostgreSQL จะยกเลิกคำสั่งด้วย Code `57014` ซึ่งเซิร์ฟเวอร์จะแปลงเป็น HTTP `503 Service Unavailable` แบบ Generic ทันทีโดยไม่มีการรั่วไหลของประโยค SQL
5. **การจำกัดคอลัมน์ข้อมูลโปรไฟล์และการควบคุมการแสดงผลส่วนสูง (Explicit Profile Columns & Height Visibility - HT1)**:
   - `/profiles/:userId` และ `/auth/me` ทำการคัดเลือกเฉพาะ 11 คอลัมน์ที่แอปพลิเคชันใช้งานจริงอย่างชัดเจน (`id`, `display_name`, `avatar_path`, `skill_level`, `primary_position`, `secondary_position`, `plays_any_position`, `height_cm`, `height_visible`, `created_at`, `updated_at`)
   - ไม่ใช้ `SELECT *` เพื่อป้องกันไม่ให้ข้อมูลหรือฟิลด์ที่อาจถูกเพิ่มลงในตารางในอนาคตรั่วไหลออกไป
   - **การควบคุมการแสดงผลส่วนสูงตามการตัดสินใจของผู้ใช้ (User-Controlled Height Visibility)**:
     - ฐานข้อมูลเพิ่มคอลัมน์ `height_visible boolean not null default false` ในตาราง `public.profiles` (ค่าเริ่มต้นคือซ่อนส่วนสูง / Opt-in)
     - `hoopup_save_profile(p_input jsonb)`: รองรับคีย์ `heightVisible` (boolean); หากไม่อยู่ในอ็อบเจกต์ที่ส่งเข้ามาในการอัปเดต ระบบจะคงค่าเดิมที่จัดเก็บไว้ในฐานข้อมูล (ไม่รีเซ็ตเป็น false); หากส่งค่าเข้ามาต้องเป็น JSON boolean เท่านั้น มิฉะนั้นจะปฏิเสธด้วย `invalid_input`
     - `GET /profiles/:userId`: ดำเนินการผ่าน SQL Projection แบบ Parameterized (`CASE WHEN id = $1::uuid OR height_visible THEN height_cm ELSE null END AS height_cm`):
       - หากผู้เรียกเป็นเจ้าของโปรไฟล์ (`id = $requester`): จะได้รับค่า `height_cm` และ `height_visible` ตามจริงเสมอ
       - หากผู้เรียกเป็นผู้ใช้อื่น: จะได้รับ `height_cm` เมื่อเจ้าของตั้งค่า `height_visible = true` เท่านั้น (หากเป็น false จะได้ค่า `null`) และจะได้รับ `height_visible` เป็น `null` เสมอ (ไม่เปิดเผยการตั้งค่าความเป็นส่วนตัวให้บุคคลภายนอก)
     - `GET /auth/me`: ส่งคืนข้อมูลโปรไฟล์ของเจ้าของบัญชีทั้งหมด รวมทั้ง `height_cm` และ `height_visible`
6. **การป้องกันการสืบค้นอีเมล (Signup Timing Mitigation)**:
   - การสมัครสมาชิกซ้ำยังคงตอบกลับด้วย HTTP `409 Email already registered` เพื่อให้สอดคล้องกับ UX และ Frontend Contract
   - กระบวนการแฮชรหัสผ่านด้วย `bcrypt` (Cost = 12) จะถูกดำเนินการก่อนตรวจสอบการซ้ำ ทำให้ระยะเวลาประมวลผลของการสมัครใหม่และบัญชีซ้ำใกล้เคียงกัน ป้องกัน Timing Attack
7. **การตรวจสอบความถูกต้องของอีเมล รหัสผ่าน และการล็อกบัญชีรายอีเมล (SEC3 Hardening)**:
   - **การตรวจสอบอีเมล (`validateEmail`)**: ปฏิเสธช่องว่าง (spaces) และ control characters ทุกตำแหน่ง, ปฏิเสธการมี `@` มากกว่าหนึ่งตัว, ปฏิเสธจุดนำหน้า/ต่อท้าย/ซ้อนกัน (`..`) ทั้งในส่วน local part และ domain, ตรวจสอบ domain label ห้ามขึ้นหรือลงท้ายด้วยเครื่องหมายขีด (`-`), ความยาว label สูงสุด 63 ตัวอักษร, ความยาว local part สูงสุด 64 ตัวอักษร, ความยาวรวมสูงสุด 254 ตัวอักษร, และ TLD ต้องมีตัวอักษรอย่างน้อย 2 ตัว (เช่น ปฏิเสธ `a@b.c`) โดยยังคงรองรับ plus-addressing (เช่น `user+tag@domain.test`) และโดเมน `.test` อย่างสมบูรณ์
   - **การตรวจสอบรหัสผ่าน (`validatePassword`)**: บังคับความยาว 10 ถึง 72 ไบต์, ตรวจสอบ Blocklist รหัสผ่านยอดนิยมมากกว่า 100 คำ พร้อมกฎตรวจจับคำฐาน (Base word) หลังตัดตัวเลข/สัญลักษณ์ต่อท้าย, ปฏิเสธรหัสผ่านที่เป็นตัวอักษรซ้ำตัวเดียวทั้งหมด (All same character), ปฏิเสธรหัสผ่านที่ตรงกับ local part ของอีเมลหรือ display name (case-insensitive), และปฏิเสธรูปแบบลำดับที่เดาง่าย เช่น `1234567890`, `qwertyuiop` ข้อความตอบกลับเป็น Generic Error โดยไม่มีการสะท้อนรหัสผ่านกลับไป
   - **การล็อกบัญชีรายอีเมลเมื่อล็อกอินผิดพลาด (Per-Account Login Lock)**: เมื่อเข้าสู่ระบบล้มเหลวติดต่อกันครบ 5 ครั้งสำหรับอีเมลเดียวกันภายใน 15 นาที คำขอถัดไปของอีเมลนั้นจะถูกปฏิเสธด้วย HTTP `429 Too Many Requests` พร้อม Header `Retry-After: 60` เป็นเวลา 60 วินาที โดยไม่เปิดเผยว่าอีเมลนั้นมีอยู่ในระบบหรือไม่ (อีเมลที่ไม่มีในระบบจะแสดงพฤติกรรม 429 แบบเดียวกัน) และจะปลดล็อกอัตโนมัติเมื่อพ้นระยะเวลาล็อก หรือถูกล้างทันทีเมื่อเข้าสู่ระบบสำเร็จ ตัวติดตามสถานะทำงานในหน่วยความจำ (In-memory) และเก็บคีย์เป็น SHA-256 Hash ของอีเมลที่ถูก Normalise เพื่อความเป็นส่วนตัว
8. **การระงับและลบบัญชีผู้ใช้ พร้อมตรวจสอบสถานะทุกคำขอ (BAN1 - User Status Enforcement & Moderation CLI)**:
   - **การตรวจสอบสถานะรายคำขอ (Per-Request Status Check)**:
     - ตรวจสอบสถานะบัญชี (`active`, `banned`, `deleted`, `missing`) สำหรับทุกคำขอที่ยืนยันตัวตนแล้ว ได้แก่ `/rpc/:name` (hoopup_* ทั้งหมด), GET Data Routes (`/courts`, `/messages*`, `/session_members*`, `/profiles/*` ผ่าน `getAuthenticatedUser`), และ `/auth/me`
     - ดำเนินการตรวจสอบทันทีหลังถอดรหัสและยืนยันความถูกต้องของ JWT Token สำเร็จ และก่อนการทำงานกับฐานข้อมูลหรือการหักโควตา Rate Limiter ใดๆ
     - หากบัญชีไม่อยู่ในสถานะ `active` (เช่น ถูกแบน, ถูกลบ, หรือ `sub` ใน Token ไม่มีอยู่ในฐานข้อมูล):
       - Route `/rpc/*`: ตอบกลับด้วย HTTP `403` พร้อม body `{ ok: false, code: 'account_suspended', error: 'Account unavailable' }`
       - Route `/courts`, `/messages*`, `/session_members*`, `/profiles/*`: ตอบกลับด้วย HTTP `403` พร้อม body `{ error: 'Account unavailable' }`
       - Route `/auth/me`: ตอบกลับด้วย HTTP `403` พร้อม body `{ error: 'Account unavailable' }`
     - Endpoint สาธารณะ (`/health`, `/tiles/*`, `/places*`) และ `/auth/signup` ไม่ถูกบล็อก
   - **ขอบเขตความหน่วงของแคช (Cache TTL & Lag Bound)**:
     - ใช้แคชในหน่วยความจำ `UserStatusCache` พร้อม Single-flight coalescing ป้องกัน Cache Stampede เมื่อมี Request พร้อมกันหลายตัว
     - ขอบเขตความหน่วง (Lag Bound): กำหนดผ่าน `USER_STATUS_CACHE_MS` ค่าเริ่มต้นคือ 30,000 ms (30 วินาที) เมื่อผู้ดูแลระบบสั่งแบนหรือลบบัญชี ผลจะส่งผลบังคับใช้กับเซิร์ฟเวอร์ที่กำลังรันอยู่ภายในระยะเวลาไม่เกิน 30 วินาที (หากตั้งค่าเป็น `0` จะปิดแคชและค้นหาฐานข้อมูลสดทุกครั้ง)
     - แคชมีการจำกัดขนาดสูงสุดที่ 10,000 บัญชี โดยจะลบรายการที่เก่าที่สุดออก (Evict oldest) เมื่อขนาดเต็ม
   - **พฤติกรรม Fail-Closed ปลอดภัยเมื่อฐานข้อมูลมีปัญหา (Fail-Closed Behavior)**:
     - หากเกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูลหรือ Query ขณะตรวจสอบสถานะ ระบบจะไม่ถือว่าผู้ใช้ active โดยเด็ดขาด
     - เซิร์ฟเวอร์จะตอบกลับด้วย HTTP `503 Service Unavailable` ทันทีด้วย Generic JSON body โดยไม่มีการรั่วไหลของประโยค SQL หรือข้อความผิดพลาดภายใน
   - **การล็อกอินของบัญชีที่ถูกแบนหรือลบ (Login Behavior)**:
     - `POST /auth/login` ตรวจสอบรหัสผ่านด้วย `bcrypt` ก่อนเสมอ: หากรหัสผ่านผิดหรืออีเมลไม่มี จะตอบกลับด้วย HTTP `401 Invalid email or password` ด้วยระยะเวลาประมวลผลคงเดิม ป้องกันการสืบค้นสถานะบัญชี (Timing Attack)
     - หากรหัสผ่านถูกต้องแต่บัญชีถูกแบนหรือลบ จะตอบกลับด้วย HTTP `403` `{ error: 'Account unavailable' }`
   - **เครื่องมือจัดการและระงับผู้ใช้จากเซิร์ฟเวอร์เชลล์ (Moderation CLI Tool)**:
     - **ต้องใช้ DATABASE_URL ของบัญชีแอดมินฐานข้อมูล (เจ้าของตาราง / superuser) ไม่ใช่ `hoopup_api` ของเซิร์ฟเวอร์:** `hoopup_api` ถูกเพิกถอนสิทธิ์ `app_auth.moderation_log` และแก้ `public.profiles` ไม่ได้ ถ้ารันด้วยค่าใน `.env` ของเซิร์ฟเวอร์ คำสั่ง `ban`/`unban`/`delete` จะล้มเหลวด้วย `permission denied` (exit 1) ตัวอย่าง: `$env:DATABASE_URL="postgres://<แอดมิน>@127.0.0.1:5432/postgres"; node scripts/moderate.mjs status <email>` (แก้เพิ่มโดย claude-backend 2026-11-04 หลังทดสอบจริง)
     - ผู้ดูแลระบบสามารถใช้คำสั่ง CLI ผ่าน Node.js (เชื่อมต่อ PostgreSQL ผ่าน `DATABASE_URL` ของแอดมินตามข้างบน):
       ```powershell
       # สั่งแบนบัญชีผู้ใช้
       node scripts/moderate.mjs ban <email|uuid> --reason "ข้อความเหตุผล"

       # สั่งยกเลิกการแบนบัญชีผู้ใช้
       node scripts/moderate.mjs unban <email|uuid>

       # สั่งลบบัญชีผู้ใช้ (Soft Delete) ต้องระบุ Flag --confirm
       node scripts/moderate.mjs delete <email|uuid> --confirm

       # ตรวจสอบสถานะบัญชีผู้ใช้
       node scripts/moderate.mjs status <email|uuid>
       ```
     - ผลลัพธ์และบันทึกประวัติ: ทุกการกระทำ (`ban`, `unban`, `delete`) จะบันทึกลงในตาราง `app_auth.moderation_log` โดยระบุ `actor` จากตัวแปรสภาพแวดล้อม `$MODERATOR` หรือชื่อผู้ใช้ OS และไม่มีการพิมพ์ password hash ออกมา
     - **ข้อมูลเดิมของผู้ใช้ที่ถูกระงับ/ลบ (Old Content Retention)**:
       - การสั่งลบ (`delete`) จะทำ Soft Delete โดยกำหนดค่า `deleted_at = now()` และล้างข้อมูลโปรไฟล์ส่วนตัว (`display_name` เปลี่ยนเป็น `ผู้ใช้ที่ถูกลบ`, `avatar_path = null`, `height_cm = null`, `height_visible = false`)
       - **ข้อความแชทเดิมและเซสชันการเล่นที่ผู้ใช้เคยสร้างไว้จะยังคงอยู่และแสดงผลได้ตามปกติ (Messages and sessions stay visible / left untouched)** เพื่อรักษาความสมบูรณ์ของประวัติการเล่นและบริบทการสนทนาของสมาชิกคนอื่น
9. **ระบบยืนยันตัวตนด้วย OpenID Connect (OIDC1 - Sign in with Google / LINE)**:
   - **แนวคิดการออกแบบ (User Decision 2.ค)**: แก้ปัญหาการยืนยันอีเมลด้วยการเปิดให้ผู้ใช้ลงชื่อเข้าใช้ผ่าน Google หรือ LINE (OpenID Connect) แทนที่จะต้องสร้างระบบส่งอีเมลยืนยันตัวตนเอง โดยระบบรหัสผ่านเดิมยังคงใช้งานได้สำหรับสภาพแวดล้อมทดสอบ/เดโม
   - **สถาปัตยกรรมและกระบวนการทำงาน (Authorization Code Flow with PKCE & CSRF Cookie Binding)**:
     1. `GET /auth/oidc/:provider/start?return_to=<url>`: ตรวจสอบผู้ให้บริการ (`google`, `line`) และตรวจสอบ `return_to` ว่าตรงกับรายการที่อนุญาตใน `OIDC_ALLOWED_RETURN_URLS` แบบ Exact Match (ป้องกัน Open Redirect) หากไม่ระบุหรือไม่อนุญาตจะตอบ 400 ทันที สร้าง `state`, `nonce` (32 ไบต์สุ่ม base64url) และ PKCE `code_verifier` (คำนวณ `code_challenge` แบบ S256) พร้อมทั้งออก Binding Cookie `hoopup_oidc` (HttpOnly, SameSite=Lax, Path=/auth/oidc, Max-Age 600 และมี Secure flag ใน Production) บันทึก Hash ของ Cookie และ State ลงใน In-memory Map (TTL 10 นาที, สูงสุด 5,000 รายการ) จากนั้นทำการ Redirect 302 ไปยัง Authorize Endpoint ของ IdP
     2. `GET /auth/oidc/:provider/callback?code&state`: ลบ State ออกจาก In-memory Map ทันที (ป้องกัน Replay Attack) ตรวจสอบค่าใน Binding Cookie ว่า Hash ตรงกัน (ป้องกัน Login-CSRF ที่ผู้โจมตีพยายามส่ง Callback URL ให้เหยื่อ) จากนั้นนำ Authorization Code ไปแลก `id_token` ที่ Token Endpoint ผ่าน HTTP POST form (`timeout: 5000ms`, จำกัด Body ไม่เกิน 64 kB, `redirect: error` ไม่มีการพิมพ์ Body หรือ Token ลง Log)
     3. **การตรวจสอบ ID Token (`jose`)**: ตรวจสอบกับ JWKS ของ Provider ด้วย `createRemoteJWKSet` โดยจำกัดเฉพาะอัลกอริทึม `RS256` และ `ES256` เท่านั้น (ปฏิเสธ `alg: none`, HS256 Key Confusion, และ PS256), ตรวจสอบ `issuer`, `audience` ตรงกับ Client ID, `exp`, `iat` ไม่อยู่ในอนาคต, `sub` ไม่ว่างเปล่า (ความยาว <= 255 ตัวอักษร), `nonce` ตรงกับที่เก็บไว้ (Timing-safe comparison), และหาก `aud` เป็น Array ต้องมี `azp` ตรงกับ Client ID
     4. **การเชื่อมโยงบัญชีและกฎป้องกันการชิงอีเมลล่วงหน้า (Pre-Hijack Rule)**:
        - ทำงานภายใน Database Transaction เดียว พร้อม Savepoint รองรับการล็อกอินพร้อมกัน (Concurrent Logins) ของ `sub` เดียวกัน
        - หากพบคู่ `(provider, subject)` ใน `app_auth.identities`: ถือเป็นผู้ใช้เดิม และอัปเดต `last_login_at`
        - หากยังไม่มี Identity แต่ Token มีอีเมลที่ยืนยันแล้ว (`email_verified` เป็น true หรือผู้ให้บริการตั้ง `trustEmail`): ค้นหาบัญชีใน `app_auth.users`:
          - หากพบผู้ใช้เดิม: เชื่อมโยง Identity เข้ากับบัญชีนั้น
          - **กฎ Pre-Hijack**: หากบัญชีเดิมดังกล่าวเป็นบัญชีรหัสผ่านที่มี `email_verified = false` ระบบจะรีเซ็ต `password_hash = NULL` และปรับ `email_verified = true` ทันทีใน Transaction เดียวกัน เพื่อให้เจ้าของกล่องจดหมายตัวจริงที่ยืนยันตัวตนผ่าน OIDC ยึดสิทธิ์กลับมาได้อย่างสมบูรณ์ และตัดสิทธิ์ผู้โจมตีที่แอบสมัครด้วยอีเมลนั้นไว้ก่อนหน้า *(หมายเหตุ: โทเค็น JWT เดิมที่ผู้โจมตีอาจถืออยู่จะมีอายุใช้งานตามปกติสูงสุดไม่เกิน 1 ชั่วโมงตามอายุ Token เดิม)*
          - หากไม่พบผู้ใช้เดิม: สร้างแถวใน `app_auth.users` (`password_hash = NULL`, `email_verified = true`), สร้าง Identity, และสร้าง Profile เริ่มต้นผ่าน `hoopup_save_profile` (กำหนด `displayName` จาก Claim `name` ที่ผ่านการกรองความยาวไม่เกิน 60 ตัวอักษร หรือใช้ชื่อสำรอง `ผู้เล่น` + เลขฐาน 16 สุ่ม 4 หลัก; ไม่โหลดรูปภาพโปรไฟล์จากภายนอก)
        - หากไม่มีอีเมลที่ยืนยัน: สำหรับ Google จะตอบกลับด้วย 403 `{ error: 'email_not_verified' }`; สำหรับ LINE (`allowUnverifiedEmail: true`) จะสร้างบัญชีใหม่ด้วยอีเมลตัวแทนรูปแบบ `line-<sha256(sub)[:16]>@oidc.invalid` (`email_verified = false`) ซึ่งจะไม่ถูกนำไปผูกกับอีเมลจริงในอนาคต
     5. **การตรวจสอบสถานะบัญชี (BAN1 Integration)**: หลัง Resolve ผู้ใช้สำเร็จและก่อนออกโค้ดแลกเปลี่ยน ระบบจะสั่ง `invalidate(userId)` และ `get(userId)` ผ่าน `UserStatusCache` หากสถานะไม่ใช่ `'active'` จะปฏิเสธและ Redirect ไปยัง `return_to?error=account_unavailable` ทันที
     6. **การออก One-Time Exchange Code**: ออกรหัสแลกเปลี่ยนแบบใช้ครั้งเดียว (32 ไบต์สุ่ม base64url) เก็บเฉพาะ `sha256(code)` ใน In-memory Map (TTL 60 วินาที, สูงสุด 5,000 รายการ) แล้ว Redirect 302 ไปยัง `return_to?code=<exchange_code>` พร้อม Header `Cache-Control: no-store` และ `Referrer-Policy: no-referrer` (ไม่มีการส่ง Access Token หรือ ID Token ผ่าน URL Query)
     7. `POST /auth/oidc/exchange`: รับ `{ code }` ตรวจสอบและลบออกจาก Map ทันที ตรวจสอบสถานะบัญชีผู้ใช้ซ้ำ (`invalidate` + `get`) แล้วออก Access Token ปกติ (HS256) ส่งกลับในโครงสร้างเดียวกับ `/auth/login` (`{ accessToken, tokenType: 'Bearer', user: { id, email, createdAt, emailVerified } }`) โดย Endpoint นี้และ Endpoint `/start` อยู่ภายใต้ IP Rate Limiter เดียวกับ Endpoint ข้อมูลการเข้าสู่ระบบ

---

## 4. แผนที่การจับคู่ระหว่าง API กับ Frontend Contract (`app/src/services/types.ts`)

ตารางนี้แสดงการจับคู่ระหว่าง Endpoint ของ Backend Server กับ Method ต่างๆ ใน Interface `AuthService` และ `DataService`:

### 4.1 AuthService Mapping

| Method ใน `AuthService` | Backend Endpoint | HTTP Method | Payload / Headers | รายละเอียด |
|---|---|---|---|---|
| `signIn({ email, password })` | `/auth/login` | `POST` | Body: `{ email, password }` | คืน `{ accessToken, tokenType, user }`; รหัสผ่านผิดหรืออีเมลไม่มีให้ 401 เท่ากัน |
| `signOut()` | `/auth/logout` | `POST` | Body: `{}` | เซิร์ฟเวอร์ตอบรับการออกจากระบบ; ฝั่ง Client ทำการทิ้ง token จากที่เก็บข้อมูล |
| `getCurrentUser()` | `/auth/me` | `GET` | Header: `Authorization: Bearer <token>` | ดึงข้อมูลผู้ใช้ปัจจุบันและข้อมูลโปรไฟล์สาธารณะ (ไม่ส่ง `password_hash`) |
| *(OIDC Start)* | `/auth/oidc/:provider/start` | `GET` | Query: `?return_to=<url>` | เริ่มกระบวนการล็อกอิน OIDC (PKCE + Cookie Binding) พร้อม redirect 302 ไปยัง IdP |
| *(OIDC Callback)* | `/auth/oidc/:provider/callback` | `GET` | Query: `?code=...&state=...` | รับ callback จาก IdP แลก token, resolve user และ redirect 302 พร้อม exchange code |
| *(OIDC Exchange)* | `/auth/oidc/exchange` | `POST` | Body: `{ code: "..." }` | แลก exchange code เป็น JWT Access Token โครงสร้างเดียวกับ `/auth/login` |
| `subscribe(callback)` | *(Client State)* | - | - | จัดการในระดับ Frontend Store/Context โดยอิงจากสถานะ Token และ `/auth/me` |
| `switchDemoUser()`, `listDemoUsers()`, `isDemoMode` | *(Mock / Dev)* | - | - | ใช้งานในระดับ UI Prototype ไม่เชื่อมต่อกับระบบ Production Auth |

### 4.2 DataService Mapping (RPC Writes & Feed Queries)

ทุกคำขอในส่วนนี้ต้องแนบ Header: `Authorization: Bearer <token>`

| Method ใน `DataService` | Backend Endpoint | HTTP Method | Body Mapping |
|---|---|---|---|
| `saveProfile(input)` | `/rpc/hoopup_save_profile` | `POST` | `{ p_input: input }` |
| `createSession(requestId, input)` | `/rpc/hoopup_create_session` | `POST` | `{ p_request_id: requestId, p_input: input }` |
| `getSession(sessionId)` | `/rpc/hoopup_get_session` | `POST` | `{ p_session_id: sessionId }` |
| `listSessions(filter)` | `/rpc/hoopup_list_sessions` | `POST` | `{ p_filter: filter }` |
| `listMySessions(options)` | `/rpc/hoopup_my_sessions` | `POST` | `{ p_limit: options.limit, p_offset: options.offset }` |
| `joinSession(sessionId, position)`| `/rpc/hoopup_join_session` | `POST` | `{ p_session_id: sessionId, p_position: position }` |
| `decideRequest(sessionId, userId, approve)` | `/rpc/hoopup_decide_request` | `POST` | `{ p_session_id: sessionId, p_user_id: userId, p_approve: approve }` |
| `withdraw(sessionId)` | `/rpc/hoopup_withdraw` | `POST` | `{ p_session_id: sessionId }` |
| `updateSession(sessionId, patch)` | `/rpc/hoopup_update_session` | `POST` | `{ p_session_id: sessionId, p_patch: patch }` |
| `setRecruitment(sessionId, open)` | `/rpc/hoopup_set_recruitment` | `POST` | `{ p_session_id: sessionId, p_open: open }` |
| `endSession(sessionId, lifecycle)`| `/rpc/hoopup_end_session` | `POST` | `{ p_session_id: sessionId, p_lifecycle: lifecycle }` |
| `sendMessage(sessionId, clientMessageId, body)` | `/rpc/hoopup_send_message` | `POST` | `{ p_session_id: sessionId, p_client_message_id: clientMessageId, p_body: body }` |
| `blockUser(userId)` | `/rpc/hoopup_block_user` | `POST` | `{ p_user_id: userId }` |
| `unblockUser(userId)` | `/rpc/hoopup_unblock_user` | `POST` | `{ p_user_id: userId }` |
| `report(targetType, targetId, reason)` | `/rpc/hoopup_report` | `POST` | `{ p_target_type: targetType, p_target_id: targetId, p_reason: reason }` |

### 4.3 DataService Reads (RLS Direct Table Reads)

| Method ใน `DataService` | Backend Endpoint | HTTP Method | รายละเอียด |
|---|---|---|---|
| `listCourts()` | `/courts` | `GET` | อ่านรายชื่อสนามทั้งหมดจาก `public.courts` |
| `getProfile(userId)` | `/profiles/:userId` | `GET` | อ่านโปรไฟล์ของผู้ใช้เป้าหมาย |
| `listMembers(sessionId)` | `/session_members/:sessionId` | `GET` | อ่านสมาชิกในนัดตามสิทธิ์ RLS |
| `listMessages(sessionId, limit)` | `/messages?sessionId=...` | `GET` | อ่านข้อความแชทในนัด (ควบคุมความปลอดภัยด้วย RLS สมาชิกเท่านั้นที่อ่านได้) |
| *(Map Basemap)* | `/tiles/:file` | `GET`, `HEAD` | เสิร์ฟไฟล์ PMTiles พร้อม HTTP Range support (สาธารณะ ไม่ต้องใช้ Token) |
| *(Nearby Places)*| `/places` | `GET` | ค้นหาสถานที่ใกล้สนาม (Overture Places Bbox, สาธารณะ ไม่ต้องใช้ Token) |
| *(Place Search)* | `/places/search` | `GET` | ค้นหาสถานที่ตามชื่อ (Overture Places Name Search, จัดอันดับตามความเกี่ยวข้อง/ระยะทาง, สาธารณะ ไม่ต้องใช้ Token) |

### 4.4 ข้อกำหนดสำหรับ Frontend `httpAdapter` ในอนาคต

เมื่อทีม Frontend ทำการเขียน Adapter เชื่อมต่อ HTTP API:
1. **การเก็บ Token**: จัดเก็บ `accessToken` ไว้ใน Secure Storage / localStorage และแนบ `Authorization: Bearer <accessToken>` ในทุกคำขอที่ต้องการยืนยันตัวตน
2. **การจัดการข้อผิดพลาด 401**: หากได้รับ HTTP 401 ให้เคลียร์ Token ในเครื่องและนำทางผู้ใช้ไปยังหน้า Login
3. **การแปลงชื่อฟิลด์**: ฟังก์ชัน RPC ส่งคืนผลลัพธ์เป็น JSON ดั้งเดิมตามที่ PostgreSQL ส่งออกมา (เช่น SessionSummary ใช้ camelCase แต่ MessageRow และ ProfileRow ใช้ snake_case) ให้ Adapter แปลงเป็น TypeScript Interface ตามที่ระบุใน `frontend-contract.ts`

---

## 5. รายการสิ่งที่ยังไม่ได้ทำ (Honest Limitations & What Is NOT Done)

เพื่อความโปร่งใสและชัดเจนตามสัญญางาน สิ่งเหล่านี้อยู่นอกเหนือขอบเขต MVP v0.1 และยังไม่ได้ทำ:

1. **Refresh Tokens**: ระบบปัจจุบันออก Access Token แบบ Stateless มีอายุ 1 ชั่วโมง (exp 1h); ยังไม่มีการสร้างตาราง `refresh_tokens` หรือการหมุนเวียน Token (Token Rotation)
2. **Email Verification**: ยังไม่มีระบบส่งอีเมลยืนยันตัวตน (Email OTP / Confirmation Link) บัญชีที่สมัครสามารถเข้าสู่ระบบได้ทันที
3. **Password Reset**: ยังไม่มีกระบวนการลืมรหัสผ่านหรือส่งลิงก์รีเซ็ตรหัสผ่านทางอีเมล
4. **HTTPS / TLS Termination**: เซิร์ฟเวอร์รันเป็น HTTP ธรรมดา ในการขึ้น Production จำเป็นต้องมี Reverse Proxy (เช่น Nginx, Caddy, AWS ALB หรือ Cloudflare) ทำหน้าที่จัดการ SSL/TLS Certificate
5. **Production Hosting & Containerization**: ออกแบบสำหรับรันด้วย Node.js บนโฮสต์โดยตรง ยังไม่มีไฟล์ Dockerfile, docker-compose หรือ Helm Chart
6. **Database Backups & Disaster Recovery**: ยังไม่มีสคริปต์สำรองข้อมูลอัตโนมัติ (Automated pg_dump / WAL Archiving)
7. **Distributed Rate Limiting**: ระบบ Rate Limiter ในปัจจุบันเป็น In-memory Map ภายใน Process เดียว หากขยายเป็น Multi-node Cluster จำเป็นต้องเปลี่ยนไปใช้ Redis เป็น Shared Storage
8. **Realtime / Push Notifications**: ยังไม่มี WebSocket หรือ Server-Sent Events (SSE) สำหรับกระจายแชทสดหรือการแจ้งเตือนแบบพุชไปยังอุปกรณ์มือถือ
9. **OIDC Multi-Instance & Token Window Limitations**: In-memory Map สำหรับ state และ exchange code จัดเก็บในระดับ Process เดียว หากรีสตาร์ตเซิร์ฟเวอร์ คำขอที่รอดำเนินการจะหลุด; นอกจากนี้ โทเค็น JWT เดิมของผู้โจมตีที่แอบสมัครด้วยอีเมลเหยื่อไว้ก่อนหน้าจะยังใช้งานได้จนกว่าจะหมดอายุ 1 ชั่วโมง

---

## 6. ข้อควรปฏิบัติก่อนใช้งานจริง (ก่อนใช้งานจริง)

สำหรับสภาพแวดล้อมใช้งานจริง (Production / Staging) ห้ามใช้ค่าเริ่มต้นที่ใช้ในการพัฒนา Local โดยเด็ดขาด ทีมงานต้องดำเนินการตามข้อกำหนดด้านความปลอดภัยดังต่อไปนี้:

1. **เปลี่ยนรหัสผ่านของ Role `hoopup_api` ทันที**:
   - ไฟล์ `sql/004_own_auth.sql` กำหนดรหัสผ่านเริ่มต้นสำหรับ dev เท่านั้น (`hoopup_api_dev_password`)
   - ก่อนนำระบบขึ้นใช้งานจริง ต้องทำการเปลี่ยนรหัสผ่านของ role `hoopup_api` ผ่าน psql ด้วยรูปแบบคำสั่ง:
     ```sql
     ALTER ROLE hoopup_api WITH PASSWORD '<STRONG_PRODUCTION_PASSWORD>';
     ```
   - จากนั้นกำหนดค่า connection string ใน `DATABASE_URL` บนเซิร์ฟเวอร์/Secret Manager ให้ตรงกัน โดยไม่ใส่รหัสผ่านจริงไว้ในโค้ดหรือไฟล์ที่เข้าสู่ Version Control

2. **การจัดการอายุ Token และการเพิกถอน (Token Life & Revocation)**:
   - ระบบปัจจุบันออก JWT แบบ Stateless ที่มีอายุ 1 ชั่วโมง (`exp: 3600`) ซึ่งโทเค็นที่ลงนามถูกต้องจะยังคงใช้งานได้จนกว่าจะหมดเวลา แม้แถวของผู้ใช้จะถูกลบออกจากฐานข้อมูลไปแล้วก็ตาม (กรณีนี้ `/auth/me` จะคืน 404 และคำสั่ง RPC จะคืนค่าว่าง `[]` หรือถูกปฏิเสธตามเงื่อนไข RLS)
   - ก่อนใช้งานจริง ควรพิจารณาปรับลดอายุการใช้งานของ Access Token ให้สั้นลง (เช่น 15 นาที) หรือเพิ่มกลไก Token Revocation / Blacklist ผ่าน Redis หรือตารางเก็บ session token เพื่อให้สามารถระงับสิทธิ์ได้ทันทีเมื่อตรวจพบบัญชีถูกระงับหรือถูกลบ

3. **ใช้งาน HTTPS ร่วมกับ Reverse Proxy**:
   - เซิร์ฟเวอร์ Node.js นี้รันเป็น Plain HTTP Gateway
   - ในการเปิดให้บริการจริง ต้องติดตั้ง Reverse Proxy ด้านหน้าเสมอ (เช่น Nginx, Caddy, Cloudflare หรือ AWS Application Load Balancer) เพื่อทำหน้าที่เป็น TLS/SSL Termination (HTTPS) และช่วยป้องกันการโจมตีระดับเครือข่าย

4. **กำหนดค่า `ALLOWED_ORIGINS` ให้รัดกุม**:
   - ค่าเริ่มต้นอนุญาต `http://localhost:5173,http://localhost:5199` สำหรับการพัฒนา
   - ก่อนเปิดใช้งานจริง ต้องตั้งค่าตัวแปรสภาพแวดล้อม `ALLOWED_ORIGINS` ให้ตรงกับโดเมนจริงของ Frontend เท่านั้น (เช่น `https://app.hoopup.com`) ห้ามใช้ wildcard (`*`) หรือปล่อยว่าง

5. **ห้าม Commit ไฟล์ `.env` เข้า Git โดยเด็ดขาด**:
   - ห้าม commit ไฟล์ `.env` ที่มี credentials จริง (เช่น `DATABASE_URL`, `JWT_SECRET`) เข้าสู่ Git Repository
   - ตรวจสอบให้แน่ใจว่า `.env` ถูกระบุไว้ใน `.gitignore` อย่างสม่ำเสมอ และส่งค่า config ผ่าน Environment Variables ของโฮสต์หรือคอนเทนเนอร์ใน Production
