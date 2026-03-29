import { describe, it, expect } from 'vitest';
import { tokenWallet } from '../index';

describe('token-wallet smoke test', () => {
  it('tokenWallet is a function', () => {
    expect(typeof tokenWallet).toBe('function');
  });

  it('tokenWallet returns { id: "token-wallet" }', () => {
    const result = tokenWallet();
    expect(result).toEqual({ id: 'token-wallet' });
  });
});
