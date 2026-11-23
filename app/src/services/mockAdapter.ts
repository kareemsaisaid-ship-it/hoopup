import type {
  AuthService,
  ChatMessage,
  CommandResult,
  Court,
  DataService,
  FeedFilter,
  ISODateTime,
  Position,
  ProfileInput,
  SessionInput,
  SessionMember,
  SessionSummary,
  UserProfile,
  UUID,
} from './types';
import { loadOsmCourts } from './osmCourts';

const STORAGE_KEY_SESSIONS = 'hoopup_mock_sessions_v1';
const STORAGE_KEY_MEMBERS = 'hoopup_mock_members_v1';
const STORAGE_KEY_MESSAGES = 'hoopup_mock_messages_v1';
const STORAGE_KEY_PROFILES = 'hoopup_mock_profiles_v1';
const STORAGE_KEY_BLOCKS = 'hoopup_mock_blocks_v1';
const STORAGE_KEY_REPORTS = 'hoopup_mock_reports_v1';
const SESSION_STORAGE_KEY_CURRENT_USER = 'hoopup_current_user_tab_v1';
const SESSION_STORAGE_KEY_SIGNED_OUT = 'hoopup_signed_out_tab_v1';
const SYNC_CHANNEL_NAME = 'hoopup_data_sync_channel';

// Preset Demo Users
export const DEMO_USERS: UserProfile[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'ก้อง (Host Demo)',
    avatarPath: null,
    skillLevel: 'regular',
    primaryPosition: 'PG',
    secondaryPosition: 'SG',
    playsAnyPosition: false,
    heightCm: 178,
    heightVisible: true,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'บอย (Joiner 1 Demo)',
    avatarPath: null,
    skillLevel: 'casual',
    primaryPosition: 'SF',
    secondaryPosition: 'PF',
    playsAnyPosition: true,
    heightCm: 183,
    heightVisible: false,
    createdAt: '2026-10-02T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    displayName: 'ต้าร์ (Joiner 2 Demo)',
    avatarPath: null,
    skillLevel: 'competitive',
    primaryPosition: 'C',
    secondaryPosition: null,
    playsAnyPosition: false,
    heightCm: 191,
    heightVisible: true,
    createdAt: '2026-10-03T10:00:00.000Z',
    updatedAt: '2026-10-03T10:00:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    displayName: 'เอก (Outsider Demo)',
    avatarPath: null,
    skillLevel: 'casual',
    primaryPosition: 'PG',
    secondaryPosition: null,
    playsAnyPosition: true,
    heightCm: 175,
    heightVisible: false,
    createdAt: '2026-10-04T10:00:00.000Z',
    updatedAt: '2026-10-04T10:00:00.000Z',
  },
];


export const BASE_DEMO_COURTS: Court[] = [
  {
    id: 'c1111111-1111-4111-8111-111111111111',
    name: 'สวนเบญจกิติ (Benjakitti Park)',
    address: 'ถ.รัชดาภิเษก แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร',
    latitude: 13.7314,
    longitude: 100.5583,
    surfaceType: 'Polyurethane Outdoor',
    isIndoor: false,
    hasLighting: true,
    hoopCount: 4,
    openingHoursNote: 'เปิดทุกวัน 05:00 - 21:00 น.',
    photoPath: null,
    verifiedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'c2222222-2222-4222-8222-222222222222',
    name: 'สวนลุมพินี (Lumpini Park Court)',
    address: 'ถ.พระรามที่ 4 แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร',
    latitude: 13.7317,
    longitude: 100.5414,
    surfaceType: 'Asphalt Outdoor',
    isIndoor: false,
    hasLighting: true,
    hoopCount: 2,
    openingHoursNote: 'เปิดทุกวัน 05:00 - 20:30 น.',
    photoPath: null,
    verifiedAt: '2026-09-10T00:00:00.000Z',
  },
  {
    id: 'c3333333-3333-4333-8333-333333333333',
    name: 'สนามบาสเกตบอล กกท. หัวหมาก',
    address: 'ถ.รามคำแหง แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร',
    latitude: 13.7558,
    longitude: 100.6225,
    surfaceType: 'Indoor Parquet',
    isIndoor: true,
    hasLighting: true,
    hoopCount: 6,
    openingHoursNote: 'เปิด 08:00 - 21:00 น.',
    photoPath: null,
    verifiedAt: '2026-09-15T00:00:00.000Z',
  },
];

export const OSM_DEMO_COURTS: Court[] = loadOsmCourts();

export const DEMO_COURTS: Court[] = [...BASE_DEMO_COURTS, ...OSM_DEMO_COURTS];

interface StoredSession {
  id: UUID;
  hostId: UUID;
  clientRequestId: UUID;
  courtId: UUID;
  title: string;
  startsAt: ISODateTime;
  teamSize: 3 | 5;
  guestCount: number;
  skillLevel: 'casual' | 'regular' | 'competitive';
  welcomesBeginners: boolean;
  wantedPositions: Position[];
  joinPolicy: 'instant' | 'approval';
  lifecycle: 'active' | 'completed' | 'cancelled';
  recruitmentOpen: boolean;
  meetingPoint: string;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  endedAt: ISODateTime | null;
}

interface StoredMember {
  sessionId: UUID;
  userId: UUID;
  status: 'pending' | 'confirmed' | 'declined' | 'withdrawn';
  position: Position | null;
  requestedAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  decidedBy: UUID | null;
  updatedAt: ISODateTime;
}

