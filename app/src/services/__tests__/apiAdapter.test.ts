import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiAuthService, ApiDataService } from '../apiAdapter';
import type { SessionInput } from '../types';

describe('ApiAdapter Unit Tests (BE2)', () => {
  const TEST_BASE_URL = 'http://127.0.0.1:8787';
  const SECRET_TOKEN = 'secret_jwt_token_header_payload_signature_12345';
  let authService: ApiAuthService;
  let dataService: ApiDataService;

  // In-memory sessionStorage stub for node environment
  const storageMap = new Map<string, string>();
  const mockSessionStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => {
      storageMap.set(key, String(val));
    },
    removeItem: (key: string) => {
      storageMap.delete(key);
    },
    clear: () => {
      storageMap.clear();
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    (globalThis as any).window = { sessionStorage: mockSessionStorage };
    (globalThis as any).sessionStorage = mockSessionStorage;

    authService = new ApiAuthService(TEST_BASE_URL);
    dataService = new ApiDataService(authService, TEST_BASE_URL);
  });

  afterEach(() => {
    storageMap.clear();
  });

  describe('ApiAuthService', () => {
    it('sends correct shape for signUp and saves token in memory and sessionStorage', async () => {
      const capturedRequests: { url: string; method: string; headers: Record<string, string>; body: any }[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        const u = url.toString();
        capturedRequests.push({
          url: u,
          method: init?.method || 'GET',
          headers: (init?.headers as Record<string, string>) || {},
          body: init?.body ? JSON.parse(init.body.toString()) : null,
        });

        if (u.endsWith('/auth/signup')) {
          return new Response(
            JSON.stringify({
              accessToken: SECRET_TOKEN,
              tokenType: 'Bearer',
              user: { id: 'user-1', email: 'test@example.com' },
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (u.endsWith('/auth/me')) {
          return new Response(
            JSON.stringify({
              user: { id: 'user-1', email: 'test@example.com' },
              profile: { id: 'user-1', display_name: 'นักบาสเก่ง' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('{}', { status: 200 });
      });

      const res = await authService.signUp({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        displayName: 'นักบาสเก่ง',
      });

      expect(res.ok).toBe(true);
      expect(capturedRequests[0].url).toBe(`${TEST_BASE_URL}/auth/signup`);
      expect(capturedRequests[0].method).toBe('POST');
      expect(capturedRequests[0].headers['Content-Type']).toBe('application/json');
      expect(capturedRequests[0].body).toEqual({
        email: 'test@example.com',
        password: 'ValidPassword123!',
        displayName: 'นักบาสเก่ง',
      });

      // Token in memory and sessionStorage
      expect(authService.getAccessToken()).toBe(SECRET_TOKEN);
      expect(mockSessionStorage.getItem('hoopup_access_token')).toBe(SECRET_TOKEN);
      expect(authService.getCurrentUser()?.displayName).toBe('นักบาสเก่ง');
    });

    it('sends correct shape for signIn and loads user profile', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.toString().endsWith('/auth/login')) {
          return new Response(
            JSON.stringify({
              accessToken: SECRET_TOKEN,
              tokenType: 'Bearer',
              user: { id: 'user-2', email: 'user2@example.com' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.toString().endsWith('/auth/me')) {
          return new Response(
            JSON.stringify({
              user: { id: 'user-2', email: 'user2@example.com' },
              profile: { id: 'user-2', display_name: 'มือปืน' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('{}', { status: 200 });
      });

      const res = await authService.signIn({
        email: 'user2@example.com',
        password: 'PasswordValid123!',
      });

      expect(res.ok).toBe(true);
      expect(authService.getAccessToken()).toBe(SECRET_TOKEN);
      expect(authService.getCurrentUser()?.displayName).toBe('มือปืน');
    });

    it('handles 401 on signIn with generic Thai error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid email or password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const res = await authService.signIn({
        email: 'wrong@example.com',
        password: 'WrongPassword123!',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      expect(authService.getAccessToken()).toBeNull();
    });

    it('handles 429 on signIn gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Too many attempts' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const res = await authService.signIn({
        email: 'rate@example.com',
        password: 'Password12345!',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('กำลังประมวลผลคำขอมากเกินไป');
    });

    it('signOut sends POST /auth/logout and clears in-memory and sessionStorage token', async () => {
      // Simulate signed in
      mockSessionStorage.setItem('hoopup_access_token', SECRET_TOKEN);
      const auth = new ApiAuthService(TEST_BASE_URL);

      let logoutCalled = false;
      let sentAuthHeader = '';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        if (url.toString().endsWith('/auth/logout')) {
          logoutCalled = true;
          sentAuthHeader = (init?.headers as Record<string, string>)?.['Authorization'] || '';
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      await auth.signOut();

      expect(logoutCalled).toBe(true);
      expect(sentAuthHeader).toBe(`Bearer ${SECRET_TOKEN}`);
      expect(auth.getAccessToken()).toBeNull();
      expect(mockSessionStorage.getItem('hoopup_access_token')).toBeNull();
      expect(auth.getCurrentUser()).toBeNull();
    });

    it('cleans up token if /auth/me returns 401', async () => {
      mockSessionStorage.setItem('hoopup_access_token', 'expired_token_123');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401 })
      );

      const auth = new ApiAuthService(TEST_BASE_URL);

      let subscriberCalledWith: any = 'uncalled';
      auth.subscribe((u) => {
        subscriberCalledWith = u;
      });

      // Allow async init to finish
      await new Promise((r) => setTimeout(r, 20));

      expect(auth.getAccessToken()).toBeNull();
      expect(mockSessionStorage.getItem('hoopup_access_token')).toBeNull();
      expect(subscriberCalledWith).toBeNull();
    });
  });

  describe('ApiDataService', () => {
    beforeEach(async () => {
      // Sign in authService with mocked login & me responses
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const u = url.toString();
        if (u.endsWith('/auth/login')) {
          return new Response(
            JSON.stringify({
              accessToken: SECRET_TOKEN,
              user: { id: 'u-1', email: 'u1@test.com' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (u.endsWith('/auth/me')) {
          return new Response(
            JSON.stringify({
              user: { id: 'u-1', email: 'u1@test.com' },
              profile: { id: 'u-1', display_name: 'ผู้เล่น 1' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('{}', { status: 200 });
      });

      await authService.signIn({ email: 'u1@test.com', password: 'ValidPass1234!' });
    });

    it('listCourts sends GET /courts with Authorization header and maps response', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(
          JSON.stringify([
            {
              id: 'c-1',
              name: 'สวนลุมพินี',
              address: 'ถ.พระราม 4',
              latitude: 13.73,
              longitude: 100.54,
              surface_type: 'Asphalt',
              is_indoor: false,
              has_lighting: true,
              hoop_count: 2,
              opening_hours_note: '05:00-21:00',
              photo_path: null,
              verified_at: null,
            },
          ]),
          { status: 200 }
        );
      });

      const courts = await dataService.listCourts();

      expect(capturedUrl).toBe(`${TEST_BASE_URL}/courts`);
      expect(capturedHeaders['Authorization']).toBe(`Bearer ${SECRET_TOKEN}`);
      expect(courts).toHaveLength(1);
      expect(courts[0].name).toBe('สวนลุมพินี');
      expect(courts[0].surfaceType).toBe('Asphalt');
      expect((courts[0] as any).surface_type).toBeUndefined();
    });

    it('listSessions sends POST /rpc/hoopup_list_sessions with p_filter argument', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedBody = init?.body ? JSON.parse(init.body.toString()) : null;
        return new Response(
          JSON.stringify([
            {
              id: 's-1',
              title: 'นัดเล่นบาส',
              teamSize: 3,
            },
          ]),
          { status: 200 }
        );
      });

      const sessions = await dataService.listSessions({ teamSize: 3 });

      expect(capturedUrl).toBe(`${TEST_BASE_URL}/rpc/hoopup_list_sessions`);
      expect(capturedBody).toEqual({
        p_filter: { teamSize: 3 },
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].title).toBe('นัดเล่นบาส');
    });

    it('createSession sends POST /rpc/hoopup_create_session with p_request_id and p_input', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedBody = init?.body ? JSON.parse(init.body.toString()) : null;
        return new Response(
          JSON.stringify({
            ok: true,
            code: 'created',
            session: { id: 's-new', title: 'บาส 5x5' },
          }),
          { status: 200 }
        );
      });

      const input: SessionInput = {
        title: 'บาส 5x5',
        courtId: 'c-1',
        teamSize: 5,
      };
      const res = await dataService.createSession('req-123', input);

      expect(capturedUrl).toBe(`${TEST_BASE_URL}/rpc/hoopup_create_session`);
      expect(capturedBody).toEqual({
        p_request_id: 'req-123',
        p_input: input,
      });
      expect(res.ok).toBe(true);
      expect(res.code).toBe('created');
    });

    it('sendMessage sends POST /rpc/hoopup_send_message with p_session_id, p_client_message_id, p_body', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedBody = init?.body ? JSON.parse(init.body.toString()) : null;
        return new Response(
          JSON.stringify({
            ok: true,
            code: 'sent',
            message: { id: 'm-1', body: 'สวัสดีครับ' },
          }),
          { status: 200 }
        );
      });

      const res = await dataService.sendMessage('s-1', 'msg-client-uuid', 'สวัสดีครับ');

      expect(capturedUrl).toBe(`${TEST_BASE_URL}/rpc/hoopup_send_message`);
      expect(capturedBody).toEqual({
        p_session_id: 's-1',
        p_client_message_id: 'msg-client-uuid',
        p_body: 'สวัสดีครับ',
      });
      expect(res.ok).toBe(true);
    });

    it('handles 401 on data read by signing out cleanly and token never appears in error message', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      );

      let thrownError: Error | null = null;
      try {
        await dataService.listCourts();
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      // Token must NEVER appear in error message
      expect(thrownError!.message).not.toContain(SECRET_TOKEN);
      expect(thrownError!.message).not.toContain('Bearer');
      // Auth service signed out cleanly
      expect(authService.getAccessToken()).toBeNull();
      expect(authService.getCurrentUser()).toBeNull();
    });

    it('handles 429 on data read and token never appears in error message', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Rate limit' }), { status: 429 })
      );

      let thrownError: Error | null = null;
      try {
        await dataService.listCourts();
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError!.message).not.toContain(SECRET_TOKEN);
      expect(thrownError!.message).toContain('ระบบกำลังประมวลผลคำขอ');
    });

    it('handles 500 server error without exposing internal tokens', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
      );

      let thrownError: Error | null = null;
      try {
        await dataService.listCourts();
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError!.message).not.toContain(SECRET_TOKEN);
      expect(thrownError!.message).toContain('การเชื่อมต่อขัดข้อง');
    });
  });
});
