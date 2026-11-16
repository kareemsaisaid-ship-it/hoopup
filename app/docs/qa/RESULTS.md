# HoopUp MVP — QA Test Results & Acceptance Evidence (G4)

**วันที่บันทึก:** 28 ตุลาคม 2569  
**ผู้รับผิดชอบ:** Seat G4 (QA & Acceptance)  
**อ้างอิงเอกสาร:** [ACCEPTANCE.md](ACCEPTANCE.md), [COMMON_TH.md](../../../mvp_tasks_2026-10-28/COMMON_TH.md), [G4_QA.md](../../../mvp_tasks_2026-10-28/G4_QA.md)

---

## 1. ข้อมูลสภาพแวดล้อมการทดสอบ (Environment Details)

- **Operating System:** Windows 10/11 (PowerShell CLI)
- **Node.js Execution:** Node.js v24.x / `npm.cmd`
- **Playwright Test Runner:** `@playwright/test` v1.64.1
- **Dev / Build Server:** Vite v8.3.5, React v19.3.1, TypeScript v7.0.2
- **Test Projects:**
  1. `Mobile Small Android (360x800)`
  2. `Mobile iPhone (390x844)`
  3. `Desktop Chromium (1280x800)`

---

## 2. ผลการรันคำสั่งจริง (Exact Commands & Actual Output)

### 2.1 ตรวจสอบความถูกต้องของ Typecheck และ Production Build
- **คำสั่ง:**
  ```powershell
  npm.cmd run build
  ```
- **ผลลัพธ์จริง (Exit Code 0):**
  ```text
  > hoopup-app@0.1.0 build
  > tsc -b && vite build

  vite v8.3.5 building client environment for production...
  transforming...
  ✓ 20 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                   0.45 kB │ gzip:  0.29 kB
  dist/assets/react-CHdo91hT.svg    4.12 kB │ gzip:  2.06 kB
  dist/assets/vite-BF8QNONU.svg     8.70 kB │ gzip:  1.60 kB
  dist/assets/hero-CLDdwZDr.png    13.05 kB
  dist/assets/index-D64VDMd1.css    4.10 kB │ gzip:  1.47 kB
  dist/assets/index-GpEN3EET.js   222.44 kB │ gzip: 69.28 kB

  ✓ built in 266ms
  ```

---

### 2.2 ตรวจสอบโครงสร้างและรายการ Test Suite (Playwright Test Discovery)
- **คำสั่ง:**
  ```powershell
  npx.cmd playwright test --list
  ```
