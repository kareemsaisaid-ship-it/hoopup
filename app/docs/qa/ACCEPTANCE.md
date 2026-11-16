# HoopUp MVP — Acceptance Criteria & Test Matrix (G4 QA)

**วันที่กำหนด:** 28 ตุลาคม 2569  
**เวอร์ชัน:** v1.0.0-draft  
**ผู้รับผิดชอบ:** Seat G4 (QA & Acceptance)  
**ขอบเขต:** ตรวจสอบและรวบรวมหลักฐานตรวจรับของระบบ HoopUp MVP ครอบคลุม Platform, Discovery/Courts/Profile, Sessions/Membership/Chat ตาม [COMMON_TH.md](../../../mvp_tasks_2026-10-28/COMMON_TH.md) และ [G4_QA.md](../../../mvp_tasks_2026-10-28/G4_QA.md)

---

## 1. ข้อกำหนดสำหรับ G1 (Testability & Infrastructure Needs)

เพื่อให้ชุดทดสอบ E2E (Playwright) และ Acceptance Automation ทำงานได้เสถียรและไม่เปราะบาง ขอให้ G1 จัดเตรียมสิ่งต่อไปนี้ในฐานโค้ดหลัก (`app/`):

### 1.1 Stable Selectors (`data-testid`)
ขอให้ติด `data-testid` ใน element สำคัญดังนี้:
- **Authentication / Shell:**
  - `data-testid="auth-switch-user"`: ปุ่มหรือ select สำหรับสลับ demo identity (Host / Joiner 1 / Joiner 2)
  - `data-testid="auth-current-user"`: แสดงชื่อผู้ใช้ปัจจุบัน
  - `data-testid="auth-signout-btn"`: ปุ่มออกจากระบบ
  - `data-testid="nav-feed"`, `data-testid="nav-courts"`, `data-testid="nav-my-sessions"`, `data-testid="nav-profile"`, `data-testid="nav-create-session"`
- **Feed / Discovery:**
  - `data-testid="feed-search-input"`, `data-testid="feed-court-filter"`, `data-testid="feed-teamsize-filter"`, `data-testid="feed-level-filter"`
  - `data-testid="session-card-{sessionId}"`
  - `data-testid="session-card-title"`, `data-testid="session-card-capacity"`, `data-testid="session-card-status"`
  - `data-testid="feed-empty-state"`
- **Create / Edit Session Form:**
  - `data-testid="session-form-title"`
  - `data-testid="session-form-court-select"`
  - `data-testid="session-form-timing-now"` (ตอนนี้) / `data-testid="session-form-timing-future"` (กำหนดเวลา)
  - `data-testid="session-form-starts-at"` (วัน-เวลา)
  - `data-testid="session-form-teamsize-3"` / `data-testid="session-form-teamsize-5"`
  - `data-testid="session-form-guest-count"` (เพื่อนที่มาด้วย ไม่รวม host)
  - `data-testid="session-form-skill-level"`
  - `data-testid="session-form-positions"`
  - `data-testid="session-form-policy-instant"` / `data-testid="session-form-policy-approval"`
  - `data-testid="session-form-meeting-point"`, `data-testid="session-form-notes"`
  - `data-testid="session-form-submit-btn"`
- **Session Detail & Management:**
  - `data-testid="session-detail-title"`, `data-testid="session-detail-status"`, `data-testid="session-detail-capacity"`
  - `data-testid="session-action-join"`, `data-testid="session-action-withdraw"`
  - `data-testid="session-manage-toggle-recruitment"`, `data-testid="session-manage-end-session"`
  - `data-testid="member-row-{userId}"`, `data-testid="member-status-{userId}"`
  - `data-testid="request-approve-{userId}"`, `data-testid="request-decline-{userId}"`
- **Chat:**
  - `data-testid="chat-container"`, `data-testid="chat-message-list"`
  - `data-testid="chat-input"`, `data-testid="chat-send-btn"`
  - `data-testid="chat-message-item"`
  - `data-testid="chat-forbidden-banner"`
- **Profile:**
  - `data-testid="profile-display-name-input"`
  - `data-testid="profile-skill-level-select"`
  - `data-testid="profile-primary-position"`, `data-testid="profile-secondary-position"`
  - `data-testid="profile-plays-any"`
  - `data-testid="profile-height-input"`
  - `data-testid="profile-save-btn"`
  - `data-testid="profile-save-success"`

### 1.2 Demo State Reset & Shared Memory Isolation
- มีกลไก reset demo state สำหรับการรัน E2E test แต่ละรอบ เช่น `window.__HOOPUP_DEMO_RESET__()` หรือ query parameter `?demo_reset=true` เพื่อให้ test case เริ่มต้นด้วยสถานะที่ predictable
- ให้ mock service แชร์ session storage / state ระหว่าง contexts/tabs ใน browser session เดียวกันเพื่อให้ทดสอบ Host และ Joiner 2 หน้าต่างพร้อมกันได้

