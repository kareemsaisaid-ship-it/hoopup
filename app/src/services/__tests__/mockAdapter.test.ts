import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS, MockAuthService, MockDataService, MockStorage } from '../mockAdapter';

describe('HoopUp Mock Adapter Unit Tests', () => {
  let storage: MockStorage;
  let auth: MockAuthService;
  let data: MockDataService;

  beforeEach(() => {
    storage = new MockStorage();
    storage.resetAll();
    auth = new MockAuthService(storage);
    data = new MockDataService(storage, auth);
  });

  it('calculates seatsRemaining and occupancy correctly, pending does not eat seats', async () => {
    // Current user is Host Demo (DEMO_USERS[0])
    await auth.switchDemoUser(DEMO_USERS[0].id);

    const reqId = 'test-req-1';
    const createRes = await data.createSession(reqId, {
      title: 'ทดสอบการนับที่นั่ง 3x3',
      courtId: 'c1111111-1111-4111-8111-111111111111',
      teamSize: 3,
      guestCount: 1, // Host brings 1 friend
      joinPolicy: 'approval', // Requires approval so joiner will be pending
    });

    expect(createRes.ok).toBe(true);
    if (!createRes.ok || !createRes.session) throw new Error('Failed to create session');

    const session = createRes.session;
    // Host is 1 confirmed + 1 guest = 2 occupied out of 3. Remaining = 1.
    expect(session.confirmedCount).toBe(1);
    expect(session.guestCount).toBe(1);
    expect(session.occupiedCount).toBe(2);
    expect(session.seatsRemaining).toBe(1);

    // Switch to Joiner 1 (DEMO_USERS[1]) and request to join
    await auth.switchDemoUser(DEMO_USERS[1].id);
    const joinRes = await data.joinSession(session.id);
    expect(joinRes.ok).toBe(true);
    expect(joinRes.code).toBe('pending');

    // Fetch updated session: pending member must NOT increase occupiedCount!
    const updated = await data.getSession(session.id);
    expect(updated).not.toBeNull();
    expect(updated?.confirmedCount).toBe(1); // Still 1
    expect(updated?.occupiedCount).toBe(2); // Still 2
    expect(updated?.seatsRemaining).toBe(1); // Still 1 seat remaining!
  });

  it('guarantees idempotency on session creation retry with same requestId', async () => {
    await auth.switchDemoUser(DEMO_USERS[0].id);
    const reqId = 'unique-retry-request-id-123';

    const res1 = await data.createSession(reqId, {
      title: 'นัดทดสอบ Idempotency',
      courtId: 'c1111111-1111-4111-8111-111111111111',
      teamSize: 5,
      guestCount: 0,
    });

    expect(res1.ok).toBe(true);
    expect(res1.code).toBe('created');
    const sessionId1 = (res1 as any).session.id;

    // Retry with the same requestId
    const res2 = await data.createSession(reqId, {
      title: 'นัดทดสอบ Idempotency (ชื่อเปลี่ยนไม่กระทบ)',
      courtId: 'c1111111-1111-4111-8111-111111111111',
      teamSize: 5,
      guestCount: 0,
    });

    expect(res2.ok).toBe(true);
    expect(res2.code).toBe('already_created');
    const sessionId2 = (res2 as any).session.id;

    // Must return the exact same session ID
    expect(sessionId1).toBe(sessionId2);
  });

  it('guarantees idempotency on sending chat messages with same clientMessageId', async () => {
    await auth.switchDemoUser(DEMO_USERS[0].id);

    const sessions = await data.listSessions();
    const sessionId = sessions[0].id;
    const clientMsgId = 'msg-uuid-999';

    const res1 = await data.sendMessage(sessionId, clientMsgId, 'สวัสดีทุกคน');
    expect(res1.ok).toBe(true);
    expect(res1.code).toBe('sent');
    const msgId1 = (res1 as any).messageData.id;

    // Retry sending with exact same clientMessageId
    const res2 = await data.sendMessage(sessionId, clientMsgId, 'สวัสดีทุกคน (retry)');
    expect(res2.ok).toBe(true);
    expect(res2.code).toBe('already_sent');
    const msgId2 = (res2 as any).messageData.id;

    expect(msgId1).toBe(msgId2);
  });

  it('enforces business rules: host cannot withdraw, non-members cannot chat', async () => {
    const sessions = await data.listSessions();
    const sessionId = sessions[0].id; // Hosted by DEMO_USERS[0]

    // Host attempts to withdraw
    await auth.switchDemoUser(DEMO_USERS[0].id);
    const withdrawRes = await data.withdraw(sessionId);
    expect(withdrawRes.ok).toBe(false);
    expect(withdrawRes.code).toBe('host_cannot_withdraw');

    // Switch to outsider who is not confirmed
    await auth.switchDemoUser(DEMO_USERS[2].id);
    const chatRes = await data.sendMessage(sessionId, 'random-id', 'แอบส่งข้อความ');
    expect(chatRes.ok).toBe(false);
    expect(chatRes.code).toBe('forbidden');
  });

  it('approving a request increases confirmed members and decreases seats', async () => {
    await auth.switchDemoUser(DEMO_USERS[0].id);

    const createRes = await data.createSession('req-approval-test', {
      title: 'นัดรออนุมัติ',
      courtId: 'c1111111-1111-4111-8111-111111111111',
      teamSize: 3,
      guestCount: 0,
      joinPolicy: 'approval',
    });
    const sessionId = (createRes as any).session.id;

    // Joiner 1 requests
    await auth.switchDemoUser(DEMO_USERS[1].id);
    await data.joinSession(sessionId);

    // Host approves Joiner 1
    await auth.switchDemoUser(DEMO_USERS[0].id);
    const approveRes = await data.decideRequest(sessionId, DEMO_USERS[1].id, true);
    expect(approveRes.ok).toBe(true);
    expect(approveRes.code).toBe('approved');

    const updated = await data.getSession(sessionId);
    expect(updated?.confirmedCount).toBe(2); // Host + Joiner 1
    expect(updated?.occupiedCount).toBe(2);
    expect(updated?.seatsRemaining).toBe(1);
  });

  it('listMessages returns latest 50 in chronological order when > 50 messages exist', async () => {
    await auth.switchDemoUser(DEMO_USERS[0].id);

    const sessions = await data.listSessions();
    const sessionId = sessions[0].id;

    // Clear existing messages for this session
    const otherMessages = storage.getMessages().filter((m) => m.sessionId !== sessionId);
    storage.saveMessages(otherMessages);

    // Seed 60 messages with sequential timestamps
    const baseTime = new Date('2026-11-01T10:00:00.000Z').getTime();
    const newMessages = [];
    for (let i = 1; i <= 60; i++) {
      newMessages.push({
        id: `msg-${i}`,
        sessionId,
        senderId: DEMO_USERS[0].id,
        clientMessageId: `client-msg-${i}`,
        body: `Message ${i}`,
        createdAt: new Date(baseTime + i * 1000).toISOString(),
      });
    }
    storage.saveMessages([...otherMessages, ...newMessages]);

    const messages = await data.listMessages(sessionId, 50);

    // Exactly 50 messages returned
    expect(messages.length).toBe(50);

    // The oldest 10 messages (1 to 10) must be excluded
    expect(messages.find((m) => m.body === 'Message 1')).toBeUndefined();
    expect(messages.find((m) => m.body === 'Message 10')).toBeUndefined();

    // The first returned message must be Message 11
    expect(messages[0].body).toBe('Message 11');

    // The last returned message must be Message 60
    expect(messages[messages.length - 1].body).toBe('Message 60');

    // Messages must be returned in chronological order
    for (let i = 0; i < messages.length - 1; i++) {
      const currTime = new Date(messages[i].createdAt).getTime();
      const nextTime = new Date(messages[i + 1].createdAt).getTime();
      expect(nextTime).toBeGreaterThanOrEqual(currTime);
    }
  });

  it('saveProfile normalizes to camelCase UserProfile', async () => {
    await auth.switchDemoUser(DEMO_USERS[0].id);

    const res = await data.saveProfile({
      displayName: 'ก้อง ชู้ตเตอร์แม่นยำ',
      skillLevel: 'competitive',
      primaryPosition: 'SG',
      secondaryPosition: 'SF',
      playsAnyPosition: false,
      heightCm: 185,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('Expected res.ok to be true');
    expect(res.code).toBe('profile_saved');
    expect(res.profile).toBeDefined();

    const profile = res.profile as any;
    expect(profile.displayName).toBe('ก้อง ชู้ตเตอร์แม่นยำ');
    expect(profile.skillLevel).toBe('competitive');
    expect(profile.primaryPosition).toBe('SG');
    expect(profile.secondaryPosition).toBe('SF');
    expect(profile.playsAnyPosition).toBe(false);
    expect(profile.heightCm).toBe(185);
    // Ensure no snake_case leaks
    expect(profile.display_name).toBeUndefined();
    expect(profile.skill_level).toBeUndefined();
  });

  it('respects heightVisible for other users and always reveals height to owner (HT2)', async () => {
    // Current user: ก้อง (DEMO_USERS[0], heightVisible: true, heightCm: 178)
    await auth.switchDemoUser(DEMO_USERS[0].id);

    // 1. Current user always sees their own height and heightVisible
    const myProfile = await data.getProfile(DEMO_USERS[0].id);
    expect(myProfile).not.toBeNull();
    expect(myProfile?.heightCm).toBe(178);
    expect(myProfile?.heightVisible).toBe(true);

    // Also when called without arguments (default = current user)
    const myDefaultProfile = await data.getProfile();
    expect(myDefaultProfile?.heightCm).toBe(178);
    expect(myDefaultProfile?.heightVisible).toBe(true);

    // 2. Viewing other user (บอย, DEMO_USERS[1]) whose heightVisible is false
    const boyProfile = await data.getProfile(DEMO_USERS[1].id);
    expect(boyProfile).not.toBeNull();
    // For other users whose heightVisible is false, heightCm is null
    expect(boyProfile?.heightCm).toBeNull();
    expect(boyProfile?.heightVisible).toBe(false);

    // 3. Viewing other user (ต้าร์, DEMO_USERS[2]) whose heightVisible is true
    const tarProfile = await data.getProfile(DEMO_USERS[2].id);
    expect(tarProfile).not.toBeNull();
    // For other users whose heightVisible is true, real height is returned
    expect(tarProfile?.heightCm).toBe(191);
    expect(tarProfile?.heightVisible).toBe(false); // height_visible is absent/false for other users

    // 4. Switch to บอย (owner of DEMO_USERS[1]): owner always sees their own height
    await auth.switchDemoUser(DEMO_USERS[1].id);
    const boyOwnProfile = await data.getProfile(DEMO_USERS[1].id);
    expect(boyOwnProfile?.heightCm).toBe(183);
    expect(boyOwnProfile?.heightVisible).toBe(false);

    // 5. บอย opts in via saveProfile
    const saveRes = await data.saveProfile({
      displayName: 'บอย (Joiner 1 Demo)',
      heightCm: 183,
      heightVisible: true,
    });
    expect(saveRes.ok).toBe(true);
    if (saveRes.ok && saveRes.profile) {
      expect((saveRes.profile as any).heightVisible).toBe(true);
    }

    // Now switch back to ก้อง and check บอย: height should be visible (183)
    await auth.switchDemoUser(DEMO_USERS[0].id);
    const boyUpdatedForKong = await data.getProfile(DEMO_USERS[1].id);
    expect(boyUpdatedForKong?.heightCm).toBe(183);

    // 6. If heightVisible is omitted on saveProfile, existing value is kept
    await auth.switchDemoUser(DEMO_USERS[1].id);
    await data.saveProfile({
      displayName: 'บอย อัปเดตชื่อ',
    });
    const boyAfterOmitted = await data.getProfile(DEMO_USERS[1].id);
    expect(boyAfterOmitted?.displayName).toBe('บอย อัปเดตชื่อ');
    expect(boyAfterOmitted?.heightVisible).toBe(true); // kept true
  });
});
