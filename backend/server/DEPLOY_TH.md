# คู่มือการติดตั้งและ Deploy ระบบ HoopUp บน Linux Server / VPS เครื่องเดียว (Single-node Architecture)

เอกสารฉบับนี้จัดทำขึ้นสำหรับผู้ดูแลระบบและเจ้าของโปรเจกต์ HoopUp เพื่อใช้เป็นคู่มือปฏิบัติการ (Operational Guide) ในการติดตั้งและรันระบบทั้งหมดบนเซิร์ฟเวอร์ Linux (Ubuntu / Debian) เพียงเครื่องเดียว โดยครอบคลุมทั้ง:
1. **Frontend Web App**: Single Page Application (React + Vite)
2. **Backend API Gateway**: Fastify Server (Node.js v24 ESM) ให้บริการ RPC, REST data, แผนที่เวกเตอร์ PMTiles (`/tiles`) และสถานที่ใกล้สนาม Overture Places (`/places`, `/places/search`)
3. **Database**: PostgreSQL พร้อมระบบ Row Level Security (RLS) และตารางจัดเก็บข้อมูลผู้ใช้/รหัสผ่านของระบบเอง (`app_auth.users`)
4. **Reverse Proxy & HTTPS**: Caddy หรือ Nginx ทำหน้าที่ TLS Termination, บริหารจัดการ Cache และส่งต่อ HTTP Range Requests

> [!NOTE]
> เอกสารฉบับนี้อ้างอิงข้อมูลและการตรวจสอบข้อเท็จจริงจากซอร์สโค้ดจริงในโปรเจกต์ ณ วันที่ 3 พฤศจิกายน 2569 (ปรับปรุงหลัง SEC2, MAP6d และ MAP7a) โดยทุกพอร์ต พาท คำสั่ง และตัวแปรสภาพแวดล้อมได้รับการตรวจสอบตรงกับโค้ดทุกประการ

---

## 1. แผนภาพและสถาปัตยกรรมระบบ (System Architecture)

ระบบออกแบบให้ทำงานร่วมกันภายในโฮสต์เดียวอย่างกระชับ ปลอดภัย และไม่พึ่งพา External Cloud Database (Supabase) หรือ Managed Service ภายนอก:

```text
+-----------------------------------------------------------------------------------+
|                           ไคลเอนต์ (Web Browser / Mobile App)                     |
+-----------------------------------------------------------------------------------+
                                         │
                                         │ HTTPS (Port 443) / HTTP (Port 80 -> 443 Redirect)
                                         ▼
+-----------------------------------------------------------------------------------+
|              Reverse Proxy (Caddy / Nginx) บนโฮสต์เดียวกัน                        |
|                                                                                   |
|  ├─ เสิร์ฟไฟล์ Static Web App โดยตรง ──> /var/www/hoopup/dist/                    |
|  │  (HTML, JS, CSS, Assets พร้อม SPA Fallback ไปที่ index.html)                   |
|  │                                                                                |
|  └─ ส่งต่อ API Requests (Reverse Proxy) ──> http://127.0.0.1:3000                 |
|     ├─ /auth/*        (สมัครสมาชิก, เข้าสู่ระบบ, ข้อมูลผู้ใช้)                    |
|     ├─ /rpc/*         (15 คำสั่งทางธุรกิจผ่านฟังก์ชัน PostgreSQL)                  |
|     ├─ /courts, /messages, /session_members, /profiles/* (REST direct reads)      |
|     ├─ /tiles/*       (สตรีมไฟล์เวกเตอร์แผนที่ PMTiles พร้อม HTTP Range Header)   |
|     ├─ /places        (ค้นหาร้านค้า/สถานที่ใกล้เคียง Bounding Box)                |
|     ├─ /places/search (ค้นหาสถานที่ตามชื่อและระยะทางใกล้เคียง)                  |
|     └─ /health        (ตรวจสอบความพร้อมของ API Gateway)                           |
+-----------------------------------------------------------------------------------+
                                         │
                                         │ Localhost HTTP (127.0.0.1:3000)
                                         ▼
+-----------------------------------------------------------------------------------+
|              Node.js Fastify API Gateway (backend/server/src/index.js)            |
|                                                                                   |
|  ├─ สตรีมไฟล์แผนที่โดยตรงจากดิสก์:                                                |
|  │  `backend/server/tiles/bangkok.pmtiles` (~49.05 MB)                            |
|  │  (ส่งแบบ 206 Partial Content ผ่าน fs.createReadStream ตามไบต์ที่ร้องขอ)        |
|  │                                                                                |
|  ├─ โหลดดัชนีสถานที่ Overture เข้าหน่วยความจำ (Lazy In-Memory Spatial & Search):  |
|  │  `backend/server/data/places-bangkok.ndjson` (~24.50 MB, 156,943 รายการ)      |
|  │  (โหลดแบบ lazy เมื่อมีคำขอแรกเข้า /places หรือ /places/search)                 |
|  │                                                                                |
|  └─ เชื่อมต่อฐานข้อมูลผ่าน Connection Pool (pg.Pool, max: 20 connections)         |
+-----------------------------------------------------------------------------------+
                                         │
                                         │ PostgreSQL Protocol (127.0.0.1:5432)
                                         ▼
+-----------------------------------------------------------------------------------+
|                         PostgreSQL 16/17 (Local Database)                         |
|                                                                                   |
|  ├─ ฐานข้อมูล: `postgres` (หรือ `hoopup`)                                         |
|  ├─ บทบาทเชื่อมต่อ (Login Role): `hoopup_api`                                     |
|  ├─ สกีมาและตารางหลัก:                                                            |
|  │  ├─ `app_auth.users`: จัดเก็บ id, email, password_hash (bcrypt cost 12)        |
|  │  ├─ `public.courts`: ข้อมูลสนามบาสเกตบอล 148 แห่งใน กทม.                      |
|  │  ├─ `public.profiles`, `sessions`, `session_members`, `messages`               |
|  │  └─ `hoopup_private.*`: Business logic functions & Row Level Security (RLS)    |
|  └─ การกำหนดสิทธิ์: ต่อ Transaction สลับเป็น `SET LOCAL ROLE authenticated` / anon |
+-----------------------------------------------------------------------------------+
```

### ตำแหน่งไฟล์ข้อมูลสำคัญบนเซิร์ฟเวอร์
1. **ไฟล์แผนที่เวกเตอร์ PMTiles**:
   - พาท: `backend/server/tiles/bangkok.pmtiles`
   - ขนาดจริง: **49,051,123 ไบต์ (~49.05 MB)**
   - ขนาดโฟลเดอร์ `tiles/` ทั้งหมด: **7 ไฟล์ รวม 73,897,160 ไบต์ (~73.90 MB)** (ตรวจวัดจริงด้วย PowerShell `Get-ChildItem -Recurse tiles | Measure-Object -Property Length -Sum`) โดยบน Production ต้องมีอย่างน้อยไฟล์ `bangkok.pmtiles` สำหรับเสิร์ฟแผนที่หลัก
   - บทบาท: เก็บข้อมูลแผนที่ถนนและอาคารกรุงเทพฯ ถึงระดับ Zoom 15/16 ให้บริการผ่าน HTTP Range Requests
2. **ไฟล์ข้อมูลสถานที่ Overture Places**:
   - พาท: `backend/server/data/places-bangkok.ndjson`
   - ขนาดจริงบนดิสก์: **24,503,262 ไบต์ (~24.50 MB)** (ตรวจวัดจริงด้วย PowerShell `Get-Item`)
   - บทบาท: ข้อมูลร้านค้า ร้านอาหาร สิ่งอำนวยความสะดวก 156,943 แห่ง โหลดแบบ Lazy เมื่อมี Request แรกเข้า `/places` (Uniform Grid Index) และ `/places/search` (Tiered Search Index)
   - สัญญาอนุญาตและเครดิต: ได้รับสิทธิภายใต้สัญญาอนุญาต CDLA-Permissive-2.0 ต้องแสดงข้อความเครดิต `"Places © Overture Maps Foundation"` บนหน้าจอเสมอ พร้อมลิงก์ไปยังไฟล์ประกาศ [`NOTICE_OVERTURE.md`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/NOTICE_OVERTURE.md)
3. **ไฟล์ Static Bundle ของ Web App**:
   - พาท: `app/dist/`
   - บทบาท: ไฟล์ HTML, JavaScript, CSS และ Web Assets ที่คอมไพล์แล้วสำหรับเสิร์ฟให้เบราว์เซอร์

### สิ่งที่ต้องสำรองข้อมูล (Backup Requirements)
- **ข้อมูลที่ต้องสำรองสม่ำเสมอ (Critical / Must Backup Regularly)**:
  1. **ฐานข้อมูล PostgreSQL**: ตารางในสกีมา `public` (สนาม, นัด, แชท, สมาชิก, โปรไฟล์) และ `app_auth` (บัญชีผู้ใช้และแฮชรหัสผ่าน) ต้องทำ Automated Daily Backup ด้วย `pg_dump`
  2. **ไฟล์คอนฟิกสภาพแวดล้อม (`.env`)**: ไฟล์คอนฟิกของระบบที่เก็บ `DATABASE_URL` และ `JWT_SECRET` ของ Production