### 1.3 Dependencies สำหรับ QA
ขอให้ G1 ติดตั้ง dev dependencies ใน `package.json` ของ `app/`:
- `@playwright/test` (version ล่าสุดที่รองรับ Node ในระบบ)
- Playwright browser binaries (`npx playwright install chromium`)

---

## 2. Requirement to Test Scenario Traceability Matrix

| Requirement Ref | Scenario ID | Scenario Name | Category | Priority | Automated (E2E) | Connected / Manual |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| COMMON #11-14 | **TC-E2E-01** | Full Happy Path (Host 1+2 guests, Joiner request & approve, chat, withdraw, end) | Core Flow | P0 (Critical) | Yes | Optional |
| COMMON #13, Brief | **TC-TIME-01** | ตอนนี้ vs กำหนดเวลาอนาคต (startsAt validation) | Logic | P0 | Yes | No |
| COMMON #13, G4 #20 | **TC-TIME-02** | เวลาในอดีต (Past datetime) ต้องปฏิเสธพร้อม error ชัดเจน | Validation | P1 | Yes | Yes (RLS) |
| COMMON #14, G4 #21 | **TC-CAP-01** | คำนวณความจุ: Host 1 + Guests 2 ใน Team 5 แสดง 3/5 | Capacity | P0 | Yes | Yes |
| COMMON #14, G4 #21 | **TC-CAP-02** | สถานะ Pending ไม่กินที่ว่าง (คงที่ 3/5 จนกว่าจะอนุมัติ) | Capacity | P0 | Yes | Yes |
| COMMON #14, G4 #21 | **TC-CAP-03** | Host อนุมัติคำขอ → จำนวนปรับเป็น 4/5 ทันที | Capacity | P0 | Yes | Yes |
| G4 #22, Contract #118 | **TC-IDEM-01** | ป้องกันกด Join / Request ซ้ำ (Idempotency / Double Click) | Robustness | P1 | Yes | Yes |
| G4 #22, Contract #128 | **TC-IDEM-02** | ป้องกันส่งข้อความแชทซ้ำเมื่อกด retry (`client_message_id`) | Robustness | P1 | Yes | Yes |
| G4 #23, Contract #106 | **TC-CAP-04** | คนสุดท้ายเข้าจนเต็ม (Seats Remaining = 0) → แสดง Full | Capacity | P0 | Yes | Yes |
| G4 #23, Contract #106 | **TC-CAP-05** | ผู้เล่นอื่นพยายามเข้าห้องที่เต็ม → ได้รับข้อความห้องเต็ม | Capacity | P1 | Yes | Yes |
| G4 #23, Contract #124 | **TC-CAP-06** | สมาชิกถอนตัว (Withdraw) → ที่ว่างกลับคืนมา (ถ้ายังเปิดรับ) | Capacity | P0 | Yes | Yes |
| G4 #24, Contract #126 | **TC-LIFE-01** | ปิดรับสมัคร (Recruitment Closed) → ผู้เล่นอื่นกดเข้าไม่ได้ | Lifecycle | P0 | Yes | Yes |
| G4 #24, Contract #55 | **TC-LIFE-02** | ห้องเต็ม (Full) แต่สมาชิกร่วมทีมยังอ่านและส่งแชทได้ | Lifecycle | P1 | Yes | Yes |
| G4 #24, Contract #127 | **TC-LIFE-03** | จบนัด (Ended: completed/cancelled) → ส่งแชทและเข้าร่วมไม่ได้ | Lifecycle | P0 | Yes | Yes |
| G4 #25, Contract #55 | **TC-SEC-01** | ผู้ใช้สถานะ Pending หรือบุคคลภายนอกเปิดอ่านแชทไม่ได้ | Security | P0 | Yes | Yes (RLS) |
| G4 #25, Contract #53 | **TC-SEC-02** | สมาชิกที่ไม่ใช่ Host ไม่เห็นและไม่สามารถกด Host Tools ได้ | Authorization | P0 | Yes | Yes (RLS) |
| G4 #25, G1 #23 | **TC-SEC-03** | Sign-out ล้าง Cache และไม่แสดงข้อมูลของผู้ใช้ก่อนหน้า | Auth / Privacy | P1 | Yes | Yes |
| G4 #26, Contract #82 | **TC-PROF-01** | บันทึกโปรไฟล์ (Profile save) และโหลดกลับมาแสดงตรงกัน | Profile | P0 | Yes | Yes |
| G4 #26, G2 #19 | **TC-DISC-01** | กรองนัด (Filter) เมื่อไม่พบข้อมูล แสดง Empty State เหมาะสม | Discovery | P1 | Yes | Yes |
| G4 #26, G2 #19 | **TC-NET-01** | Network Error จำลอง → มีปุ่ม Retry และคืนสถานะถูกต้อง | Resilience | P1 | Yes | Yes |
| G4 #26, Contract #106 | **TC-NET-02** | Session Not Found (ID ผิดหรือไม่มีอยู่จริง) → แสดง 404 สวยงาม | Error UX | P2 | Yes | Yes |
| G4 #27, Contract #129 | **TC-MOD-01** | Block User มี Feedback ตอบกลับ และไม่เตะสมาชิกเก่าออก | Moderation | P2 | Yes | Yes |
| G4 #27, Contract #131 | **TC-MOD-02** | Report ส่งข้อมูลเหตุผลสำเร็จพร้อมแจ้งเตือน | Moderation | P2 | Yes | Yes |
| G4 #28, G1 #21 | **TC-SYNC-01** | Refresh / Reload ข้ามหน้า (Feed, Detail, MySessions) ผลตรงกัน | Consistency | P0 | Yes | Yes |
| G4 #13, G2 #22 | **TC-RESP-01** | ตรวจสอบ UI Viewport 360x800 px (Small Android) ไม่ล้นจอ | Layout / UI | P0 | Yes (Visual) | Manual |
| G4 #13, G2 #22 | **TC-RESP-02** | ตรวจสอบ UI Viewport 390x844 px (iPhone 12/13/14) ไม่ล้นจอ | Layout / UI | P0 | Yes (Visual) | Manual |