- **ผลลัพธ์จริง (Exit Code 0):**
  ```text
  Listing tests:
    [Mobile Small Android (360x800)] › connected\supabase.spec.ts:23:3 › HoopUp MVP — Connected Backend & RLS Tests › RLS Policy: Unauthenticated user cannot read private session chat messages
    [Mobile Small Android (360x800)] › connected\supabase.spec.ts:34:3 › HoopUp MVP — Connected Backend & RLS Tests › Concurrency: Simultaneous last seat join results in exactly one success and capacity conflict
    [Mobile Small Android (360x800)] › e2e\capacity-edge.spec.ts:14:3 › HoopUp MVP — Capacity Math & Edge Robustness › TC-CAP-01 & TC-CAP-02: Host 1 + Guests 2 in Team 5 shows 3/5; pending request does not increment occupied
    [Mobile Small Android (360x800)] › e2e\capacity-edge.spec.ts:49:3 › HoopUp MVP — Capacity Math & Edge Robustness › TC-IDEM-01: Double click or rapid retry on Join does not create duplicate membership
    [Mobile Small Android (360x800)] › e2e\capacity-edge.spec.ts:78:3 › HoopUp MVP — Capacity Math & Edge Robustness › TC-CAP-04 & TC-CAP-05: Room becomes Full when last seat is taken; other user sees Full
    [Mobile Small Android (360x800)] › e2e\happy-path.spec.ts:11:3 › HoopUp MVP — Core Acceptance Flow (Happy Path) › Complete interaction: Host creates with 2 guests -> Joiner requests -> Host approves -> Chat -> Withdraw -> End
    [Mobile Small Android (360x800)] › e2e\lifecycle-authorization.spec.ts:14:3 › HoopUp MVP — Lifecycle, Time & Authorization Boundaries › TC-TIME-01 & TC-TIME-02: Past datetime is rejected; future datetime is accepted
    [Mobile Small Android (360x800)] › e2e\lifecycle-authorization.spec.ts:39:3 › HoopUp MVP — Lifecycle, Time & Authorization Boundaries › TC-SEC-02: Non-host user cannot see or trigger host management actions
    [Mobile Small Android (360x800)] › e2e\lifecycle-authorization.spec.ts:70:3 › HoopUp MVP — Lifecycle, Time & Authorization Boundaries › TC-SEC-01: Non-member or pending user cannot access chat messages or send input
    [Mobile Small Android (360x800)] › e2e\lifecycle-authorization.spec.ts:114:3 › HoopUp MVP — Lifecycle, Time & Authorization Boundaries › TC-SEC-03: Sign-out clears user cache and prevents session leakage
    [Mobile Small Android (360x800)] › e2e\responsive-mobile.spec.ts:26:5 › HoopUp MVP — Mobile Responsiveness (360x800 & 390x844) › Responsive verification for android-360x800 (360x800)
    [Mobile Small Android (360x800)] › e2e\responsive-mobile.spec.ts:26:5 › HoopUp MVP — Mobile Responsiveness (360x800 & 390x844) › Responsive verification for iphone-390x844 (390x844)
    [Mobile iPhone (390x844)] › connected\supabase.spec.ts:23:3 › ... (12 tests)
    [Desktop Chromium] › connected\supabase.spec.ts:23:3 › ... (12 tests)
  Total: 36 tests in 5 files
  ```

---

### 2.3 ตรวจสอบชุดทดสอบ Connected Backend & RLS Guard
- **คำสั่ง:**
  ```powershell
  npx.cmd playwright test tests/connected --project="Desktop Chromium"
  ```
- **ผลลัพธ์จริง (Exit Code 0):**
  ```text
  Running 2 tests using 1 worker

    -  1 [Desktop Chromium] › tests\connected\supabase.spec.ts:23:3 › HoopUp MVP — Connected Backend & RLS Tests › RLS Policy: Unauthenticated user cannot read private session chat messages
    -  2 [Desktop Chromium] › tests\connected\supabase.spec.ts:34:3 › HoopUp MVP — Connected Backend & RLS Tests › Concurrency: Simultaneous last seat join results in exactly one success and capacity conflict

    2 skipped
  ```
- **เหตุผลการ Skip:** ปฏิบัติตามกฎ COMMON_TH.md และ G4_QA.md อย่างเคร่งครัด เนื่องจากยังไม่มี live development instance และบัญชีทดสอบที่ได้รับอนุญาต จึงไม่รัน connected test และไม่อ้างว่า RLS ผ่านจากการรัน demo mock

---

## 3. สรุปสถานะการทดสอบ (Summary Table)

| รายการทดสอบ | ไฟล์ชุดทดสอบ | จำนวน Test Cases | สถานะปัจจุบัน | หมายเหตุ |
| :--- | :--- | :--- | :--- | :--- |
| **Acceptance Matrix & Traceability** | `docs/qa/ACCEPTANCE.md` | 26 Scenarios | **COMPLETED** | จัดทำ requirement mapping, formula, และ selector needs ครบถ้วน |
| **Playwright Configuration** | `playwright.config.ts` | 3 Projects (360, 390, Desktop) | **READY** | รองรับ multi-context, HTML/JSON reporters, และ webServer hook |
| **Happy Path Flow** | `tests/e2e/happy-path.spec.ts` | 1 (Multi-context full flow) | **READY (Awaiting UI)** | ครอบคลุม Host 1+2 guests, Joiner request/approve, chat, withdraw, end |
| **Capacity Math & Edge Idempotency** | `tests/e2e/capacity-edge.spec.ts` | 3 | **READY (Awaiting UI)** | ตรวจสอบ 3/5, pending ไม่กินที่, double-click idempotency, room full |
| **Lifecycle & Authorization Boundaries** | `tests/e2e/lifecycle-authorization.spec.ts` | 4 | **READY (Awaiting UI)** | ตรวจสอบ past time validation, chat isolation, host tools lockout, signout |
| **Mobile Responsiveness (360 & 390 px)** | `tests/e2e/responsive-mobile.spec.ts` | 2 | **READY (Awaiting UI)** | ตรวจสอบ horizontal overflow และเตรียมบันทึก screenshot อัตโนมัติ |
| **Connected Backend & Server RLS** | `tests/connected/supabase.spec.ts` | 2 | **SKIPPED / PENDING** | ขาด Live Cloud Credentials ตามข้อตกลง ไม่รับรอง RLS บน mock |