interface StoredMessage {
  id: UUID;
  sessionId: UUID;
  senderId: UUID;
  clientMessageId: UUID;
  body: string;
  createdAt: ISODateTime;
}

// Initial seed generation
function getInitialSeedSessions(): StoredSession[] {
  const now = new Date();
  const future1 = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const future2 = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: 's1111111-1111-4111-8111-111111111111',
      hostId: DEMO_USERS[0].id,
      clientRequestId: 'req-init-1',
      courtId: DEMO_COURTS[0].id,
      title: 'บาสเย็นเบญจกิติ 3x3 ขาด 1 คน ชิวๆ เน้นออกกำลัง',
      startsAt: future1,
      teamSize: 3,
      guestCount: 1, // Host brings 1 friend (not in app)
      skillLevel: 'casual',
      welcomesBeginners: true,
      wantedPositions: ['PG', 'SG'],
      joinPolicy: 'instant',
      lifecycle: 'active',
      recruitmentOpen: true,
      meetingPoint: 'ม้านั่งฝั่งทิศเหนือติดทะเลสาบ',
      notes: 'มาเล่นกันได้เลยครับ ใครว่างแวะมาได้เลย',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      endedAt: null,
    },
    {
      id: 's2222222-2222-4222-8222-222222222222',
      hostId: DEMO_USERS[0].id,
      clientRequestId: 'req-init-2',
      courtId: DEMO_COURTS[1].id,
      title: '5x5 เต็มสนาม สวนลุม รับสมัครตำแหน่ง C/PF สายแข่ง',
      startsAt: future2,
      teamSize: 5,
      guestCount: 0,
      skillLevel: 'competitive',
      welcomesBeginners: false,
      wantedPositions: ['PF', 'C'],
      joinPolicy: 'approval',
      lifecycle: 'active',
      recruitmentOpen: true,
      meetingPoint: 'หน้าป้ายสนามบาส สวนลุม',
      notes: 'ขอคนที่เล่นระบบทีมได้นะครับ มีลูกบาสให้',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      endedAt: null,
    },
  ];
}

function getInitialSeedMembers(): StoredMember[] {
  const now = new Date().toISOString();
  return [
    {
      sessionId: 's1111111-1111-4111-8111-111111111111',
      userId: DEMO_USERS[0].id,
      status: 'confirmed',
      position: 'PG',
      requestedAt: now,
      confirmedAt: now,
      decidedBy: null,
      updatedAt: now,
    },
    {
      sessionId: 's2222222-2222-4222-8222-222222222222',
      userId: DEMO_USERS[0].id,
      status: 'confirmed',
      position: 'PG',
      requestedAt: now,
      confirmedAt: now,
      decidedBy: null,
      updatedAt: now,
    },
  ];
}

function getInitialSeedMessages(): StoredMessage[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'm1111111-1111-4111-8111-111111111111',
      sessionId: 's1111111-1111-4111-8111-111111111111',
      senderId: DEMO_USERS[0].id,
      clientMessageId: 'msg-init-1',
      body: 'ยินดีต้อนรับทุกคนครับ ใครมาถึงแล้วทักแชตนี้ได้เลย',
      createdAt: now,
    },
  ];
}

export class MockStorage {
  private syncChannel: BroadcastChannel | null = null;
  private listeners: Set<() => void> = new Set();