---

## 3. รายละเอียด Scenarios ขั้นต่ำและเกณฑ์ตรวจรับ (Detailed Scenarios)

### 3.1 TC-E2E-01: Full Happy Path Flow
- **Preconditions:** เปิดเบราว์เซอร์ 2 Contexts แยกกัน (Context A = Host "Kareem", Context B = Joiner "Player Two")
- **Step 1:** Host เข้าหน้าระบบ เลือกระบบ 5x5, สนาม "สวนลุมพินี", เวลา "ตอนนี้", เพื่อนที่มาด้วย = 2 คน, นโยบาย "ต้องอนุมัติ" (Approval) กดสร้างนัด
- **Step 2:** ระบบนำทางไปยัง `SessionDetailPage` แสดงสถานะ Occupied = 3/5 (Host 1 + เพื่อน 2), สถานะ Open
- **Step 3:** Joiner เปิดหน้าแรก (`FeedPage`) พบนัดที่ Host สร้าง กดเข้าดูรายละเอียด
- **Step 4:** Joiner กด "ขอเข้าร่วม" (Request to Join)
- **Step 5:** หน้าจอ Joiner แสดงสถานะ "รออนุมัติ" (Pending), หน้าจอ Host ขึ้นรายการคำขอของ Joiner
- **Step 6:** Host กด "อนุมัติ" (Approve)
- **Step 7:** ทั้งสองหน้าจออัปเดตจำนวนผู้เล่นเป็น 4/5 (Host 1, เพื่อน 2, Joiner 1)
- **Step 8:** Joiner ได้รับสิทธิ์เข้าถึงห้องแชท ทั้ง Host และ Joiner พิมพ์ข้อความทักทายและเห็นข้อความของอีกฝ่าย
- **Step 9:** Joiner กด "ถอนตัว" (Withdraw)
- **Step 10:** จำนวนผู้เล่นลดลงเหลือ 3/5, Joiner ถูกตัดสิทธิ์การส่งแชท
- **Step 11:** Host กด "จบนัด" (End Session) → สถานะนัดเปลี่ยนเป็น Completed และปิดรับสมัครถาวร
- **Acceptance Criteria:** ทุกขั้นตอนไม่มี JavaScript error ใน console, ตัวเลขสมาชิกคำนวณถูกต้องตามสูตร, สิทธิ์เปลี่ยนทันที

---

### 3.2 TC-CAP-01 to 03: Guest & Pending Capacity Math
- **Formula:**  
  `confirmedCount` = จำนวนสมาชิกที่สถานะ confirmed (รวม Host เสมอ = 1+)  
  `guestCount` = เพื่อนที่มาด้วยของ Host (ไม่รวม Host)  
  `occupiedCount` = `confirmedCount + guestCount`  
  `seatsRemaining` = `teamSize - occupiedCount`  
- **Test Matrix:**
  | Action | Team Size | Confirmed | Guests | Pending | Display Occupied | Seats Remaining | Display Status |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | Host สร้างนัดพร้อมเพื่อน 2 คน | 5 | 1 (Host) | 2 | 0 | **3/5** | 2 | Open |
  | ผู้เล่นอื่นกดขอเข้า (ยังไม่อนุมัติ) | 5 | 1 | 2 | 1 | **3/5** (ไม่เปลี่ยน) | 2 | Open |
  | Host กดอนุมัติคำขอ | 5 | 2 | 2 | 0 | **4/5** | 1 | Open |
  | สมาชิกอนุมัติเพิ่มอีก 1 คน | 5 | 3 | 2 | 0 | **5/5** | 0 | **Full** |