---

## 4. รายการ Defect ที่พบและข้อสังเกต (Defects & Observations)

| รหัส Defect | ความรุนแรง | รายละเอียด | ผู้รับผิดชอบ | สถานะ |
| :--- | :--- | :--- | :--- | :--- |
| **OBS-01** | Information | Windows PowerShell บล็อกการรัน `npm.ps1` หากไม่ได้ตั้งค่า execution policy; แนะนำให้รันคำสั่งผ่าน `npm.cmd` และ `npx.cmd` เสมอใน environment นี้ | G4 / ทั้งหมด | บันทึกในเอกสารและคู่มือ |
| **REQ-01** | Important | ส่งคำขอ Stable Selectors (`data-testid`), Demo Reset Hook, และแชร์ state ระหว่างแท็บ ให้ G1 ทาง Desk แล้ว (Desk Message seq 111) | G1 | รอ checkpoint `contract-ready` |

---

## 5. ขั้นตอนสำหรับผู้ใช้ในการตรวจรับผลงาน (User Acceptance Walkthrough Guide)

เมื่อทีมงานประกอบหน้าจอและ service เสร็จสมบูรณ์ ผู้ใช้สามารถทดลองตรวจสอบ flow จริงได้ตามขั้นตอนต่อไปนี้:

1. **เปิด Dev Server:**
   ```powershell
   cd C:\D_Drive\terminter01\garage\project_ideas\basketball\app
   npm.cmd run dev
   ```
2. **เปิดเบราว์เซอร์ 2 หน้าต่าง (Context/Tab แยกกัน):**
   - **แท็บ 1 (Host):**
     - เข้า `http://localhost:5173`
     - เลือกสลับผู้ใช้เป็น "Host"
     - กดสร้างนัด เลือก 5x5, ระบุเพื่อนมาด้วย 2 คน, นโยบาย "ต้องอนุมัติ"
     - สังเกตจำนวนผู้เล่น: ต้องแสดง **3/5** (Host 1 + เพื่อน 2)
   - **แท็บ 2 (Joiner):**
     - เข้า `http://localhost:5173`
     - เลือกสลับผู้ใช้เป็น "Joiner"
     - หน้านัดพบนัดที่ Host เพิ่งสร้าง กดเข้าไปดูรายละเอียด
     - กด "ขอเข้าร่วม" (Request to Join)
   - **กลับมาที่แท็บ 1 (Host):**
     - สังเกตว่าจำนวนผู้เล่นยังคงเป็น **3/5** (คำขอรอยังไม่กินที่)
     - กด "อนุมัติ" ให้ Joiner
     - จำนวนผู้เล่นเปลี่ยนเป็น **4/5** ทันทีทั้งสองแท็บ
   - **ทดสอบแชท:**
     - Host พิมพ์ข้อความในกล่องแชท → Joiner เห็นข้อความทันที
     - Joiner ตอบกลับ → Host เห็นข้อความ
   - **ถอนตัวและจบนัด:**
     - Joiner กด "ถอนตัว" → จำนวนกลับมาเป็น **3/5**
     - Host กด "จบนัด" → สถานะเปลี่ยนเป็นจบการแข่งขัน และไม่สามารถส่งแชทหรือเข้าร่วมได้อีก