  private memSessions: StoredSession[] = getInitialSeedSessions();
  private memMembers: StoredMember[] = getInitialSeedMembers();
  private memMessages: StoredMessage[] = getInitialSeedMessages();
  private memProfiles: UserProfile[] = [...DEMO_USERS];
  private memBlocks: { blockerId: UUID; blockedId: UUID }[] = [];
  private memReports: { id: UUID; reporterId: UUID; targetType: string; targetId: UUID; reason: string }[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        this.syncChannel.onmessage = () => {
          this.notifyListeners();
        };
      } catch {
        // Fallback for environments where BroadcastChannel is blocked
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('hoopup_mock_')) {
          this.notifyListeners();
        }
      });

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('demo_reset') === 'true') {
        this.resetAll();
      } else {
        this.syncFromServer();
      }
    }

    this.ensureInitialized();
  }

  private syncFromServer() {
    if (typeof window === 'undefined') return;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/__mock_storage', false);
      xhr.send();
      if (xhr.status === 200) {
        const remote = JSON.parse(xhr.responseText);
        if (remote && remote.sessions && Array.isArray(remote.sessions) && remote.sessions.length > 0) {
          this.memSessions = remote.sessions;
          if (remote.members) this.memMembers = remote.members;
          if (remote.messages) this.memMessages = remote.messages;
          if (remote.profiles) this.memProfiles = remote.profiles;
          if (remote.blocks) this.memBlocks = remote.blocks;
          if (remote.reports) this.memReports = remote.reports;
          if (window.localStorage) {
            try {
              localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(this.memSessions));
              localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(this.memMembers));
              localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(this.memMessages));
              localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(this.memProfiles));
              localStorage.setItem(STORAGE_KEY_BLOCKS, JSON.stringify(this.memBlocks));
              localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(this.memReports));
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private syncToServer(patch: Record<string, any>) {
    if (typeof window === 'undefined') return;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/__mock_storage', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(patch));
    } catch {
      // ignore
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => fn());
  }

  private broadcastChange() {
    if (this.syncChannel) {
      try {
        this.syncChannel.postMessage({ type: 'sync', time: Date.now() });
      } catch {
        // ignore
      }
    }
    this.notifyListeners();
  }

  public resetAll() {
    this.memSessions = getInitialSeedSessions();
    this.memMembers = getInitialSeedMembers();
    this.memMessages = getInitialSeedMessages();
    this.memProfiles = [...DEMO_USERS];
    this.memBlocks = [];
    this.memReports = [];

    if (typeof window !== 'undefined') {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('DELETE', '/__mock_storage', false);
        xhr.send();
      } catch {
        // ignore
      }
      this.syncToServer({
        sessions: this.memSessions,
        members: this.memMembers,
        messages: this.memMessages,
        profiles: this.memProfiles,
        blocks: this.memBlocks,
        reports: this.memReports,
      });
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(this.memSessions));
        localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(this.memMembers));
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(this.memMessages));
        localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(this.memProfiles));
        localStorage.setItem(STORAGE_KEY_BLOCKS, JSON.stringify(this.memBlocks));
        localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(this.memReports));
      } catch {
        // ignore
      }
    }
    this.broadcastChange();
  }

  private ensureInitialized() {
    if (typeof window !== 'undefined') {
      if (this.memSessions && this.memSessions.length > 0) {
        return;
      }
      if (window.localStorage && !localStorage.getItem(STORAGE_KEY_SESSIONS)) {
        this.resetAll();
      }
    }
  }

  public getSessions(): StoredSession[] {
    this.syncFromServer();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
        if (raw) return JSON.parse(raw);
      } catch {
        // fallback
      }
    }
    return this.memSessions;
  }

  public saveSessions(sessions: StoredSession[]) {
    this.memSessions = sessions;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
      } catch {
        // fallback
      }
    }
    this.syncToServer({ sessions });
    this.broadcastChange();
  }

  public getMembers(): StoredMember[] {
    this.syncFromServer();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_MEMBERS);
        if (raw) return JSON.parse(raw);
      } catch {
        // fallback
      }
    }
    return this.memMembers;
  }

  public saveMembers(members: StoredMember[]) {
    this.memMembers = members;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(members));
      } catch {
        // fallback
      }
    }
    this.syncToServer({ members });
    this.broadcastChange();
  }

  public getMessages(): StoredMessage[] {
    this.syncFromServer();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_MESSAGES);
        if (raw) return JSON.parse(raw);
      } catch {
        // fallback
      }
    }
    return this.memMessages;
  }

  public saveMessages(messages: StoredMessage[]) {
    this.memMessages = messages;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
      } catch {
        // fallback
      }
    }
    this.syncToServer({ messages });
    this.broadcastChange();
  }

  public getProfiles(): UserProfile[] {
    this.syncFromServer();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
        if (raw) return JSON.parse(raw);
      } catch {
        // fallback
      }
    }
    return this.memProfiles;
  }

  public saveProfiles(profiles: UserProfile[]) {
    this.memProfiles = profiles;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
      } catch {
        // fallback
      }
    }
    this.syncToServer({ profiles });
    this.broadcastChange();
  }

  public getBlocks(): { blockerId: UUID; blockedId: UUID }[] {
    this.syncFromServer();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_BLOCKS);
        if (raw) return JSON.parse(raw);
      } catch {
        // fallback
      }
    }
    return this.memBlocks;
  }

  public saveBlocks(blocks: { blockerId: UUID; blockedId: UUID }[]) {
    this.memBlocks = blocks;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY_BLOCKS, JSON.stringify(blocks));
      } catch {
        // fallback
      }
    }
    this.syncToServer({ blocks });
    this.broadcastChange();
  }

  public getReports(): { id: UUID; reporterId: UUID; targetType: string; targetId: UUID; reason: string }[] {
    this.syncFromServer();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_REPORTS);
        if (raw) return JSON.parse(raw);
      } catch {
        // fallback
      }
    }
    return this.memReports;
  }

  public saveReports(reports: { id: UUID; reporterId: UUID; targetType: string; targetId: UUID; reason: string }[]) {
    this.memReports = reports;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(reports));
      } catch {
        // fallback
      }
    }
    this.syncToServer({ reports });
    this.broadcastChange();
  }
}

export class MockAuthService implements AuthService {
  private currentUser: UserProfile | null = null;
  private subscribers: Set<(user: UserProfile | null) => void> = new Set();
  public isDemoMode = true;
  public isConfigured = false;
  private storage: MockStorage;