---

### 3.3 TC-TIME-01 & 02: Datetime Validation
- **Case "ตอนนี้":**
  - Input: เลือก Toggle "ตอนนี้" (Now)
  - Data payload ส่งไปยัง service: `startsAt: null` หรือระบุ clock ปัจจุบันตาม service contract
  - Result: ไม่ขึ้น error วันเวลาย้อนหลัง, นัดถูกสร้างทันที
- **Case "กำหนดเวลาในอดีต":**
  - Input: เลือกวันเวลาย้อนหลัง เช่น เมื่อวานนี้
  - Result: Validation ปฏิเสธการส่งฟอร์ม แสดงข้อความภาษาไทย "ไม่สามารถเลือกเวลาในอดีตได้" และไม่ส่ง request ไปสร้างนัดผิดพลาด

---

### 3.4 TC-IDEM-01 & 02: Idempotency & Duplicate Prevention
- **Double Click Join / Create:**
  - สคริปต์ส่งคำขอ Join ซ้ำ 2 ครั้งติดกัน (Double click จำลอง)
  - Result: คำขอที่สองต้องถูกระงับด้วยสถานะ disabled หรือ Backend/Mock ตรวจจับ request ID เดิม ไม่สร้าง record สมาชิกเบิ้ล
- **Chat Retry Dedup:**
  - จำลองการกดส่งข้อความเดิมซ้ำด้วย `client_message_id` เดิม
  - Result: ข้อความปรากฏในแชทเพียงกล่องเดียว ไม่เกิดข้อความคู่แฝด

---

### 3.5 TC-SEC-01 & 02: Authorization & Boundary Checks
- **Chat Isolation:**
  - ผู้ใช้ A (Pending หรือคนนอกห้อง) พยายามเข้า URL `/sessions/:sessionId`
  - ตรวจสอบว่าไม่มี input สำหรับส่งแชท และไม่มีข้อความสนทนาหลุดออกมาให้เห็น
- **Host Tools Protection:**
  - ผู้ใช้ทั่วไป (Non-Host) เข้าหน้า Session Detail
  - ปุ่ม "ปิดรับสมัคร", "จบนัด", "อนุมัติ/ปฏิเสธคำขอ" ต้องไม่ปรากฏ หรือถูก disabled โดยสมบูรณ์

---

### 3.6 TC-RESP-01 & 02: Responsive Mobile Layout
- **Viewport 360 x 800 (Compact Android) & 390 x 844 (Standard iPhone):**
  - รัน E2E พร้อมบันทึก Full-page Screenshot ในแต่ละหน้าหลัก:
    1. `FeedPage`
    2. `CreateSessionPage`
    3. `SessionDetailPage` (พร้อมเปิดแชท)
    4. `ProfilePage`
  - ตรวจสอบ:
    - แนวนอนไม่มี Horizontal Scrollbar (`document.documentElement.scrollWidth <= window.innerWidth`)
    - ปุ่ม Call to Action (สร้างนัด, ส่งข้อความ, เข้าร่วม) ไม่ถูกแถบ Navigation ด้านล่างบัง
    - ตัวอักษรภาษาไทย สระบน/ล่าง (เช่น ที่, อื่น, ปิ, นัด) ไม่ลอยหรือโดนตัดบรรทัดผิดธรรมชาติ

---

## 4. สถานะและแผนการรวบรวมหลักฐาน (Evidence Strategy)

1. **Local Demo E2E (Mock Adapter):**
   - รัน Playwright Headless และเก็บบันทึก Console logs, Test report HTML, และ Screenshots
   - บันทึกผลไว้ใน `app/docs/qa/RESULTS.md`
2. **Connected Tests (Supabase Backend):**
   - แยกชุดทดสอบใน `app/tests/connected/`
   - *สถานะปัจจุบัน:* ทำเครื่องหมาย `PENDING / SKIPPED` เนื่องจากยังไม่มี Development Cloud Instance และ Credentials ที่ได้รับอนุญาตตามข้อตกลง COMMON
   - ห้ามเคลมว่าผ่าน Connected หรือ RLS จากการรัน Demo Mock
3. **Peer Review & User Acceptance:**
   - ส่งผลการทดสอบและรายงาน `G4_REPORT.md` ผ่าน Desk
   - ขอให้ Seat G1 / G3 ร่วมตรวจสอบ Code/Files
   - รอการตัดสินใจตรวจรับขั้นสุดท้ายจาก **ผู้ใช้ (User)** เท่านั้น