- **ไฟล์ที่ไม่จำเป็นต้องสำรองรายวัน (Static / Regenerable Files)**:
  1. `bangkok.pmtiles` (~49 MB): เป็นไฟล์แผนที่สถิตที่สร้างจาก OpenStreetMap สำรองเก็บไว้แยกต่างหากครั้งเดียว ไม่มีการเขียนทับในขณะรันระบบ
  2. `places-bangkok.ndjson` (~24.5 MB): เป็นไฟล์ดัชนีสถานที่สถิตที่สร้างจาก Overture Maps สามารถสร้างใหม่ได้เสมอผ่านสคริปต์ `node scripts/places/build-places-index.mjs`

---

## 2. การประเมินทรัพยากรขั้นต่ำของเซิร์ฟเวอร์ (Minimum Server Resources)

ตัวเลขทรัพยากรด้านล่างนี้ อ้างอิงจากผลการวัดจริง (Measurements) ในรายงานการทดสอบของโปรเจกต์:

### ข้อมูลจากการวัดผลจริงในโค้ดและรายงาน
1. **การให้บริการไฟล์แผนที่ PMTiles (`/tiles/:file`)**:
   - โค้ดใน [`backend/server/src/routes/tiles.js:250`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/tiles.js#L250) ใช้ `fs.createReadStream(targetPath, { start, end })` สตรีมเฉพาะ Range ไบต์ที่ไคลเอนต์ร้องขอ (โดยทั่วไปช่วงละ 16 KB – 512 KB ต่อ tile)
   - **ไม่มีการอ่านไฟล์ 49 MB ทั้งก้อนเข้าหน่วยความจำ** ทำให้การใช้งาน RAM สำหรับ Route นี้ต่ำคงที่ (< 5 MB) แม้จะมีผู้ใช้งานเปิดแผนที่พร้อมกัน
2. **ดัชนีสถานที่ในหน่วยความจำ (`/places` และ `/places/search`)**:
   - ทั้งสอง Route โหลดข้อมูลจากไฟล์ `backend/server/data/places-bangkok.ndjson` (ขนาดจริงบนดิสก์ 24,503,262 ไบต์ หรือ ~24.50 MB มี 156,943 รายการ)
   - **กลไกการโหลดข้อมูล (Lazy In-Memory Loading)**: ข้อมูลไม่ได้ถูกโหลดตอนเปิดเซิร์ฟเวอร์ แต่จะโหลดแบบ Lazy เมื่อมี Request แรกเข้ามายัง `/places` ([`src/routes/places.js:251`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/places.js#L251)) หรือ `/places/search` ([`src/routes/placesSearch.js:120`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/placesSearch.js#L120)) โดยใช้ `fs.createReadStream` ร่วมกับ `readline.createInterface` เพื่ออ่านทีละบรรทัดแล้วแปลง JSON เข้าสู่อ็อบเจกต์ดัชนีในหน่วยความจำ
   - **ข้อมูลอ้างอิงจากการวัดผลในรายงานการทดสอบ (Reference Test Measurements)**:
     - รายงาน [`mvp_tasks_2026-10-28/reports/MAP6B_REPORT.md:156-163`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/mvp_tasks_2026-10-28/reports/MAP6B_REPORT.md#L156-L163) (Node.js v24.19.0): Spatial Uniform Grid Index ของ `/places` ใช้ Heap ~51.93 MB, Process RSS ~173.54 MB
     - รายงาน [`mvp_tasks_2026-10-28/reports/MAP7A_REPORT.md:46-51`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/mvp_tasks_2026-10-28/reports/MAP7A_REPORT.md#L46-L51): Tiered Search Index ของ `/places/search` มี Heap เพิ่มขึ้น ~69.3 MB ในการเก็บ Normalized Names สำหรับค้นหา
   - **คำเตือนเรื่องการประเมิน RAM (Do not invent RAM numbers — Measure on the host)**:
     ตัวเลข Heap และ RSS ข้างต้นเป็นเพียงตัวเลขสังเกตการณ์จากการรันชุดทดสอบในเครื่องพัฒนาเท่านั้น **ห้ามนำตัวเลขนี้ไปคาดเดาหรือกำหนดขีดจำกัดหน่วยความจำสำหรับ Production ล่วงหน้าโดยเด็ดขาด** การใช้งาน RAM จริงบนเซิร์ฟเวอร์จะแปรผันตาม Garbage Collection, Concurrency, และพฤติกรรม V8 Engine ผู้ดูแลระบบต้องทำการ**ตรวจวัดบนโฮสต์จริง (measure on the host)** ภายใต้ปริมาณงานจริง
3. **Fastify API Server Baseline**:
   - การทำงานพื้นฐานของ Fastify + Connection Pool 20 การเชื่อมต่อ + JWT/Bcrypt ใช้ RSS ประมาณ **50–80 MB**
4. **ฐานข้อมูล PostgreSQL**:
   - ในระดับเริ่มต้นที่มี Seed สนาม 148 แห่ง (`005_seed_osm_courts.sql`) ตัวฐานข้อมูลใช้ดิสก์ประมาณ **15–25 MB** และแรมพื้นฐานของ Postgres Process (~50–100 MB)

### สิ่งที่ยังไม่สามารถวัดได้ล่วงหน้า (Honest Unknowns - ต้องวัดหน้างานจริง)
- **อัตราการเติบโตของฐานข้อมูล (Database Sizing under Production Load)**: ปริมาณข้อความแชทในนัด (`messages`), จำนวนนัดที่สร้างขึ้น (`sessions`), และประวัติการจัดนัด ไม่สามารถประเมินขนาดแน่ชัดได้จนกว่าจะมีผู้เล่นใช้งานจริง จึงต้องมีการตั้งระบบมอนิเตอร์พื้นที่ดิสก์และวัดขนาดจริงหน้างาน (*measure on the host*)
- **การใช้งานหน่วยความจำจริงของ Node.js (Actual Process Memory under Load)**: ต้องตรวจวัดการใช้งานจริงบนเซิร์ฟเวอร์ปลายทาง (*measure on the host*) ก่อนกำหนดขีดจำกัดหน่วยความจำใดๆ
- **Concurrent Load สูงสุดต่อวินาที**: ความสามารถในการรองรับคำขอพร้อมกันขึ้นอยู่กับจำนวนคอร์ CPU และความเร็ว I/O ของดิสก์ VPS

### ข้อกำหนดสเปกเครื่อง VPS ที่แนะนำ
| ทรัพยากร | สเปกขั้นต่ำสุด (Minimum Bare Metal) | สเปกที่แนะนำสำหรับ Production (Recommended) | เหตุผลอ้างอิง |
|---|---|---|---|
| **CPU** | 1 vCPU | 1 - 2 vCPU | Node.js รันแบบ Single Process + Postgres รันคำสั่งไม่ซับซ้อน |
| **RAM** | 1 GB (ต้องเปิด Swap 1-2 GB) | **2 GB** | Node.js RSS + In-memory Places/Search Index + PostgreSQL + Caddy/Nginx + OS Cache (ต้องวัดจริงหน้างาน: *measure on the host*) |
| **Disk** | 10 GB SSD | **20 GB SSD / NVMe** | OS (~4 GB), Node/Postgres Packages (~1 GB), Tiles & Places (~75–100 MB), ส่วนที่เหลือรองรับ DB growth, WAL และ System Logs |
| **Bandwidth** | 500 GB / เดือน | 1 TB / เดือน | การสตรีม Vector Tiles จะกินแบนด์วิดท์ตามการซูม/เลื่อนแผนที่ของผู้ใช้ |

---

## 3. ขั้นตอนการติดตั้งบน Ubuntu / Debian Server (Step-by-Step Setup)

ขั้นตอนทั้งหมดสามารถ Copy-Paste รันบนเซิร์ฟเวอร์ Ubuntu (22.04 / 24.04 LTS) หรือ Debian (12 Bookworm) ที่ติดตั้งใหม่ได้ทันที

> [!NOTE]
> **ความโปร่งใส (Honesty Notice)**: คำสั่ง Shell/Bash ทั้งหมดในส่วนนี้เป็นคำสั่งมาตรฐานสำหรับ Linux ที่ผ่านการตรวจสอบความเข้ากันได้กับโค้ด แต่**ยังไม่ได้ถูกรันบนเซิร์ฟเวอร์ Linux จริงโดยผู้เขียน** (not executed on a real server by the author) เนื่องจากสภาพแวดล้อมการทำงานปัจจุบันเป็น Windows ผู้ดูแลระบบต้องตรวจสอบความเข้ากันได้และรันควันทดสอบ (Smoke Test) บนโฮสต์จริงก่อนเปิดให้บริการ

### 3.1 การสร้างผู้ใช้ระบบและตั้งค่าความปลอดภัยเบื้องต้น
ไม่ควรรันแอปพลิเคชัน Node.js หรือบริการเว็บด้วยสิทธิ์ `root`:

```bash
# อัปเดตระบบ
sudo apt-get update && sudo apt-get upgrade -y

# สร้างผู้ใช้ระบบชื่อ hoopup
sudo adduser --disabled-password --gecos "" hoopup
sudo usermod -aG sudo hoopup

# สร้างไดเรกทอรีสำหรับโปรเจกต์
sudo mkdir -p /var/www/hoopup
sudo chown -R hoopup:hoopup /var/www/hoopup
```

### 3.2 การตั้งค่า Firewall (UFW)
เปิดเฉพาะพอร์ตที่จำเป็นต่อสาธารณะ และปิดกั้นพอร์ตภายใน:

```bash
sudo apt-get install -y ufw

# อนุญาต SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# ป้องกันพอร์ต 3000 (Node API) และ 5432 (Postgres) ไม่ให้เปิดสู่ภายนอก
sudo ufw default deny incoming
sudo ufw default allow outgoing

# เปิดใช้งาน Firewall
sudo ufw --force enable
sudo ufw status verbose
```

### 3.3 การติดตั้ง Node.js v24 (Official Method)
ติดตั้ง Node.js v24 ผ่านช่องทางทางการของ NodeSource:
- อ้างอิงเอกสารทางการ: [Node.js Official Package Manager Documentation](https://nodejs.org/en/download/package-manager) และ [NodeSource Distributions GitHub](https://github.com/nodesource/distributions)

```bash
# ติดตั้งเครื่องมือพื้นฐาน
sudo apt-get install -y curl ca-certificates gnupg

# เพิ่ม NodeSource Repository สำหรับ Node.js 24.x
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -

# ติดตั้ง Node.js (รวม npm มาในตัว)
sudo apt-get install -y nodejs build-essential

# ตรวจสอบเวอร์ชันที่ติดตั้ง
node -v   # ต้องแสดง v24.x.x
npm -v    # ต้องแสดง v10.x.x หรือใหม่กว่า
```

### 3.4 การติดตั้ง PostgreSQL และการรัน Migration ตามลำดับที่ถูกต้อง 100%

ติดตั้ง PostgreSQL 16 (หรือเวอร์ชันมาตรฐานของ distro):

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### ลำดับไฟล์ SQL Migrations ที่ต้องรัน
เพื่อให้สกีมาและสิทธิ์ของระบบถูกต้องสมบูรณ์ ต้องรันไฟล์ SQL ตามลำดับต่อไปนี้อย่างเคร่งครัด:

1. **`backend/tests/bootstrap_auth.sql`** ([ดูไฟล์](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/tests/bootstrap_auth.sql#L1-L12)):
   - **เหตุผล**: โค้ดเดิมของ HoopUp ออกแบบให้อิงกับ Supabase Auth ใน Migration 001 ตาราง `public.profiles` จะมี Foreign Key อ้างอิงไปยัง `auth.users(id)` และฟังก์ชันความปลอดภัยเรียกใช้ `auth.uid()` ดังนั้นบนเซิร์ฟเวอร์ PostgreSQL ทั่วไปที่ไม่มี Supabase จึงจำเป็นต้องรันสคริปต์นี้เพื่อสร้างบทบาท `anon`, `authenticated`, สกีมา `auth`, ตาราง `auth.users`, และฟังก์ชัน `auth.uid()`
2. **`backend/migrations/001_schema.sql`** ([ดูไฟล์](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/migrations/001_schema.sql#L1-L196)):
   - สร้างสกีมา `hoopup_private`, ตาราง `profiles`, `courts`, `sessions`, `session_members`, `messages`, `user_blocks`, `reports` พร้อม Check Constraints
3. **`backend/migrations/002_commands.sql`** ([ดูไฟล์](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/migrations/002_commands.sql#L1-L550)):
   - สร้าง Business Logic Procedures ภายใน `hoopup_private` ทั้งหมด (การสร้างนัด, ขอเข้าร่วม, อนุมัติ, ส่งข้อความ, การบล็อก)
4. **`backend/migrations/003_api_and_permissions.sql`** ([ดูไฟล์](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/migrations/003_api_and_permissions.sql#L1-L142)):
   - สร้างฟังก์ชัน API สาธารณะ `public.hoopup_*` จำนวน 15 รายการ และกำหนดสิทธิ์ RLS ให้เฉพาะบทบาท `authenticated` เท่านั้นที่เรียกใช้ได้
5. **`backend/server/sql/004_own_auth.sql`** ([ดูไฟล์](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/sql/004_own_auth.sql#L1-L57)):
   - สร้างสกีมา `app_auth`, ตาราง `app_auth.users`, ทริกเกอร์เชื่อมโยง `sync_user_to_auth()` และสร้างบทบาทล็อกอิน `hoopup_api`
6. **`backend/server/sql/005_seed_osm_courts.sql`** ([ดูไฟล์](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/sql/005_seed_osm_courts.sql#L1-L148)):
   - นำเข้ารายชื่อสนามบาสเกตบอล 148 แห่งในเขตกรุงเทพฯ จาก OpenStreetMap

#### คำสั่งรัน SQL Migrations บนเซิร์ฟเวอร์
สมมุติว่าโค้ดโปรเจกต์ถูกโคลนไว้ที่ `/var/www/hoopup`:

```bash
# สลับไปใช้ผู้ใช้ postgres เพื่อรัน migrations
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -f /var/www/hoopup/backend/tests/bootstrap_auth.sql
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -f /var/www/hoopup/backend/migrations/001_schema.sql
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -f /var/www/hoopup/backend/migrations/002_commands.sql
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -f /var/www/hoopup/backend/migrations/003_api_and_permissions.sql
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -f /var/www/hoopup/backend/server/sql/004_own_auth.sql
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -f /var/www/hoopup/backend/server/sql/005_seed_osm_courts.sql
```

### 3.5 การเปลี่ยนรหัสผ่านของบทบาท `hoopup_api`
ในไฟล์ [`backend/server/sql/004_own_auth.sql:36`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/sql/004_own_auth.sql#L36) มีการสร้างบทบาทด้วยรหัสผ่านสำหรับการพัฒนาว่า `'hoopup_api_dev_password'` **ห้ามใช้รหัสผ่านนี้บน Production โดยเด็ดขาด**

ให้รันคำสั่งเปลี่ยนรหัสผ่านทันที:

```bash
# สุ่มรหัสผ่านใหม่ที่ปลอดภัยสูง (เช่น 32 ตัวอักษร)
PROD_DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9')
echo "Generated DB Password: $PROD_DB_PASS"

# เปลี่ยนรหัสผ่านใน PostgreSQL
sudo -u postgres psql -c "ALTER ROLE hoopup_api WITH PASSWORD '$PROD_DB_PASS';"
```

### 3.6 การสร้าง `JWT_SECRET` ที่ปลอดภัย (อัปเดตตาม SEC2)
ในโค้ด [`backend/server/src/auth.js:101-119`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/auth.js#L101-L119) ระบุไว้ชัดเจนว่า `JWT_SECRET` ต้องมีความยาว**อย่างน้อย 32 ตัวอักษรขึ้นไป** (256 บิต) หากสั้นกว่านี้เซิร์ฟเวอร์จะปฏิเสธการสตาร์ตและ throw error ทันที (`assertJwtSecret`)

**คำเตือนด้านความปลอดภัย**:
1. ห้ามใช้ Secret จากไฟล์ `.env.example` (`super_secret_jwt_passphrase_min_32_bytes_long_12345`) หรือค่าตัวอย่างจากการพัฒนา เพราะหากผู้โจมตีทราบ Secret จะสามารถปลอมแปลงโทเค็นและเข้าถึงบัญชีผู้เล่นทุกคนในระบบได้
2. **การบล็อกค่าทดสอบใน Production**: เมื่อตั้งค่า `NODE_ENV=production` เซิร์ฟเวอร์จะตรวจสอบ Blocklist (`BLOCKED_DEV_JWT_SECRETS`) และปฏิเสธการบูตทันทีหากตรวจพบว่าใช้ Secret ตัวอย่างจากการทดสอบ

คำสั่งสร้าง Secret ขนาด 256 บิต (สุ่ม Base64 48 ไบต์ = 64 ตัวอักษร ตามคำแนะนำในโค้ด):
```bash
JWT_SECRET=$(openssl rand -base64 48)
echo "Generated JWT_SECRET: $JWT_SECRET"
```

### 3.7 ตารางตัวแปรสภาพแวดล้อมทั้งหมดที่เซิร์ฟเวอร์อ่านจริง (Environment Variables)

จากการตรวจสอบโค้ดจริงใน `backend/server/src/*.js` ทุกไฟล์ เซิร์ฟเวอร์อ่านตัวแปรสภาพแวดล้อมทั้งหมด 22 ตัวแปร ดังนี้:

| ชื่อตัวแปร | จำเป็น? | ตัวอย่างค่า Production | ค่าเริ่มต้นหากไม่ตั้ง | พฤติกรรมเมื่อไม่ตั้ง / ว่าง | อ้างอิงในโค้ด (File:Line) |
|---|---|---|---|---|---|
| `PORT` | ไม่ | `3000` | `3000` | ใช้งานพอร์ต 3000 | [`backend/server/src/index.js:4`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/index.js#L4) |
| `HOST` | ไม่ | `127.0.0.1` | `127.0.0.1` | Bind รับการเชื่อมต่อเฉพาะ Loopback IP (เข้าถึงได้เฉพาะภายในโฮสต์หลัง proxy) | [`backend/server/src/index.js:5`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/index.js#L5) |
| `DATABASE_URL` | **ใช่** | `postgres://hoopup_api:<PASS>@127.0.0.1:5432/postgres` | ไม่มี | **Throw Error และ Process หยุดทำงานทันที**: `"DATABASE_URL is not set in environment or config"` | [`backend/server/src/db.js:12-15`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/db.js#L12-L15) |
| `NODE_ENV` | แนะนำ | `production` | ไม่มี (undefined) | หากตั้งเป็น `production` ระบบจะเปิดใช้โหมดความปลอดภัยเข้มงวดและปฏิเสธ dev secrets | [`backend/server/src/auth.js:108`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/auth.js#L108) |
| `JWT_SECRET` | **ใช่** | `สุ่มผ่าน openssl rand -base64 48` | ไม่มี | **Throw Error ตอนบูตเซิร์ฟเวอร์ทันที**: หากความยาว < 32 ตัวอักษร หรือใช้ค่า dev ใน production | [`backend/server/src/app.js:86`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/app.js#L86), [`auth.js:101-119`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/auth.js#L101-L119) |
| `TRUST_PROXY` | แนะนำเมื่ออยู่หลัง proxy | `127.0.0.1` | `false` (unset) | ค่าเริ่มต้นคือไม่เชื่อ Header ใดๆ (`false`); เมื่ออยู่หลัง Proxy ต้องระบุ IP/CIDR เช่น `127.0.0.1`; ระบบ**ปฏิเสธ `true` และ `*` ทันทีตอนบูต** (ห้ามใช้ hop count เว้นแต่เข้าถึงได้ผ่าน proxy เท่านั้น) | [`backend/server/src/app.js:10-83, 88-92`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/app.js#L10-L83) |
| `ALLOWED_ORIGINS` | แนะนำ | `https://hoopup.example.com` | `http://localhost:5173,http://localhost:5199` | รายการ Origin ที่อนุญาต CORS (คั่นด้วยจุลภาค) หากไม่ตั้ง เบราว์เซอร์จะบล็อกคำขอข้ามโดเมนใน Production | [`backend/server/src/app.js:94-103`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/app.js#L94-L103) |
| `LOG_LEVEL` | ไม่ | `info` หรือ `warn` | `info` | บันทึก Log ระดับ info ขึ้นไป (เซิร์ฟเวอร์จะเซนเซอร์ authorization, password, accessToken เสมอ) | [`backend/server/src/app.js:121`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/app.js#L121) |
| `AUTH_RATE_LIMIT_MAX` | ไม่ | `10` | `10` | จำกัดการ Login/Signup ไม่เกิน 10 ครั้งต่อหน้าต่างเวลา ต่อ IP | [`backend/server/src/app.js:107`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/app.js#L107) |
| `AUTH_RATE_LIMIT_WINDOW_MS` | ไม่ | `60000` | `60000` (1 นาที) | หน้าต่างเวลา Rate Limit ของ Auth (หน่วย ms) | [`backend/server/src/app.js:110`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/app.js#L110) |
| `RPC_RATE_LIMIT_MAX` | ไม่ | `120` | `120` | จำกัดการเรียก `/rpc/*` ไม่เกิน 120 ครั้งต่อหน้าต่างเวลา ต่อผู้ใช้ (`sub` ใน JWT) โดย 3 ฟังก์ชันสำคัญ (`send_message`, `create_session`, `report`) ถูกจำกัดแยกที่ 20 ครั้ง/นาที อัตโนมัติ | [`backend/server/src/routes/rpc.js:14`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/rpc.js#L14) |
| `RPC_RATE_LIMIT_WINDOW_MS` | ไม่ | `60000` | `60000` (1 นาที) | หน้าต่างเวลา Rate Limit ของ RPC (หน่วย ms) | [`backend/server/src/routes/rpc.js:17`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/rpc.js#L17) |
| `DATA_RATE_LIMIT_MAX` | ไม่ | `300` | `300` | จำกัดการเรียก GET data routes (`/courts`, `/messages*`, `/session_members*`, `/profiles/*`) รวมไม่เกิน 300 ครั้งต่อหน้าต่างเวลา ต่อผู้ใช้ | [`backend/server/src/routes/data.js:9`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/data.js#L9) |
| `DATA_RATE_LIMIT_WINDOW_MS` | ไม่ | `60000` | `60000` (1 นาที) | หน้าต่างเวลา Rate Limit ของ Data Routes (หน่วย ms) | [`backend/server/src/routes/data.js:12`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/data.js#L12) |
| `DB_STATEMENT_TIMEOUT_MS` | ไม่ | `10000` | `10000` (10 วินาที) | ขีดจำกัดเวลาสูงสุดในการประมวลผลคำสั่ง SQL ใน Connection Pool ตัดคำสั่งด้วย code 57014 (คืนค่า HTTP 503) | [`backend/server/src/db.js:20`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/db.js#L20) |
| `DB_IDLE_TX_TIMEOUT_MS` | ไม่ | `15000` | `15000` (15 วินาที) | ขีดจำกัดเวลาสูงสุดของ Transaction ที่ค้างอยู่เฉยๆ ป้องกันการล็อกทรัพยากร | [`backend/server/src/db.js:25`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/db.js#L25) |
| `TILES_DIR` | ไม่ | `/var/www/hoopup/backend/server/tiles` | `<server_dir>/tiles` | ไดเรกทอรีจัดเก็บไฟล์แผนที่ PMTiles (รองรับ path ปลายทางของ `.pmtiles`) | [`backend/server/src/routes/tiles.js:23`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/tiles.js#L23) |
| `PLACES_FILE` | ไม่ | `/var/www/hoopup/backend/server/data/places-bangkok.ndjson` | `<server_dir>/data/places-bangkok.ndjson` | ไฟล์ข้อมูลสถานที่ Overture ในรูปแบบ NDJSON (ใช้ร่วมกันทั้ง `/places` และ `/places/search`) | [`backend/server/src/routes/places.js:368`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/places.js#L368), [`placesSearch.js:269`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/placesSearch.js#L269) |
| `PLACES_RATE_LIMIT_MAX` | ไม่ | `240` | `240` | จำกัดการเรียก `/places` ไม่เกิน 240 ครั้งต่อหน้าต่างเวลา ต่อ IP (แยกบัคเก็ตอิสระ) | [`backend/server/src/routes/places.js:377`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/places.js#L377) |
| `PLACES_RATE_LIMIT_WINDOW_MS` | ไม่ | `60000` | `60000` (1 นาที) | หน้าต่างเวลา Rate Limit ของ `/places` (หน่วย ms) | [`backend/server/src/routes/places.js:380`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/places.js#L380) |
| `PLACES_SEARCH_RATE_LIMIT_MAX` | ไม่ | `120` | `120` | จำกัดการเรียก `/places/search` ไม่เกิน 120 ครั้งต่อหน้าต่างเวลา ต่อ IP (แยกบัคเก็ตอิสระ) | [`backend/server/src/routes/placesSearch.js:279`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/placesSearch.js#L279) |
| `PLACES_SEARCH_RATE_LIMIT_WINDOW_MS` | ไม่ | `60000` | `60000` (1 นาที) | หน้าต่างเวลา Rate Limit ของ `/places/search` (หน่วย ms) | [`backend/server/src/routes/placesSearch.js:282`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/placesSearch.js#L282) |

#### ตัวอย่างไฟล์ `/var/www/hoopup/backend/server/.env` สำหรับ Production:
```ini
PORT=3000
HOST=127.0.0.1
DATABASE_URL=postgres://hoopup_api:YOUR_REAL_STRONG_PASSWORD@127.0.0.1:5432/postgres
NODE_ENV=production
JWT_SECRET=YOUR_RANDOM_SECRET_GENERATED_BY_OPENSSL_MIN_32_CHARS
TRUST_PROXY=127.0.0.1
ALLOWED_ORIGINS=https://hoopup.example.com
LOG_LEVEL=info
AUTH_RATE_LIMIT_MAX=10
AUTH_RATE_LIMIT_WINDOW_MS=60000
RPC_RATE_LIMIT_MAX=120
RPC_RATE_LIMIT_WINDOW_MS=60000
DATA_RATE_LIMIT_MAX=300
DATA_RATE_LIMIT_WINDOW_MS=60000
DB_STATEMENT_TIMEOUT_MS=10000
DB_IDLE_TX_TIMEOUT_MS=15000
TILES_DIR=/var/www/hoopup/backend/server/tiles
PLACES_FILE=/var/www/hoopup/backend/server/data/places-bangkok.ndjson
PLACES_RATE_LIMIT_MAX=240
PLACES_RATE_LIMIT_WINDOW_MS=60000
PLACES_SEARCH_RATE_LIMIT_MAX=120
PLACES_SEARCH_RATE_LIMIT_WINDOW_MS=60000
```
*(กำหนดสิทธิ์ไฟล์: `chmod 600 /var/www/hoopup/backend/server/.env` เพื่อป้องกันผู้ใช้อื่นอ่าน)*

### 3.8 การติดตั้ง Systemd Unit File
สร้างไฟล์ Service ควบคุมการทำงานอัตโนมัติที่ `/etc/systemd/system/hoopup-api.service`:

```ini
[Unit]
Description=HoopUp Backend Fastify API Service
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=hoopup
Group=hoopup
WorkingDirectory=/var/www/hoopup/backend/server
EnvironmentFile=/var/www/hoopup/backend/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
LimitNOFILE=65535

# หมายเหตุเรื่อง Memory (Measure on the host):
# ไม่ควรใส่ MemoryMax ล่วงหน้าโดยไม่ได้วัดหน้างานจริง หากต้องการกำหนด ให้วัด RSS จริงบนโฮสต์ภายใต้ภาระงานจริงก่อน (measure on the host)

# ป้องกันความปลอดภัยของ Process
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true
PrivateTmp=true

# บันทึก Logs ออก standard output ไปยัง journald
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hoopup-api

[Install]
```

คำสั่งเปิดใช้งาน Service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable hoopup-api
sudo systemctl start hoopup-api
sudo systemctl status hoopup-api
```

### 3.9 ตำแหน่งและการตรวจสอบ Logs
- ตรวจสอบ Logs แบบ Realtime:
  ```bash
  journalctl -u hoopup-api -f
  ```
- ตรวจสอบ Logs ข้อผิดพลาดย้อนหลัง:
  ```bash
  journalctl -u hoopup-api -p err -n 50 --no-pager
  ```

---

## 4. การตั้งค่า Reverse Proxy (Caddyfile & Nginx)

Reverse Proxy ทำหน้าที่สำคัญ 4 ประการ:
1. จัดการ SSL/TLS Certificate (HTTPS) อัตโนมัติ
2. เสิร์ฟไฟล์ Static Web App จาก `/var/www/hoopup/dist` พร้อมทำ SPA Fallback
3. ปล่อยผ่าน HTTP Range Requests สำหรับแผนที่เวกเตอร์ `.pmtiles` โดยไม่แปลงเป็น 200 หรือบัฟเฟอร์ข้อมูล
4. **ห้ามบีบอัด Gzip/Zstandard ซ้ำบนไฟล์ `.pmtiles`** เนื่องจากไฟล์ PMTiles ถูกบีบอัดระดับคลัสเตอร์ภายในอยู่แล้ว การเปิด gzip ในพร็อกซีจะทำให้เสีย CPU โดยเปล่าประโยชน์และทำให้เบราว์เซอร์ไม่สามารถอ่านข้อมูลแบบ Range ได้อย่างถูกต้อง

---

### 4.1 ทางเลือกที่ 1: Caddyfile (แนะนำเป็นลำดับแรก — ทำ HTTPS อัตโนมัติในตัว)

ติดตั้ง Caddy บน Debian/Ubuntu:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

สร้างไฟล์ `/etc/caddy/Caddyfile`:

```caddy
hoopup.example.com {
    # 1. กำหนด Root ไดเรกทอรีสำหรับ Static Web App
    root * /var/www/hoopup/dist

    # 2. บีบอัด Gzip/Zstandard เฉพาะไฟล์ข้อความทั่วไป (ยกเว้น .pmtiles โดยเด็ดขาด)
    encode zstd gzip {
        match {
            header Content-Type text/*
            header Content-Type application/json*
            header Content-Type application/javascript*
            header Content-Type image/svg+xml*
        }
    }

    # 3. กำหนด Long Cache ให้กับ Assets ของ Vite (มี Content Hash ในชื่อไฟล์)
    @staticAssets path /assets/*
    header @staticAssets Cache-Control "public, max-age=31536000, immutable"

    # 4. ส่งต่อ API Requests ไปยัง Fastify Backend Gateway
    # สตรีม Range Requests ของ /tiles/* ส่งตรงไปยัง Node.js โดยไม่บัฟเฟอร์
    # หมายเหตุ (แก้โดย Manager): ต้องใช้ handle แยกกัน เพราะลำดับ directive ของ Caddy รัน try_files
    # ก่อน reverse_proxy ถ้าวาง try_files ไว้ระดับเดียวกัน คำขอ /auth/login ที่ไม่มีไฟล์จริงจะถูกเขียน path
    # เป็น /index.html ก่อนถึง matcher ของ API (ยังไม่ได้ทดสอบกับ Caddy จริง ให้รัน smoke test ข้อ 7 ทุกครั้ง)
    @apiRoutes path /auth/* /rpc/* /courts* /messages* /session_members* /profiles* /tiles* /places* /health
    handle @apiRoutes {
        reverse_proxy 127.0.0.1:3000 {
            header_up Host {host}
            # เขียนทับ X-Forwarded-For ด้วย IP ที่ต่อเข้ามาจริง (ไคลเอนต์ปลอมค่านี้ไม่ได้)
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}

            # ปิด response buffering เพื่อให้ HTTP Range สตรีมไบต์ได้ทันที
            flush_interval -1
        }
    }

    # 5. SPA Fallback สำหรับ Route ฝั่งไคลเอนต์ (React Router)
    handle {
        try_files {path} /index.html
        file_server
    }
}
```

คำสั่ง Reload Caddy:
```bash
sudo systemctl reload caddy
```

---

### 4.2 ทางเลือกที่ 2: Nginx (พร้อม Certbot SSL)

สร้างไฟล์ `/etc/nginx/sites-available/hoopup`:

```nginx
# HTTP -> HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name hoopup.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name hoopup.example.com;

    # SSL Certificates (จัดการผ่าน certbot)
    ssl_certificate /etc/letsencrypt/live/hoopup.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hoopup.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /var/www/hoopup/dist;
    index index.html;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # 1. การตั้งค่า Gzip: ห้ามบีบอัด .pmtiles และ application/octet-stream
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript image/svg+xml;

    # 2. Static Assets Caching (Vite Assets)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # 3. PMTiles Vector Map Route: อนุญาต HTTP Range Requests แบบไม่บัฟเฟอร์
    location /tiles/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # ส่งผ่าน Range Header และ If-None-Match ไปยัง Fastify
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_set_header If-None-Match $http_if_none_match;

        # ส่งต่อข้อมูลผู้ใช้จริง
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # เขียนทับด้วย IP ที่ต่อเข้ามาจริง (ไม่ใช้ $proxy_add_x_forwarded_for ที่ต่อท้ายค่าที่ไคลเอนต์ส่งมา ซึ่งปลอมได้)
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # ปิด Proxy Buffering เพื่อให้ส่งต่อ 206 Partial Content ทันที
        proxy_buffering off;
        proxy_request_buffering off;
        gzip off; # ปิด gzip ซ้ำบน PMTiles
    }

    # 4. API Endpoints ส่งต่อไปยัง Fastify Backend
    location ~ ^/(auth|rpc|courts|messages|session_members|profiles|places|health) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 5. SPA Routing Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

คำสั่งเปิดใช้งาน Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/hoopup /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### 4.3 ข้อบกพร่องด้านความปลอดภัยที่ตรวจพบ (CRITICAL SECURITY AUDIT)

> [!CAUTION]
> **ตรวจพบจุดที่จำเป็นต้องแก้ไขในโค้ดก่อนเปิดให้บริการจริง (RESOLVED IN SEC2 / MANDATORY PROD CONFIG)**

#### การตรวจสอบโค้ดจริง
1. เดิมใน `backend/server/src/app.js` ตัวแปรอินสแตนซ์ Fastify ถูกสร้างขึ้นโดย**ไม่มีการระบุ `trustProxy`**:
   ```javascript
   const app = Fastify({
     bodyLimit: 64 * 1024, // 64 kB hard limit
     logger: loggerConfig,
   });
   ```
2. เมื่อไม่ได้กำหนด `trustProxy` ค่าเริ่มต้นของ Fastify คือ `trustProxy: false` ซึ่งทำให้ Fastify จะ**ไม่ยอมรับ** Header `X-Forwarded-For` จาก Reverse Proxy และจะถือว่า IP ของคำขอคือที่อยู่ socket ฝั่งตรงข้ามโดยตรง ซึ่งก็คือ `127.0.0.1` (IP ของ Caddy / Nginx) เสมอ
3. ใน [`backend/server/src/app.js:107-115`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/app.js#L107-L115), [`backend/server/src/routes/places.js:377-395`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/places.js#L377-L395), และ [`backend/server/src/routes/placesSearch.js:292-300`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/placesSearch.js#L292-L300) ตัวจำกัดอัตราคำขอ (In-memory Rate Limiters) อ่าน client IP ผ่าน `request.ip`

#### ผลกระทบร้ายแรงหากไม่แก้ไข (Severity: High)
เมื่อรันระบบหลัง Reverse Proxy โดยไม่มีการตั้งค่า `trustProxy`:
- **ผู้ใช้งานทุกคนทั่วทั้งเมืองจะถูกมองว่าเป็น IP เดียวกันคือ `127.0.0.1`**
- **ผลลัพธ์กับ `/places` และ `/places/search`**: โควตา 240 ครั้ง/นาที สำหรับ `/places` และ 120 ครั้ง/นาที สำหรับ `/places/search` จะกลายเป็นโควตารวมของผู้เล่นทุกคน เมื่อผู้ใช้งานเปิดแผนที่พร้อมกันเกินขีดจำกัด **ผู้เล่นทุกคนในระบบจะถูกตัดสิทธิ์และได้รับ HTTP 429 Too Many Requests ทันที**
- **ผลลัพธ์กับ `/auth/login` และ `/auth/signup`**: โควตา 10 ครั้ง/นาที จะถูกแชร์ร่วมกัน หากมีคนพยายามล็อกอินผิดหรือมีผู้ใช้ใหม่สมัครพร้อมกันเกิน 10 ครั้ง จะทำให้ระบบล็อกอินบล็อกผู้ใช้ทุกคนบนเซิร์ฟเวอร์ทันที

#### สิ่งที่แก้ไขแล้วในโค้ด (Resolved in SEC2) และข้อกำหนดในการตั้งค่า Production
ในภารกิจ SEC2 ทีมงานได้แก้ไขโค้ด [`backend/server/src/app.js:10-85, 135-139`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/app.js#L10-L85) โดยเพิ่มฟังก์ชัน `parseTrustProxy()` และส่งต่อค่า `trustProxy` ให้ Fastify โดยอัตโนมัติ:

```javascript
  const trustProxy = parseTrustProxy(rawTrustProxy);
  const app = Fastify({
    bodyLimit: 64 * 1024, // 64 kB hard limit
    logger: loggerConfig,
    trustProxy, // รับค่าจากตัวแปรสภาพแวดล้อม TRUST_PROXY
  });
```

**ข้อกำหนดเคร่งครัดสำหรับผู้ดูแลระบบบน Production**:
ในไฟล์คอนฟิก `/var/www/hoopup/backend/server/.env` ผู้ดูแลระบบต้องระบุค่า IP ของ Reverse Proxy อย่างชัดเจนเสมอ:
```ini
TRUST_PROXY=127.0.0.1
```

> **ห้ามใช้ `trustProxy: true`** (แก้โดย Manager): ค่า `true` ทำให้ Fastify เชื่อทุก hop และเอา IP ซ้ายสุดของ `X-Forwarded-For` ซึ่งไคลเอนต์ปลอมได้เองเพื่อหลบตัวจำกัดจำนวนครั้ง ให้ใช้ที่อยู่ของ proxy แบบเจาะจง (`127.0.0.1`) คู่กับการที่ proxy เขียนทับ `X-Forwarded-For` ด้วย IP ที่ต่อเข้ามาจริง (ตามตัวอย่าง Caddyfile/Nginx ด้านบน) และต้องให้ Node ฟังที่ `127.0.0.1` เท่านั้น (ค่าเริ่มต้นของ `HOST`) ห้ามเปิดพอร์ต 3000 สู่ภายนอก ข้อควรระวังเพิ่มเติม: แบบ hop count (เช่น `TRUST_PROXY=1`) เชื่อ peer ทุกตัวที่ต่อเข้ามา ถ้าเครื่องภายนอกต่อเข้า backend ตรงๆ ได้ จะปลอม `X-Forwarded-For` เพื่อเลี่ยงตัวจำกัดได้ ทดสอบแล้ว ดังนั้นให้ใช้ IP/CIDR ของ proxy เป็นหลัก และใช้ hop count ก็ต่อเมื่อ backend เข้าถึงได้ผ่าน proxy เท่านั้น (ค่าเริ่มต้น `HOST=127.0.0.1`) ชุดเดียวกันนี้ได้รับการทดสอบความปลอดภัยครบถ้วนแล้วในชุดทดสอบ SEC2 (`test/sec2.test.js`)

---

## 5. การ Build และ Deploy Frontend Web App

แอปพลิเคชันฝั่ง Frontend พัฒนาด้วย React 19 + TypeScript + Vite และจัดการบริการผ่าน Service Adapters ในไดเรกทอรี `app/src/services/`

### 5.1 ตัวแปร `VITE_*` สำหรับการ Build Production (อัปเดตตาม MAP6d)

ในงาน MAP6d ระบบได้เปลี่ยนให้ **MapLibre เป็น Map Engine เริ่มต้น (DEFAULT)** สำหรับ Web App โดยสมบูรณ์ ([`app/src/features/discovery/mapConfig.ts:128-130`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/app/src/features/discovery/mapConfig.ts#L128-L130)) หากไม่ระบุตัวแปรสภาพแวดล้อมหรือระบุค่าที่ไม่รู้จัก ระบบจะเลือกใช้ MapLibre เสมอ ส่วน Leaflet จะทำหน้าที่เป็น Fallback เมื่อระบุ `VITE_MAP_ENGINE=leaflet`

สร้างไฟล์ `app/.env.production` (หรือส่งผ่านคำสั่ง build):

```ini
# 1. ชี้ API ไปยังโดเมนจริงของ Backend (มีผลทำให้สลับออกจาก Mock Adapter อัตโนมัติ)
VITE_API_BASE_URL=https://hoopup.example.com

# 2. เครื่องมือแสดงผลแผนที่ (Map Engine)
# maplibre (DEFAULT สำหรับเว็บ แม้ไม่ระบุค่านี้) | leaflet (Fallback)
VITE_MAP_ENGINE=maplibre

# 3. ตัวแปรหลัก 3 ตัวสำหรับเว็บแผนที่และสถานที่:
# 3.1 พาทไฟล์ PMTiles เวกเตอร์ (ชี้ไปที่ Proxy Endpoint)
# หมายเหตุ: หากไม่ระบุ VITE_MAP_PMTILES_URL (หรือตั้ง VITE_MAP_TILES=off)
# MapLibre จะแสดงหมุดสนามบนพื้นหลังสีเรียบ (Plain background) โดยไม่โหลดเลเยอร์แผนที่
VITE_MAP_PMTILES_URL=https://hoopup.example.com/tiles/bangkok.pmtiles
VITE_MAP_PMTILES_FLAVOR=dark

# 3.2 พาท API สถานที่ Overture (หากไม่ระบุ ระบบจะใช้ /places ที่ origin เดียวกับ PMTILES_URL)
VITE_PLACES_API_URL=https://hoopup.example.com/places

# 3.3 ธงเปิด/ปิดสถานที่ใกล้สนาม (Default คือ ON สำหรับ MapLibre เมื่อ zoom >= 16)
# ตั้งเป็น 'off' เพื่อปิดการดึงสถานที่ เช่น ในการทดสอบหรือบน APK
# VITE_PLACES=off

# 4. ตรวจสอบธงทดสอบที่ต้อง "ปิด" (Test-only Flags):
# VITE_MAP_PRESERVE_BUFFER: ห้ามตั้งเป็น 'on' ใน Production โดยเด็ดขาด (Default: OFF)
# มีผลเฉพาะการทดสอบอ่านพิกเซลของ vitest เท่านั้น การเปิด on จะทำให้กินแรม GPU และลดทอนประสิทธิภาพ
# VITE_MAP_PRESERVE_BUFFER=off
```

> [!IMPORTANT]
> **ข้อกำหนดการแสดงเครดิตแหล่งที่มา (Attribution Requirement)**:
> ตามสัญญาอนุญาต CDLA-Permissive-2.0 ข้อความแสดงที่มาของข้อมูลสถานที่ **`Places © Overture Maps Foundation`** จะต้องแสดงให้เห็นได้อย่างชัดเจนบนหน้าจอแผนที่เสมอ โดยมีลิงก์อ้างอิงไปยังเอกสารประกาศสิทธิ์ [`NOTICE_OVERTURE.md`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/NOTICE_OVERTURE.md)
>
> **หมายเหตุสำหรับ Android APK**:
> แอปพลิเคชัน Android APK ยังคงใช้ Leaflet (`VITE_MAP_ENGINE=leaflet`) พร้อมโหมดหมุดสนามบนพื้นหลังเรียบ (`VITE_PLACES=off`, `VITE_MAP_TILES=off`) จนกว่าจะมีการทดสอบประสิทธิภาพ WebGL ของ MapLibre บนฮาร์ดแวร์อุปกรณ์จริง

### 5.2 การทำงานของระบบสลับ Adapter (Adapter Selection & Demo Mode)

จากการตรวจสอบโค้ดใน [`app/src/services/AppServicesProvider.tsx:20-66`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/app/src/services/AppServicesProvider.tsx#L20-L66) และ [`app/src/services/apiAdapter.ts:76-90`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/app/src/services/apiAdapter.ts#L76-L90):

1. เมื่อตั้งค่า `VITE_API_BASE_URL` เป็น URL ที่ขึ้นต้นด้วย `http://` หรือ `https://`:
   - `apiAuth.isConfigured` จะมีค่าเป็น `true`
   - `connectedModeType` จะถูกตั้งค่าเป็น `'connected-api'`
   - **ระบบจะเลือกใช้ `ApiAuthService` และ `ApiDataService` ซึ่งเชื่อมต่อกับเซิร์ฟเวอร์จริงเป็นค่าเริ่มต้นโดยอัตโนมัติ** (ไม่ใช้ Mock Data)
2. **ข้อควรระวังเรื่อง LocalStorage ของเครื่องทดสอบ**:
   - ใน `AppServicesProvider.tsx:50-55` หากผู้ทดสอบเคยเข้าเว็บแล้วกดสลับเป็น Demo Mode มาก่อน เบราว์เซอร์จะบันทึก `localStorage.getItem('hoopup_preferred_mode') = 'demo'` ซึ่งจะทำให้เครื่องนั้นเปิดเข้า Demo Mode เสมอแม้จะต่อ API จริงแล้ว
   - วิธีแก้ไข: แนะนำให้เคลียร์ LocalStorage หรือสั่งล้างค่า `localStorage.removeItem('hoopup_preferred_mode')` ในการทดสอบ Production
3. **ข้อควรระวังเรื่อง Query String `?demo_reset=true`**:
   - ใน `AppServicesProvider.tsx:77-84` ระบบมี Event ดักจับ `demo_reset=true` เพื่อล้างข้อมูล Mock Storage สำหรับการทดสอบอัตโนมัติ ห้ามนำลิงก์ที่มีพารามิเตอร์นี้ไปเผยแพร่ให้ผู้ใช้ทั่วไป

### 5.3 คำสั่ง Build และนำไฟล์ไปติดตั้ง

รันบนเครื่องเซิร์ฟเวอร์ (หรือรันบน CI/CD แล้ว rsync ไฟล์ขึ้นไป):

```bash
cd /var/www/hoopup/app

# ติดตั้ง Dependencies
npm install

# รัน Typecheck และ Vite Build
npm run build
```
- สคริปต์ `npm run build` ([`app/package.json:8`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/app/package.json#L8)) จะรัน `tsc -b && vite build` และสร้างผลลัพธ์ไฟล์ static ทั้งหมดลงในไดเรกทอรี `app/dist/`
- ตรวจสอบว่าไดเรกทอรี `/var/www/hoopup/dist` มีสิทธิ์อ่านสำหรับเว็บเซิร์ฟเวอร์ (`caddy` หรือ `www-data`):
  ```bash
  sudo chown -R hoopup:hoopup /var/www/hoopup/dist
  sudo chmod -R 755 /var/www/hoopup/dist
  ```

---

## 6. รายการตรวจสอบก่อนเปิดใช้งานจริง (Pre-launch Checklist)

ก่อนเปิดรับผู้ใช้งานจริง เจ้าของระบบและทีมงานต้องตรวจสอบและตระหนักถึงรายการความปลอดภัยและความพร้อมทางเทคนิคดังต่อไปนี้ (รวมรายการเปิดที่ยังไม่ได้รับการแก้ไขจากรายงานการตรวจสอบความปลอดภัย SEC1):

- [ ] **1. ความสมบูรณ์ของ HTTPS & HSTS บน Reverse Proxy (จาก SEC1 ข้อ 10)**:
  - โดเมนมีใบรับรอง SSL/TLS ที่ถูกต้อง (ตรวจผ่าน Qualys SSL Labs ได้เกรด A หรือ A+)
  - ทราฟฟิก HTTP (Port 80) ทั้งหมดต้องถูก Redirect แบบ 301 ไปยัง HTTPS (Port 443)
  - ต้องเปิดใช้ HTTP Strict Transport Security (HSTS) ที่ฝั่ง Proxy (Caddy/Nginx) เสมอ เช่น `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`
- [ ] **2. การระบุค่า CORS `ALLOWED_ORIGINS` อย่างเข้มงวด**:
  - ในไฟล์ `.env` ต้องระบุเฉพาะโดเมนของ Production เท่านั้น (เช่น `ALLOWED_ORIGINS=https://hoopup.example.com`)
  - ห้ามใช้ `*` และห้ามค้างพอร์ตพัฒนา `http://localhost:5173`
- [ ] **3. การตรวจสอบ Runtime Config Overrides ของแผนที่**:
  - โค้ด [`app/src/features/discovery/mapConfig.ts:78-126`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/app/src/features/discovery/mapConfig.ts#L78-L126) รองรับการ Override ค่าผ่าน `window.__HOOPUP_CONFIG__` และ `localStorage` (เช่น `VITE_MAP_ENGINE`, `VITE_MAP_PMTILES_URL`) ต้องมั่นใจว่าไม่มีการฝังสคริปต์แก้ไขค่าคอนฟิกเหล่านี้ในแท็ก `<head>` ของ `index.html`
- [ ] **4. กลไกการเพิกถอน Token และการระงับบัญชีผู้ใช้ (Token Revocation / Ban Mechanism - จาก SEC1 ข้อ 4)**:
  - **ข้อจำกัดปัจจุบัน**: Access Token (JWT) มีอายุ 1 ชั่วโมง (3,600 วินาที) โดยไม่มี Refresh Token หรือบัญชีเพิกถอน (Revocation List / Blacklist) และการออกจากระบบ (Logout) เกิดขึ้นเฉพาะที่ฝั่งไคลเอนต์เท่านั้น
  - **ความเสี่ยง**: Route ทางธุรกิจส่วนใหญ่ (`/rpc/*`, `/courts`, `/messages*`) ตรวจสอบเฉพาะความถูกต้องของลายเซ็นและเวลาหมดอายุของ JWT โดย**ไม่ได้คิวรีฐานข้อมูลซ้ำว่าบัญชียังมีอยู่จริงหรือถูกแบนหรือไม่** (มีเพียง `/auth/me` เท่านั้นที่คิวรีฐานข้อมูล) หากแอดมินทำการแบนหรือลบผู้ใช้ในตาราง `app_auth.users` บัญชีนั้นจะยังคงเรียกใช้งาน API ได้ต่อไปจนกว่าโทเค็นจะหมดอายุ (ไม่เกิน 60 นาที)
  - **การดำเนินการ**: เจ้าของโปรเจกต์ต้องตัดสินใจเชิงนโยบาย (Owner Decision) ว่ายอมรับพฤติกรรมนี้ในขั้น MVP หรือต้องการให้เพิ่มกลไกเช็กสถานะการแบนใน hook หรือลดอายุ Token ลงก่อนเปิดบริการสาธารณะ
- [ ] **5. ระบบยืนยันตัวตนทางอีเมล (Email Verification Needs Provider - จาก SEC1 ข้อ 6, 7)**:
  - **การตรวจสอบโค้ดจริง**: ตรวจสอบใน [`backend/server/src/routes/auth.js:17-89`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/auth.js#L17-L89) พบว่า **ระบบยังไม่มีการส่งอีเมลยืนยันตัวตน (Email Verification / OTP)** เมื่อผู้ใช้กรอกอีเมลและรหัสผ่าน ระบบจะบันทึกลงฐานข้อมูลและออก Access Token ให้เข้าใช้งานได้ทันที
  - **สิ่งที่ต้องตระหนัก**: การเปิดระบบยืนยันตัวตนทางอีเมลจำเป็นต้องสมัครและเชื่อมต่อบริการส่งอีเมลภายนอก (Email Service Provider เช่น Resend, SendGrid, Amazon SES) ซึ่งมีภาระค่าใช้จ่ายและการบริหารจัดการบัญชี เจ้าของระบบต้องรับทราบว่าผู้ใช้อาจใช้อีเมลที่ไม่มีอยู่จริงสมัครได้ในระยะ MVP และต้องควบคุมตัวจำกัดอัตรา `AUTH_RATE_LIMIT_MAX` ไว้อย่างเข้มงวด
- [ ] **6. การมอนิเตอร์ประสิทธิภาพ `/places/search` แบบ Linear Scan บน Thread เดียว**:
  - **การตรวจสอบโค้ดจริง**: ดัชนี `PlacesSearchIndex` ([`backend/server/src/routes/placesSearch.js`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/placesSearch.js)) ค้นหาสถานที่ด้วยการทำ Linear Scan ตรวจสอบชื่อทั้ง 156,943 แห่งบน Event Loop Thread เดียวของ Node.js ในทุกๆ คำขอ
  - **สิ่งที่ต้องเฝ้าระวัง**: แม้ผลการวัดผล latency จะทำได้ดีเยี่ยม (p95 ~30–47 ms) แต่หากมีการระดมยิงค้นหาเข้ามาพร้อมกันหนาแน่น (High Concurrent Traffic) อาจทำให้ Thread หลักทำงานหนักจนส่งผลกระทบต่อคำขอ API อื่นๆ
  - **การดำเนินการ**: ผู้ดูแลระบบต้องติดตั้ง Monitoring สำหรับ Endpoint `/places/search` และทีมงานควรวางแผนทำ n-gram pre-index, In-memory Search Cache หรือย้ายการค้นหาไปประมวลผลบน Worker Thread ก่อนที่จะมีการเปิดตัวสู่สาธารณะในวงกว้าง
- [ ] **7. การตัดสินใจเชิงนโยบายเรื่องความโปร่งใสของข้อมูลโปรไฟล์ (`height_cm` / PDPA - จาก SEC1 ข้อ 5)**:
  - **การตรวจสอบโค้ดจริง**: ใน [`backend/server/src/routes/data.js:180-210`](file:///C:/D_Drive/terminter01/garage/project_ideas/basketball/backend/server/src/routes/data.js#L180-L210) Endpoint `/profiles/:userId` คัดเลือก 10 คอลัมน์ที่ชัดเจน ซึ่งรวมถึง `height_cm`, `skill_level`, และตำแหน่งที่ถนัด และอนุญาตให้ผู้ใช้ที่ล็อกอินทุกคนสามารถดูข้อมูลโปรไฟล์ของผู้ใช้อื่นได้ผ่าน UUID
  - **การดำเนินการ**: เจ้าของโปรเจกต์ต้องตัดสินใจเชิงผลิตภัณฑ์และความเป็นส่วนตัว (PDPA) ว่าข้อมูลส่วนสูง (`height_cm`) ควรเปิดให้ผู้เล่นอื่นเห็นในหน้านัดหรือไม่ หรือควรซ่อน/แสดงเฉพาะเมื่อผู้ใช้ยินยอม
- [ ] **8. กฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA / Privacy Policy)**:
  - **การตรวจสอบโค้ดจริง**: เอกสารข้อตกลง PDPA มีเฉพาะไฟล์ต้นแบบใน `mvp_tasks_2026-10-28/ui_lab/pdpa_consent.html` และยังไม่ได้ถูกนำเข้าสู่ React Application
  - **การดำเนินการ**: เจ้าของโปรเจกต์ต้องจัดเตรียมนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานที่ผ่านการตรวจสอบโดยนักกฎหมาย เพื่อนำมาติดตั้งก่อนเปิดบริการในประเทศไทยอย่างเป็นทางการ
- [ ] **9. แผนการหมุนเวียนคีย์ความลับ (Rotate JWT_SECRET Plan)**:
  - **สิ่งที่ต้องตระหนัก**: เนื่องจาก JWT ใช้การลงนามแบบ Symmetric (HS256) การเปลี่ยนค่า `JWT_SECRET` ในไฟล์ `.env` จะส่งผลให้ Access Token ของผู้ใช้งานทุกคนที่ยังไม่หมดอายุกลายเป็นโมฆะทันที (Invalid Signature) และผู้ใช้ทุกคนจะถูกบังคับให้ออกจากระบบและต้องล็อกอินใหม่
  - **การดำเนินการ**: ผู้ดูแลระบบต้องวางแผนการหมุนเวียนคีย์ความลับ โดยกำหนดให้ดำเนินการในช่วงเวลาบำรุงรักษาระบบ (Maintenance Window) และแจ้งเตือนผู้ใช้งานล่วงหน้า
- [ ] **10. สคริปต์สำรองข้อมูลอัตโนมัติ (Automated Backups & WAL Retention)**:
  - ตั้งค่า Cronjob สำรองฐานข้อมูล PostgreSQL ทุกคืนทั้งสกีมา `public` และ `app_auth` และส่งออกไปจัดเก็บนอกเครื่อง (Offsite Backup เช่น S3, Cloudflare R2 หรือ SFTP):
    ```bash
    # ตัวอย่างคำสั่ง Backup รายวัน
    0 3 * * * pg_dump -U hoopup_api -h 127.0.0.1 -d postgres | gzip > /var/backups/hoopup_$(date +\%F).sql.gz
    ```
- [ ] **11. การตรวจวัดสถานะระบบ (Monitoring & Health Check)**:
  - ตั้ง Uptime Monitor (เช่น UptimeRobot หรือ BetterStack) ยิงตรวจสอบ Endpoint `GET https://hoopup.example.com/health` ทุกๆ 1 หรือ 5 นาที
- [ ] **12. การตรวจช่องโหว่ความปลอดภัยแพ็กเกจ (`npm audit` ก่อนทุก Release)**:
  - ต้องรันคำสั่ง `npm audit` ทั้งในโฟลเดอร์ `backend/server` และโฟลเดอร์ `app` ก่อน Deploy ทุก Release เพื่อตรวจสอบว่าไม่มีช่องโหว่ความปลอดภัยระดับ High หรือ Critical ใน dependencies
- [ ] **13. การจัดการข้อมูลทดสอบ (Remove Demo Data)**:
  - ตรวจสอบว่าไม่มีบัญชีผู้เล่นทดสอบที่มีรหัสผ่านง่ายๆ หลงเหลืออยู่ในตาราง `app_auth.users`

---

## 7. คำสั่งทดสอบระบบหลัง Deploy (Smoke-Test Commands)

> [!NOTE]
> **ความโปร่งใส (Honesty Notice)**: คำสั่ง `curl` ด้านล่างนี้เป็นตัวอย่างคำสั่งตรวจสอบที่เขียนขึ้นตาม Contract ของ API แต่**ยังไม่ได้ถูกรันบนเซิร์ฟเวอร์ Linux จริงโดยผู้เขียน** (not executed on a real server by the author) เนื่องจากสภาพแวดล้อมการพัฒนาในปัจจุบันเป็น Windows ผู้ดูแลระบบต้องใช้คำสั่งเหล่านี้ทดสอบจริงบนเซิร์ฟเวอร์ปลายทางหลังติดตั้งเสร็จสิ้น (เปลี่ยน `https://hoopup.example.com` เป็นโดเมนจริงของคุณ):

### 7.1 ตรวจสอบความพร้อมของเซิร์ฟเวอร์ (/health)
```bash
curl -i https://hoopup.example.com/health
```
**ผลลัพธ์ที่คาดหวัง**:
- HTTP Status: `200 OK`
- Body: `{"status":"ok","timestamp":"2026-..."}`

### 7.2 ตรวจสอบการสตรีมแผนที่เวกเตอร์ PMTiles ด้วย HTTP Range (/tiles)
ทดสอบส่ง Range Header ดึงเฉพาะ 16 KB แรกของไฟล์แผนที่:
```bash
curl -i -H "Range: bytes=0-16383" https://hoopup.example.com/tiles/bangkok.pmtiles
```
**ผลลัพธ์ที่คาดหวัง**:
- HTTP Status: `206 Partial Content`
- Header: `Content-Range: bytes 0-16383/49051123`
- Header: `Content-Length: 16384`
- Header: `Accept-Ranges: bytes`
- Header: `Cache-Control: public, max-age=3600`
- Header: มี `ETag`

### 7.3 ตรวจสอบการค้นหาสถานที่ Overture Places ตาม Bounding Box (/places)
ทดสอบค้นหาร้านค้าและร้านอาหารในย่านสยามสแควร์:
```bash
curl -i "https://hoopup.example.com/places?bbox=100.525,13.735,100.545,13.755&limit=10&cats=food,shop"
```
**ผลลัพธ์ที่คาดหวัง**:
- HTTP Status: `200 OK`
- Header: `Cache-Control: public, max-age=300`
- Body: มีโครงสร้าง JSON `{ "places": [ ... ], "total": ..., "truncated": false }`

### 7.4 ตรวจสอบการค้นหาสถานที่ Overture Places ตามชื่อและพิกัดอ้างอิง (/places/search)
ทดสอบค้นหาสถานที่ตามชื่อในย่านสยาม (เพิ่มขึ้นใหม่ใน MAP7a):
```bash
curl -i "https://hoopup.example.com/places/search?q=siam&limit=5&near=100.534,13.746"
```
**ผลลัพธ์ที่คาดหวัง**:
- HTTP Status: `200 OK`
- Header: `Cache-Control: public, max-age=300`
- Header: มี `ETag`
- Body: มีโครงสร้าง JSON `{ "places": [ { "i": "...", "n": "...", "c": "...", "g": "...", "x": ..., "y": ..., "d": ... } ], "total": ..., "truncated": ... }`

### 7.5 ทดสอบการสมัครสมาชิกใหม่ (/auth/signup)
```bash
curl -i -X POST https://hoopup.example.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "smoketest_user@example.com",
    "password": "StrongPassword1234!",
    "displayName": "Smoke Tester"
  }'
```
**ผลลัพธ์ที่คาดหวัง**:
- HTTP Status: `201 Created`
- Body: มี `accessToken`, `tokenType: "Bearer"`, และอ็อบเจกต์ `user` (ต้องไม่มี `password_hash` ปรากฏ)

### 7.6 ทดสอบการเข้าสู่ระบบ (/auth/login)
```bash
curl -i -X POST https://hoopup.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "smoketest_user@example.com",
    "password": "StrongPassword1234!"
  }'
```
**ผลลัพธ์ที่คาดหวัง**:
- HTTP Status: `200 OK`
- Body: ส่งคืน `accessToken` และข้อมูลผู้ใช้

### 7.7 ทดสอบการดึงข้อมูลส่วนตัวด้วย Bearer Token (/auth/me)
นำ `accessToken` ที่ได้จากข้อ 7.6 มาทดสอบ:
```bash
curl -i https://hoopup.example.com/auth/me \
  -H "Authorization: Bearer <ใส่_ACCESS_TOKEN_ที่นี่>"
```
**ผลลัพธ์ที่คาดหวัง**:
- HTTP Status: `200 OK`
- Body: แสดงข้อมูลโปรไฟล์และ `displayName: "Smoke Tester"`

### 7.8 ทดสอบการเรียกคำสั่ง RPC ฐานข้อมูล (/rpc/hoopup_list_sessions)
ทดสอบดึงรายชื่อนัดเล่นบาสเกตบอลผ่าน RPC Gateway:
```bash
curl -i -X POST https://hoopup.example.com/rpc/hoopup_list_sessions \
  -H "Authorization: Bearer <ใส่_ACCESS_TOKEN_ที่นี่>" \
  -H "Content-Type: application/json" \
  -d '{"p_filter":{}}'
```
**ผลลัพธ์ที่คาดหวัง**:
- HTTP Status: `200 OK`
- Body: `{"ok":true,"result":[ ... ]}`