  constructor(storage: MockStorage) {
    this.storage = storage;

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('demo_reset') === 'true') {
        try {
          sessionStorage.removeItem(SESSION_STORAGE_KEY_SIGNED_OUT);
        } catch {
          // ignore
        }
      }
    }

    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const isSignedOut = sessionStorage.getItem(SESSION_STORAGE_KEY_SIGNED_OUT) === 'true';
        if (isSignedOut) {
          this.currentUser = null;
        } else {
          const savedUserId = sessionStorage.getItem(SESSION_STORAGE_KEY_CURRENT_USER);
          const profiles = this.storage.getProfiles();
          const user = profiles.find((p) => p.id === savedUserId) || profiles[0] || DEMO_USERS[0];
          this.currentUser = user;
          sessionStorage.setItem(SESSION_STORAGE_KEY_CURRENT_USER, user.id);
        }
      } catch {
        this.currentUser = DEMO_USERS[0];
      }
    } else {
      const profiles = this.storage.getProfiles();
      this.currentUser = profiles[0] || DEMO_USERS[0];
    }

    this.storage.subscribe(() => {
      if (this.currentUser) {
        const freshProfiles = this.storage.getProfiles();
        const updated = freshProfiles.find((p) => p.id === this.currentUser?.id);
        if (updated) {
          this.currentUser = updated;
          this.notifySubscribers();
        }
      }
    });
  }

  public getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  public subscribe(callback: (user: UserProfile | null) => void): () => void {
    this.subscribers.add(callback);
    callback(this.currentUser);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers() {
    this.subscribers.forEach((fn) => fn(this.currentUser));
  }

  public async signIn(params: { email?: string; password?: string; demoUserId?: UUID }): Promise<{ ok: boolean; error?: string }> {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY_SIGNED_OUT);
      } catch {
        // ignore
      }
    }

    const profiles = this.storage.getProfiles();
    if (params.demoUserId) {
      const user = profiles.find((p) => p.id === params.demoUserId);
      if (user) {
        this.currentUser = user;
        if (typeof window !== 'undefined' && window.sessionStorage) {
          try {
            sessionStorage.setItem(SESSION_STORAGE_KEY_CURRENT_USER, user.id);
          } catch {
            // ignore
          }
        }
        this.notifySubscribers();
        return { ok: true };
      }
    }

    // Default demo sign-in
    this.currentUser = profiles[0] || DEMO_USERS[0];
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY_CURRENT_USER, this.currentUser.id);
      } catch {
        // ignore
      }
    }
    this.notifySubscribers();
    return { ok: true };
  }

  public async exchangeOidcCode(code: string): Promise<{ ok: boolean; error?: string; errorCode?: string }> {
    if (!code || code === 'invalid') {
      return {
        ok: false,
        error: 'รหัสยืนยันตัวตนไม่ถูกต้องหรือหมดอายุแล้ว กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง',
        errorCode: 'invalid_code',
      };
    }
    await this.signIn({ demoUserId: DEMO_USERS[0].id });
    return { ok: true };
  }

  public async signOut(): Promise<void> {
    this.currentUser = null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY_CURRENT_USER);
        sessionStorage.setItem(SESSION_STORAGE_KEY_SIGNED_OUT, 'true');
      } catch {
        // ignore
      }
    }
    this.notifySubscribers();
  }

  public async switchDemoUser(userId: UUID): Promise<void> {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY_SIGNED_OUT);
      } catch {
        // ignore
      }
    }

    const profiles = this.storage.getProfiles();
    const user = profiles.find((p) => p.id === userId);
    if (user) {
      this.currentUser = user;
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY_CURRENT_USER, user.id);
        } catch {
          // ignore
        }
      }
      this.notifySubscribers();
    }
  }

  public listDemoUsers(): UserProfile[] {
    return this.storage.getProfiles();
  }
}


export class MockDataService implements DataService {
  private storage: MockStorage;
  private auth: AuthService;

  constructor(storage: MockStorage, auth: AuthService) {
    this.storage = storage;
    this.auth = auth;
  }

  private calculateSessionSummary(session: StoredSession, currentUserId?: UUID): SessionSummary {
    const court = DEMO_COURTS.find((c) => c.id === session.courtId) || {
      id: session.courtId,
      name: 'สนามไม่ระบุชื่อ',
      latitude: null,
      longitude: null,
    };

    const profiles = this.storage.getProfiles();
    const hostProfile = profiles.find((p) => p.id === session.hostId);
    const hostName = hostProfile ? hostProfile.displayName : 'ผู้จัดนัด';

    const allMembers = this.storage.getMembers().filter((m) => m.sessionId === session.id);
    const confirmedCount = allMembers.filter((m) => m.status === 'confirmed').length;
    const occupiedCount = confirmedCount + session.guestCount;
    const seatsRemaining = Math.max(0, session.teamSize - occupiedCount);

    const myMember = currentUserId ? allMembers.find((m) => m.userId === currentUserId) : null;
    const myMembershipStatus = myMember ? myMember.status : null;

    // Display Status determination
    let displayStatus: 'open' | 'full' | 'closed' | 'completed' | 'cancelled' = 'open';
    if (session.lifecycle === 'completed') displayStatus = 'completed';
    else if (session.lifecycle === 'cancelled') displayStatus = 'cancelled';
    else if (!session.recruitmentOpen) displayStatus = 'closed';
    else if (seatsRemaining <= 0) displayStatus = 'full';
    else displayStatus = 'open';

    const isHost = currentUserId === session.hostId;
    const isConfirmedMember = myMembershipStatus === 'confirmed';
    const isPendingMember = myMembershipStatus === 'pending';

    const canManage = isHost && session.lifecycle === 'active';
    const canJoin =
      !isHost &&
      !isConfirmedMember &&
      !isPendingMember &&
      session.lifecycle === 'active' &&
      session.recruitmentOpen &&
      seatsRemaining > 0;
    const canReadChat = isHost || isConfirmedMember;
    const canSendMessage = (isHost || isConfirmedMember) && session.lifecycle === 'active';
    const canWithdraw = !isHost && (isConfirmedMember || isPendingMember) && session.lifecycle === 'active';

    return {
      id: session.id,
      title: session.title,
      hostId: session.hostId,
      hostName,
      court: {
        id: court.id,
        name: court.name,
        latitude: court.latitude,
        longitude: court.longitude,
      },
      startsAt: session.startsAt,
      teamSize: session.teamSize,
      confirmedCount,
      guestCount: session.guestCount,
      occupiedCount,
      seatsRemaining,
      skillLevel: session.skillLevel,
      welcomesBeginners: session.welcomesBeginners,
      wantedPositions: session.wantedPositions,
      joinPolicy: session.joinPolicy,
      lifecycle: session.lifecycle,
      recruitmentOpen: session.recruitmentOpen,
      displayStatus,
      myMembershipStatus,
      meetingPoint: session.meetingPoint,
      notes: session.notes,
      updatedAt: session.updatedAt,
      endedAt: session.endedAt,
      actions: {
        canManage,
        canJoin,
        canReadChat,
        canSendMessage,
        canWithdraw,
      },
    };
  }

