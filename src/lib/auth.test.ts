import { describe, it, expect, vi, beforeEach } from "vitest";

// getAuthUser() reads next/headers' cookies() — mocked per-test so we can
// exercise getAuthUserAny()'s "cookie first, then bearer" fallback without
// a real Next.js request context.
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet, set: vi.fn() }),
}));

import { signToken, verifyToken, getAuthUserFromBearer, getAuthUserAny, type JWTPayload } from "./auth";

const payload: JWTPayload = { id: "u1", name: "Test User", role: "PATIENT", mobile: "9876543210" };

describe("signToken / verifyToken", () => {
  it("round-trips a payload", () => {
    const token = signToken(payload);
    expect(verifyToken(token)).toMatchObject(payload);
  });

  it("rejects a garbage token", () => {
    expect(verifyToken("not-a-real-token")).toBeNull();
  });
});

describe("getAuthUserFromBearer", () => {
  it("extracts a valid token from an Authorization: Bearer header", () => {
    const token = signToken(payload);
    const req = new Request("https://example.com", { headers: { authorization: `Bearer ${token}` } });
    expect(getAuthUserFromBearer(req)).toMatchObject(payload);
  });

  it("is case-insensitive on the 'Bearer' prefix", () => {
    const token = signToken(payload);
    const req = new Request("https://example.com", { headers: { authorization: `bearer ${token}` } });
    expect(getAuthUserFromBearer(req)).toMatchObject(payload);
  });

  it("returns null when there is no Authorization header", () => {
    const req = new Request("https://example.com");
    expect(getAuthUserFromBearer(req)).toBeNull();
  });

  it("returns null for a malformed token", () => {
    const req = new Request("https://example.com", { headers: { authorization: "Bearer garbage" } });
    expect(getAuthUserFromBearer(req)).toBeNull();
  });
});

describe("getAuthUserAny", () => {
  beforeEach(() => mockCookieGet.mockReset());

  it("prefers the cookie when both cookie and bearer are present", () => {
    const cookieUser: JWTPayload = { ...payload, id: "from-cookie" };
    const bearerUser: JWTPayload = { ...payload, id: "from-bearer" };
    mockCookieGet.mockReturnValue({ value: signToken(cookieUser) });

    const req = new Request("https://example.com", {
      headers: { authorization: `Bearer ${signToken(bearerUser)}` },
    });

    return getAuthUserAny(req).then((user) => {
      expect(user?.id).toBe("from-cookie");
    });
  });

  it("falls back to the bearer token when there is no cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);
    const req = new Request("https://example.com", {
      headers: { authorization: `Bearer ${signToken(payload)}` },
    });

    const user = await getAuthUserAny(req);
    expect(user).toMatchObject(payload);
  });

  it("returns null when neither cookie nor bearer token is present", async () => {
    mockCookieGet.mockReturnValue(undefined);
    const req = new Request("https://example.com");
    expect(await getAuthUserAny(req)).toBeNull();
  });
});
