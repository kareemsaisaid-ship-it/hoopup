# HoopUp MVP — Integration Contract & Developer Guide

เอกสารนี้จัดทำโดย **Seat G1 (Platform, Auth, Data Contract & Shell)** สำหรับผู้พัฒนา Seat G2, G3 และ G4 เพื่อเป็นข้อตกลงและจุดเชื่อมโยงทางเทคนิคร่วมกัน

---

## 1. ขอบเขตไฟล์และความเป็นเจ้าของ (File Ownership)

- **G1 (Platform & Shell):**
  - Root configuration: `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `.env.example`
  - Shell & Application entry: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
  - Core app structure: `src/app/**` (Router, Layout, Navigation, AuthGuard, LoginPage, DemoSwitcher)
  - Shared services: `src/services/**` (types, context, mockAdapter, supabaseAdapter, errors)
  - Shared design tokens & UI: `src/shared/**` (tokens, theme, basic reusable components)
  - รายงาน: `mvp_tasks_2026-10-28/reports/G1_REPORT.md` และ `G1_REVIEW.md`
- **G2 (Discovery & Profile):**
  - `src/features/discovery/**` เท่านั้น
  - Export ผ่าน `src/features/discovery/index.ts`: `FeedPage`, `CourtsPage`, `ProfilePage`
- **G3 (Sessions & Chat):**
  - `src/features/sessions/**` เท่านั้น
  - Export ผ่าน `src/features/sessions/index.ts`: `CreateSessionPage`, `SessionDetailPage`, `MySessionsPage`, `EditSessionPage`
- **G4 (QA & Acceptance):**
  - `tests/**`, `playwright.config.ts`, `docs/qa/**`

---

## 2. ระบบ Routing และ Navigation

เราเลือกใช้ **`react-router-dom` (v7)** เป็นตัวจัดการเส้นทางหลัก เพื่อให้สามารถทำงานได้ทั้ง browser history และรองรับ E2E testing:

### 2.1 Route Map

| Path | Component | Source Feature | หมายเหตุ |
|---|---|---|---|
| `/` | `FeedPage` | G2 `discovery` | ค้นหานัดบาส ฟิลเตอร์สนาม/ขนาดทีม/ระดับ |
| `/courts` | `CourtsPage` | G2 `discovery` | รายการสนาม รองรับ `?court={courtId}` |
| `/profile` | `ProfilePage` | G2 `discovery` | ดู/แก้ไขโปรไฟล์ผู้ใช้ |
| `/sessions/new` | `CreateSessionPage` | G3 `sessions` | แบบฟอร์มสร้างนัดบาส |
| `/sessions/:sessionId` | `SessionDetailPage` | G3 `sessions` | รายละเอียดนัด, จัดการสมาชิก, และห้องแชท |
| `/sessions/:sessionId/edit`| `EditSessionPage` | G3 `sessions` | แก้ไขข้อมูลนัด (เฉพาะ Host) |
| `/my-sessions` | `MySessionsPage` | G3 `sessions` | นัดที่ฉันจัด และนัดที่ฉันเข้าร่วม/ขอเข้าร่วม |
| `/login` | `LoginPage` | G1 `app` | หน้าลงชื่อเข้าใช้ (Demo / Connected) |

### 2.2 Navigation Helpers
ผู้พัฒนาสามารถใช้ hooks มาตรฐานจาก `react-router-dom` ได้โดยตรง:
```typescript
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
```
หรือใช้ `useAppNavigation()` จาก `src/app/navigation`:
```typescript
import { useAppNavigation } from '../../app/navigation';
const { goToSession, goToCourts, goToProfile } = useAppNavigation();
```

---

## 3. Data & Auth Services (`useAppServices`)

ทุก Feature ต้องเรียกใช้ Data และ Auth ผ่าน Context กลาง ห้ามสร้าง Mock หรือ LocalStorage Store แยกเองเด็ดขาด:

```typescript
import { useAppServices } from '../../services';

function MyComponent() {
  const { auth, data, isDemo, isConfigured, resetDemoState } = useAppServices();
  const currentUser = auth.getCurrentUser();

  // ตัวอย่างการอ่านข้อมูล
  const handleLoadFeed = async () => {
    const sessions = await data.listSessions({ teamSize: 5 });
  };

  // ตัวอย่างการทำ Mutation
  const handleJoin = async (sessionId: string) => {
    const result = await data.joinSession(sessionId, 'PG');
    if (!result.ok) {
      alert(result.message); // ได้ข้อความไทยที่เป็นมิตร ไม่ใช่ SQL ดิบ
    } else {
      // Refresh session หรือนำทาง
    }
  };
}
```

### 3.1 Service Signatures

#### Auth Service (`auth`)
- `getCurrentUser(): UserProfile | null` — ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบันในแท็บนี้
- `subscribe(cb: (user: UserProfile | null) => void): () => void` — ติดตามการเปลี่ยนแปลงผู้ใช้
- `signIn({ email, password, demoUserId }): Promise<{ ok: boolean; error?: string }>`
- `signOut(): Promise<void>` — ล้างเซสชันผู้ใช้ปัจจุบัน
- `switchDemoUser(userId: UUID): Promise<void>` — สลับผู้ใช้จำลองเฉพาะแท็บปัจจุบัน
- `listDemoUsers(): UserProfile[]` — รายชื่อบัญชีจำลอง (Host, Joiner 1, Joiner 2)
- `isDemoMode: boolean`
- `isConfigured: boolean`

#### Data Service (`data`) — Reads
- `listCourts(): Promise<Court[]>`
- `getProfile(userId?: UUID): Promise<UserProfile | null>`
- `listSessions(filter?: FeedFilter): Promise<SessionSummary[]>`
- `getSession(sessionId: UUID): Promise<SessionSummary | null>`
- `listMySessions(options?: { limit?: number; offset?: number }): Promise<SessionSummary[]>`
- `listMembers(sessionId: UUID): Promise<SessionMember[]>`
- `listMessages(sessionId: UUID, limit?: number): Promise<ChatMessage[]>`

#### Data Service (`data`) — Writes (คำสั่งทั้งหมดคืน `CommandResult`)
- `saveProfile(input: ProfileInput): Promise<CommandResult>`
- `createSession(requestId: UUID, input: SessionInput): Promise<CommandResult>` (ต้องเก็บ `requestId` เดิมเมื่อ retry)
- `updateSession(sessionId: UUID, patch: Partial<SessionInput>): Promise<CommandResult>`
- `joinSession(sessionId: UUID, position?: Position | null): Promise<CommandResult>`
- `decideRequest(sessionId: UUID, userId: UUID, approve: boolean): Promise<CommandResult>`
- `withdraw(sessionId: UUID): Promise<CommandResult>`
- `setRecruitment(sessionId: UUID, open: boolean): Promise<CommandResult>`
- `endSession(sessionId: UUID, lifecycle: 'completed' | 'cancelled'): Promise<CommandResult>`
- `sendMessage(sessionId: UUID, clientMessageId: UUID, body: string): Promise<CommandResult>` (ต้องเก็บ `clientMessageId` เดิมเมื่อ retry)
- `blockUser(userId: UUID): Promise<CommandResult>`
- `unblockUser(userId: UUID): Promise<CommandResult>`
- `report(targetType: 'user' | 'session' | 'message', targetId: UUID, reason: string): Promise<CommandResult>`

### 3.2 กฎความถูกต้องและ Idempotency
1. **Idempotency UUIDs:** เมื่อผู้ใช้กด Submit นัดหรือส่งข้อความ ให้สร้าง UUID เช่น `crypto.randomUUID()` เก็บไว้ที่ state ของฟอร์ม/คอมโพเนนต์ หากเกิดความล้มเหลวทางเครือข่ายและผู้ใช้กด Retry ซ้ำ ให้ส่ง UUID เดิมเสมอ
2. **ไม่ทำ Optimistic Toast:** ห้ามแสดงข้อความ "สำเร็จ" ก่อนที่ Promise ของคำสั่งจะคืนค่ากลับมา
3. **การนับจำนวนคน:**
   - `confirmedCount` รวม host แล้ว
   - `occupiedCount = confirmedCount + guestCount`
   - `seatsRemaining = teamSize - occupiedCount`
   - `pending` **ไม่กินที่นั่ง**
   - ในฟอร์มสร้างนัด ช่องรับเพื่อนให้ระบุ "เพื่อนที่มาด้วย ไม่รวมคุณ" (`guestCount`)

### 3.3 การจับคู่ Contract และการแปลงข้อมูล (Contract Mapping & Normalization)
1. **การตั้งชื่อและรูปร่างของ CommandResult (`message` vs `messageData`):**
   - ใน `backend/frontend-contract.ts` กำหนดให้ `CommandResult` มีฟิลด์ `message?: MessageRow` (object แถวข้อความจากฐานข้อมูล)
   - ในขณะที่ Frontend Application (`src/services/types.ts`) ใช้ `message?: string` สำหรับข้อความแจ้งเตือนภาษาไทยที่แสดงผลแก่ผู้ใช้ และ `messageData?: MessageRow | ChatMessage` สำหรับ payload ข้อมูลข้อความ
   - ใน `supabaseAdapter.ts` มีฟังก์ชัน `mapBackendCommandResult()` คอยแปลงอย่างชัดเจน:
     - หากได้รับ `message` เป็น Object (`MessageRow`) จาก Backend จะแมปลงใน `res.messageData`
     - นำข้อความแปลภาษาไทยตามรหัสผลลัพธ์ (`res.code`) ไปใส่ใน `res.message` (string)
     - ทำให้ Frontend Component และ UI Hooks สามารถอ่านข้อความแจ้งเตือน (`result.message`) และข้อมูลข้อความ (`result.messageData`) ได้ถูกต้องตาม TypeScript types
2. **การแปลงข้อมูลโปรไฟล์ (Profile Shape Normalization):**
   - Backend RPC (`hoopup_save_profile`) คืนข้อมูลแบบ `ProfileRow` (snake_case เช่น `display_name`, `avatar_path`, `skill_level`)
   - Mock Adapter คืนข้อมูลแบบ `UserProfile` (camelCase เช่น `displayName`, `avatarPath`, `skillLevel`)
   - ทั้งสอง Adapter ได้รับการ Normalized ผ่าน `mapProfileRowToUserProfile()` ให้คืนค่าออกมาเป็น `UserProfile` (camelCase) ตามมาตรฐานของแอปเสมอ

---

## 4. โค้ดสีและ Design Tokens

กำหนดไว้ใน `src/shared/tokens.ts`:
- **Primary Color:** `#FF6B00` (Basketball Orange), Hover: `#E05E00`, Light: `#FFF3E0`
- **Secondary / Accent:** `#1E293B` (Slate Navy)
- **Backgrounds:** `#F8FAFC` (App background), `#FFFFFF` (Card/Surface)
- **Borders:** `#E2E8F0`
- **Text:** Primary: `#0F172A`, Secondary: `#64748B`, Inverted: `#FFFFFF`
- **Status Colors:**
  - `open` / `approved`: `#10B981` (Emerald Green)
  - `pending` / `warning`: `#F59E0B` (Amber)
  - `full` / `closed`: `#64748B` (Slate)
  - `cancelled` / `declined`: `#EF4444` (Rose)

---

## 5. คอมโพเนนต์ส่วนกลาง (`src/shared/`)

คอมโพเนนต์ส่วนกลางมีให้พร้อมใช้งานและมี props รองรับ `data-testid`:
- `Button` (`variant`: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost', `size`: 'sm' | 'md' | 'lg')
- `Input`, `Select`, `Textarea`
- `Badge` (`variant`: 'status' | 'skill' | 'position' | 'default')
- `Modal`
- `Card`
- `Toast`
- `EmptyState`
- `LoadingSpinner`

---

## 6. ข้อกำหนด Testability (`data-testid`) สำหรับ G2 และ G3

เพื่อให้ชุดทดสอบ E2E ของ G4 ทำงานผ่าน กรุณาใส่ `data-testid` ให้ตรงกับข้อกำหนด:

### 6.1 G2 (Discovery & Profile)
- `data-testid="feed-search-input"`
- `data-testid="feed-court-filter"`
- `data-testid="feed-teamsize-filter"`
- `data-testid="feed-level-filter"`
- `data-testid="session-card-{sessionId}"`
- `data-testid="session-card-title"`
- `data-testid="session-card-capacity"`
- `data-testid="session-card-status"`
- `data-testid="feed-empty-state"`
- `data-testid="profile-display-name-input"`
- `data-testid="profile-skill-level-select"`
- `data-testid="profile-primary-position"`
- `data-testid="profile-secondary-position"`
- `data-testid="profile-plays-any"`
- `data-testid="profile-height-input"`
- `data-testid="profile-save-btn"`
- `data-testid="profile-save-success"`

### 6.2 G3 (Sessions & Chat)
- `data-testid="session-form-title"`
- `data-testid="session-form-court-select"`
- `data-testid="session-form-timing-now"` / `data-testid="session-form-timing-future"`
- `data-testid="session-form-starts-at"`
- `data-testid="session-form-teamsize-3"` / `data-testid="session-form-teamsize-5"`
- `data-testid="session-form-guest-count"`
- `data-testid="session-form-skill-level"`
- `data-testid="session-form-positions"`
- `data-testid="session-form-policy-instant"` / `data-testid="session-form-policy-approval"`
- `data-testid="session-form-meeting-point"`, `data-testid="session-form-notes"`
- `data-testid="session-form-submit-btn"`
- `data-testid="session-detail-title"`, `data-testid="session-detail-status"`, `data-testid="session-detail-capacity"`
- `data-testid="session-action-join"`, `data-testid="session-action-withdraw"`
- `data-testid="session-manage-toggle-recruitment"`, `data-testid="session-manage-end-session"`
- `data-testid="member-row-{userId}"`, `data-testid="member-status-{userId}"`
- `data-testid="request-approve-{userId}"`, `data-testid="request-decline-{userId}"`
- `data-testid="chat-container"`, `data-testid="chat-message-list"`
- `data-testid="chat-input"`, `data-testid="chat-send-btn"`
- `data-testid="chat-message-item"`
- `data-testid="chat-forbidden-banner"`

---

## 7. คำสั่งการรันและทดสอบระบบ

รันคำสั่งเหล่านี้จากโฟลเดอร์ `C:\D_Drive\terminter01\garage\project_ideas\basketball\app`:
- **รันเซิร์ฟเวอร์พัฒนา:** `npm run dev` (เปิดที่ http://localhost:5173)
- **ตรวจ Type:** `npm run typecheck`
- **Build Production:** `npm run build`
- **รัน Unit Tests:** `npm run test`
- **รัน Playwright E2E:** `npm run e2e`