  public async listCourts(): Promise<Court[]> {
    return DEMO_COURTS;
  }

  public async getProfile(userId?: UUID): Promise<UserProfile | null> {
    const currentUserId = this.auth.getCurrentUser()?.id;
    const targetId = userId || currentUserId;
    if (!targetId) return null;
    const profiles = this.storage.getProfiles();
    const found = profiles.find((p) => p.id === targetId);
    if (!found) return null;

    // The owner always sees their own height and heightVisible setting.
    // If viewing another user's profile, heightCm is null if their heightVisible is false,
    // and heightVisible is reported as false for other users per contract.
    const isOwner = Boolean(currentUserId && targetId === currentUserId);
    if (!isOwner) {
      return {
        ...found,
        heightCm: found.heightVisible ? found.heightCm : null,
        heightVisible: false,
      };
    }

    return found;
  }

  public async listSessions(filter?: FeedFilter): Promise<SessionSummary[]> {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (
        (window as unknown as { __HOOPUP_SIMULATE_FEED_ERROR__?: boolean }).__HOOPUP_SIMULATE_FEED_ERROR__ ||
        searchParams.get('simulate_error') === 'feed'
      ) {
        throw new Error('Simulated feed service error');
      }
      if (
        (window as unknown as { __HOOPUP_SIMULATE_FEED_LOADING__?: boolean }).__HOOPUP_SIMULATE_FEED_LOADING__ ||
        searchParams.get('simulate_loading') === 'feed'
      ) {
        return new Promise(() => {});
      }
    }

    const currentUserId = this.auth.getCurrentUser()?.id;
    let sessions = this.storage.getSessions();

    // Default feed shows active sessions
    sessions = sessions.filter((s) => s.lifecycle === 'active');

    if (filter) {
      if (filter.courtId) {
        sessions = sessions.filter((s) => s.courtId === filter.courtId);
      }
      if (filter.teamSize) {
        sessions = sessions.filter((s) => s.teamSize === filter.teamSize);
      }
      if (filter.skillLevel) {
        sessions = sessions.filter((s) => s.skillLevel === filter.skillLevel);
      }
      if (filter.from) {
        sessions = sessions.filter((s) => s.startsAt >= filter.from!);
      }
      if (filter.to) {
        sessions = sessions.filter((s) => s.startsAt < filter.to!);
      }
    }

    // Sort by startsAt ascending
    sessions.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    if (filter?.offset) {
      sessions = sessions.slice(filter.offset);
    }
    if (filter?.limit) {
      sessions = sessions.slice(0, filter.limit);
    }

