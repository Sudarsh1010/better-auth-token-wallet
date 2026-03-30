import { describe, it, expect, vi } from "vitest";
import { getAdapter } from "../adapter.js";

describe("getAdapter utility", () => {
  it("extracts WalletAdapter from Better Auth context", () => {
    const mockAdapter = {
      findOne: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
      count: vi.fn(),
    };
    const ctx = { context: { adapter: mockAdapter } };
    const result = getAdapter(ctx);
    expect(result).toBe(mockAdapter);
  });
});