    return sessions.map((s) => this.calculateSessionSummary(s, currentUserId));
  }

  public async getSession(sessionId: UUID): Promise<SessionSummary | null> {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (
        (window as unknown as { __HOOPUP_SIMULATE_SESSION_ERROR__?: boolean }).__HOOPUP_SIMULATE_SESSION_ERROR__ ||
        searchParams.get('simulate_error') === 'session'
      ) {
        throw new Error('Simulated session detail service error');
      }
      if (
        (window as unknown as { __HOOPUP_SIMULATE_SESSION_LOADING__?: boolean }).__HOOPUP_SIMULATE_SESSION_LOADING__ ||
        searchParams.get('simulate_loading') === 'session'
      ) {
        return new Promise(() => {});
      }
    }

    const currentUserId = this.auth.getCurrentUser()?.id;
    const session = this.storage.getSessions().find((s) => s.id === sessionId);
    if (!session) return null;
    return this.calculateSessionSummary(session, currentUserId);
  }

  public async listMySessions(options?: { limit?: number; offset?: number }): Promise<SessionSummary[]> {
    const currentUserId = this.auth.getCurrentUser()?.id;
    if (!currentUserId) return [];

    const allMembers = this.storage.getMembers();
    const mySessionIds = new Set(
      allMembers.filter((m) => m.userId === currentUserId && m.status !== 'withdrawn' && m.status !== 'declined').map((m) => m.sessionId)
    );

    // Also include hosted sessions
    const sessions = this.storage.getSessions().filter((s) => s.hostId === currentUserId || mySessionIds.has(s.id));
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    let results = sessions;
    if (options?.offset) {
      results = results.slice(options.offset);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results.map((s) => this.calculateSessionSummary(s, currentUserId));
  }

  public async listMembers(sessionId: UUID): Promise<SessionMember[]> {
    const members = this.storage.getMembers().filter((m) => m.sessionId === sessionId);
    const profiles = this.storage.getProfiles();

    return members.map((m) => {
      const p = profiles.find((prof) => prof.id === m.userId);
      return {
        sessionId: m.sessionId,
        userId: m.userId,
        displayName: p ? p.displayName : 'ผู้เล่น',
        avatarPath: p?.avatarPath || null,
        status: m.status,
        position: m.position,
        requestedAt: m.requestedAt,
        confirmedAt: m.confirmedAt,
        decidedBy: m.decidedBy,
        updatedAt: m.updatedAt,
      };
    });
  }

  public async listMessages(sessionId: UUID, limit = 50): Promise<ChatMessage[]> {
    const messages = this.storage.getMessages().filter((m) => m.sessionId === sessionId);
    const profiles = this.storage.getProfiles();

    // Latest N in chronological order: sort descending by created_at, limit, then reverse
    messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const limited = messages.slice(0, Math.max(0, limit));
    const chronological = limited.reverse();

    return chronological.map((m) => {
      const p = profiles.find((prof) => prof.id === m.senderId);
      return {
        id: m.id,
        sessionId: m.sessionId,
        senderId: m.senderId,
        senderName: p ? p.displayName : 'ผู้ใช้งาน',
        clientMessageId: m.clientMessageId,
        body: m.body,
        createdAt: m.createdAt,
      };
    });
  }

  public async saveProfile(input: ProfileInput): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden', message: 'กรุณาเข้าสู่ระบบ' };

    if (!input.displayName || input.displayName.trim().length === 0) {
      return { ok: false, code: 'invalid_input', message: 'กรุณากรอกชื่อที่แสดง' };
    }

    const profiles = this.storage.getProfiles();
    const existingIndex = profiles.findIndex((p) => p.id === currentUser.id);
    const now = new Date().toISOString();

    const updatedProfile: UserProfile = {
      id: currentUser.id,
      displayName: input.displayName.trim(),
      avatarPath: input.avatarPath ?? currentUser.avatarPath,
      skillLevel: input.skillLevel ?? currentUser.skillLevel,
      primaryPosition: input.primaryPosition !== undefined ? input.primaryPosition : currentUser.primaryPosition,
      secondaryPosition: input.secondaryPosition !== undefined ? input.secondaryPosition : currentUser.secondaryPosition,
      playsAnyPosition: input.playsAnyPosition ?? currentUser.playsAnyPosition,
      heightCm: input.heightCm !== undefined ? input.heightCm : currentUser.heightCm,
      heightVisible: input.heightVisible !== undefined ? input.heightVisible : (currentUser.heightVisible ?? false),
      createdAt: currentUser.createdAt || now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      profiles[existingIndex] = updatedProfile;
    } else {
      profiles.push(updatedProfile);
    }

    this.storage.saveProfiles(profiles);
    return { ok: true, code: 'profile_saved', profile: updatedProfile };
  }

  public async createSession(requestId: UUID, input: SessionInput): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden', message: 'กรุณาเข้าสู่ระบบ' };

    // Idempotency check: if session with same host and requestId exists, return existing
    const existing = this.storage.getSessions().find((s) => s.hostId === currentUser.id && s.clientRequestId === requestId);
    if (existing) {
      const summary = this.calculateSessionSummary(existing, currentUser.id);
      return { ok: true, code: 'already_created', session: summary };
    }

    if (!input.title || input.title.trim().length === 0) {
      return { ok: false, code: 'invalid_input', message: 'กรุณากรอกหัวข้อนัด' };
    }

    if (input.guestCount && (input.guestCount < 0 || input.guestCount >= input.teamSize)) {
      return { ok: false, code: 'capacity_conflict', message: 'จำนวนเพื่อนที่มาด้วยต้องไม่เกินความจุทีม' };
    }

    const now = new Date();
    let startsAt = input.startsAt;
    if (!startsAt) {
      // "ตอนนี้"
      startsAt = now.toISOString();
    } else {
      const parsedTime = new Date(startsAt).getTime();
      if (parsedTime < now.getTime() - 5 * 60 * 1000) {
        return { ok: false, code: 'start_in_past', message: 'เวลาเริ่มนัดต้องอยู่ในอนาคตหรือเลือก "ตอนนี้"' };
      }
    }

    const sessionId = crypto.randomUUID();
    const nowIso = now.toISOString();

    const newSession: StoredSession = {
      id: sessionId,
      hostId: currentUser.id,
      clientRequestId: requestId,
      courtId: input.courtId,
      title: input.title.trim(),
      startsAt,
      teamSize: input.teamSize,
      guestCount: input.guestCount || 0,
      skillLevel: input.skillLevel || 'casual',
      welcomesBeginners: input.welcomesBeginners ?? true,
      wantedPositions: input.wantedPositions || [],
      joinPolicy: input.joinPolicy || 'instant',
      lifecycle: 'active',
      recruitmentOpen: true,
      meetingPoint: input.meetingPoint || '',
      notes: input.notes || '',
      createdAt: nowIso,
      updatedAt: nowIso,
      endedAt: null,
    };

    // Add host as confirmed member
    const newMember: StoredMember = {
      sessionId,
      userId: currentUser.id,
      status: 'confirmed',
      position: currentUser.primaryPosition || null,
      requestedAt: nowIso,
      confirmedAt: nowIso,
      decidedBy: null,
      updatedAt: nowIso,
    };

    const sessions = this.storage.getSessions();
    sessions.push(newSession);
    this.storage.saveSessions(sessions);

    const members = this.storage.getMembers();
    members.push(newMember);
    this.storage.saveMembers(members);

    const summary = this.calculateSessionSummary(newSession, currentUser.id);
    return { ok: true, code: 'created', session: summary };
  }

  public async updateSession(sessionId: UUID, patch: Partial<SessionInput>): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };

    const sessions = this.storage.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return { ok: false, code: 'not_found' };
    if (session.hostId !== currentUser.id) return { ok: false, code: 'forbidden' };
    if (session.lifecycle !== 'active') return { ok: false, code: 'session_inactive' };

    if (patch.guestCount !== undefined) {
      const members = this.storage.getMembers().filter((m) => m.sessionId === sessionId && m.status === 'confirmed');
      const targetTeamSize = patch.teamSize || session.teamSize;
      if (members.length + patch.guestCount > targetTeamSize) {
        return { ok: false, code: 'capacity_conflict', message: 'จำนวนเพื่อนใหม่ขัดแย้งกับสมาชิกที่มีอยู่' };
      }
      session.guestCount = patch.guestCount;
    }

    if (patch.title !== undefined) session.title = patch.title;
    if (patch.courtId !== undefined) session.courtId = patch.courtId;
    if (patch.startsAt !== undefined && patch.startsAt !== null) session.startsAt = patch.startsAt;
    if (patch.teamSize !== undefined) session.teamSize = patch.teamSize;
    if (patch.skillLevel !== undefined) session.skillLevel = patch.skillLevel;
    if (patch.welcomesBeginners !== undefined) session.welcomesBeginners = patch.welcomesBeginners;
    if (patch.wantedPositions !== undefined) session.wantedPositions = patch.wantedPositions;
    if (patch.joinPolicy !== undefined) session.joinPolicy = patch.joinPolicy;
    if (patch.meetingPoint !== undefined) session.meetingPoint = patch.meetingPoint;
    if (patch.notes !== undefined) session.notes = patch.notes;

    session.updatedAt = new Date().toISOString();
    this.storage.saveSessions(sessions);

    const summary = this.calculateSessionSummary(session, currentUser.id);
    return { ok: true, code: 'updated', session: summary };
  }

  public async joinSession(sessionId: UUID, position?: Position | null): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };

    const session = this.storage.getSessions().find((s) => s.id === sessionId);
    if (!session) return { ok: false, code: 'not_found' };
    if (session.lifecycle !== 'active') return { ok: false, code: 'session_inactive' };
    if (!session.recruitmentOpen) return { ok: false, code: 'recruitment_closed' };

    const allMembers = this.storage.getMembers();
    const sessionMembers = allMembers.filter((m) => m.sessionId === sessionId);
    const existingMember = sessionMembers.find((m) => m.userId === currentUser.id);

    if (existingMember) {
      if (existingMember.status === 'confirmed') {
        const summary = this.calculateSessionSummary(session, currentUser.id);
        return { ok: true, code: 'already_joined', session: summary };
      }
      if (existingMember.status === 'pending') {
        const summary = this.calculateSessionSummary(session, currentUser.id);
        return { ok: true, code: 'pending', session: summary };
      }
    }

    // Check capacity for instant join
    const confirmedCount = sessionMembers.filter((m) => m.status === 'confirmed').length;
    const occupiedCount = confirmedCount + session.guestCount;
    if (occupiedCount >= session.teamSize) {
      return { ok: false, code: 'session_full' };
    }

    const now = new Date().toISOString();
    const isInstant = session.joinPolicy === 'instant';
    const status: 'confirmed' | 'pending' = isInstant ? 'confirmed' : 'pending';

    const memberRow: StoredMember = {
      sessionId,
      userId: currentUser.id,
      status,
      position: position || currentUser.primaryPosition || null,
      requestedAt: now,
      confirmedAt: isInstant ? now : null,
      decidedBy: null,
      updatedAt: now,
    };

    if (existingMember) {
      Object.assign(existingMember, memberRow);
    } else {
      allMembers.push(memberRow);
    }

    this.storage.saveMembers(allMembers);
    const summary = this.calculateSessionSummary(session, currentUser.id);
    return { ok: true, code: isInstant ? 'joined' : 'pending', session: summary };
  }

  public async decideRequest(sessionId: UUID, userId: UUID, approve: boolean): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };

    const session = this.storage.getSessions().find((s) => s.id === sessionId);
    if (!session) return { ok: false, code: 'not_found' };
    if (session.hostId !== currentUser.id) return { ok: false, code: 'forbidden' };
    if (session.lifecycle !== 'active') return { ok: false, code: 'session_inactive' };

    const allMembers = this.storage.getMembers();
    const member = allMembers.find((m) => m.sessionId === sessionId && m.userId === userId);
    if (!member) return { ok: false, code: 'request_not_found' };
    if (member.status !== 'pending') return { ok: false, code: 'request_not_pending' };

    const now = new Date().toISOString();
    if (approve) {
      // Check capacity
      const confirmedCount = allMembers.filter((m) => m.sessionId === sessionId && m.status === 'confirmed').length;
      if (confirmedCount + session.guestCount >= session.teamSize) {
        return { ok: false, code: 'session_full' };
      }
      member.status = 'confirmed';
      member.confirmedAt = now;
      member.decidedBy = currentUser.id;
      member.updatedAt = now;
    } else {
      member.status = 'declined';
      member.decidedBy = currentUser.id;
      member.updatedAt = now;
    }

    this.storage.saveMembers(allMembers);
    const summary = this.calculateSessionSummary(session, currentUser.id);
    return { ok: true, code: approve ? 'approved' : 'declined', session: summary };
  }

  public async withdraw(sessionId: UUID): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };

    const session = this.storage.getSessions().find((s) => s.id === sessionId);
    if (!session) return { ok: false, code: 'not_found' };
    if (session.hostId === currentUser.id) {
      return { ok: false, code: 'host_cannot_withdraw' };
    }
    if (session.lifecycle !== 'active') return { ok: false, code: 'session_inactive' };

    const allMembers = this.storage.getMembers();
    const member = allMembers.find((m) => m.sessionId === sessionId && m.userId === currentUser.id);
    if (!member || (member.status !== 'confirmed' && member.status !== 'pending')) {
      return { ok: false, code: 'not_participating' };
    }

    member.status = 'withdrawn';
    member.updatedAt = new Date().toISOString();
    this.storage.saveMembers(allMembers);

    const summary = this.calculateSessionSummary(session, currentUser.id);
    return { ok: true, code: 'withdrawn', session: summary };
  }

  public async setRecruitment(sessionId: UUID, open: boolean): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };

    const sessions = this.storage.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return { ok: false, code: 'not_found' };
    if (session.hostId !== currentUser.id) return { ok: false, code: 'forbidden' };
    if (session.lifecycle !== 'active') return { ok: false, code: 'session_inactive' };

    session.recruitmentOpen = open;
    session.updatedAt = new Date().toISOString();
    this.storage.saveSessions(sessions);

    const summary = this.calculateSessionSummary(session, currentUser.id);
    return { ok: true, code: open ? 'recruitment_opened' : 'recruitment_closed', session: summary };
  }

  public async endSession(sessionId: UUID, lifecycle: 'completed' | 'cancelled'): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };

    const sessions = this.storage.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return { ok: false, code: 'not_found' };
    if (session.hostId !== currentUser.id) return { ok: false, code: 'forbidden' };

    const now = new Date().toISOString();
    session.lifecycle = lifecycle;
    session.recruitmentOpen = false;
    session.endedAt = now;
    session.updatedAt = now;
    this.storage.saveSessions(sessions);

    const summary = this.calculateSessionSummary(session, currentUser.id);
    return { ok: true, code: lifecycle, session: summary };
  }

  public async sendMessage(sessionId: UUID, clientMessageId: UUID, body: string): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };

    if (!body || body.trim().length === 0) {
      return { ok: false, code: 'invalid_input', message: 'กรุณากรอกข้อความ' };
    }

    const session = this.storage.getSessions().find((s) => s.id === sessionId);
    if (!session) return { ok: false, code: 'not_found' };
    if (session.lifecycle !== 'active') return { ok: false, code: 'session_inactive' };

    const allMembers = this.storage.getMembers();
    const member = allMembers.find((m) => m.sessionId === sessionId && m.userId === currentUser.id);
    const isHost = session.hostId === currentUser.id;
    const isConfirmed = member?.status === 'confirmed';

    if (!isHost && !isConfirmed) {
      return { ok: false, code: 'forbidden', message: 'เฉพาะสมาชิกที่ยืนยันแล้วเท่านั้นจึงจะส่งข้อความได้' };
    }

    // Idempotency check: if clientMessageId already recorded for this session and sender, return existing
    const messages = this.storage.getMessages();
    const existing = messages.find(
      (m) => m.sessionId === sessionId && m.senderId === currentUser.id && m.clientMessageId === clientMessageId
    );

    if (existing) {
      const msg: ChatMessage = {
        id: existing.id,
        sessionId: existing.sessionId,
        senderId: existing.senderId,
        senderName: currentUser.displayName,
        clientMessageId: existing.clientMessageId,
        body: existing.body,
        createdAt: existing.createdAt,
      };
      return { ok: true, code: 'already_sent', message: existing.body, messageData: msg };
    }

    const newMsg: StoredMessage = {
      id: crypto.randomUUID(),
      sessionId,
      senderId: currentUser.id,
      clientMessageId,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    };

    messages.push(newMsg);
    this.storage.saveMessages(messages);

    const msg: ChatMessage = {
      id: newMsg.id,
      sessionId: newMsg.sessionId,
      senderId: newMsg.senderId,
      senderName: currentUser.displayName,
      clientMessageId: newMsg.clientMessageId,
      body: newMsg.body,
      createdAt: newMsg.createdAt,
    };

    return { ok: true, code: 'sent', message: newMsg.body, messageData: msg };
  }

  public async blockUser(userId: UUID): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };
    if (currentUser.id === userId) return { ok: false, code: 'cannot_block_self' };

    const blocks = this.storage.getBlocks();
    if (!blocks.some((b) => b.blockerId === currentUser.id && b.blockedId === userId)) {
      blocks.push({ blockerId: currentUser.id, blockedId: userId });
      this.storage.saveBlocks(blocks);
    }
    return { ok: true, code: 'blocked' };
  }

  public async unblockUser(userId: UUID): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };

    let blocks = this.storage.getBlocks();
    blocks = blocks.filter((b) => !(b.blockerId === currentUser.id && b.blockedId === userId));
    this.storage.saveBlocks(blocks);
    return { ok: true, code: 'unblocked' };
  }

  public async report(targetType: 'user' | 'session' | 'message', targetId: UUID, reason: string): Promise<CommandResult> {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return { ok: false, code: 'forbidden' };
    if (!reason || reason.trim().length === 0) return { ok: false, code: 'invalid_input' };

    const reports = this.storage.getReports();
    const reportId = crypto.randomUUID();
    reports.push({
      id: reportId,
      reporterId: currentUser.id,
      targetType,
      targetId,
      reason: reason.trim(),
    });
    this.storage.saveReports(reports);
    return { ok: true, code: 'reported', reportId };
  }
}
