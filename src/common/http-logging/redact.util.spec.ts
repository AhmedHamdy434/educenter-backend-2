import {
  DEFAULT_SENSITIVE_FIELDS,
  formatIndentedBody,
  redactSensitive,
  safeSerializeAndRedact,
  truncatePayload,
} from './redact.util';

describe('redact.util', () => {
  describe('redactSensitive', () => {
    it('should return primitives as-is', () => {
      expect(redactSensitive(null)).toBeNull();
      expect(redactSensitive(undefined)).toBeUndefined();
      expect(redactSensitive('hello')).toBe('hello');
      expect(redactSensitive(123)).toBe(123);
      expect(redactSensitive(true)).toBe(true);
    });

    it('should redact default sensitive fields regardless of case', () => {
      const input = {
        password: 'secretPassword123',
        PASSWORD: 'secretPassword456',
        token: 'jwt.token.here',
        accessToken: 'access.token.here',
        refreshToken: 'refresh.token.here',
        authorization: 'Bearer xyz',
        cookie: 'sessionId=abc',
        secret: 'shh',
        apiKey: 'key-123',
        username: 'john_doe',
        email: 'john@example.com',
      };

      const result = redactSensitive(input) as Record<string, unknown>;

      expect(result.password).toBe('[REDACTED]');
      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.authorization).toBe('[REDACTED]');
      expect(result.cookie).toBe('[REDACTED]');
      expect(result.secret).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.username).toBe('john_doe');
      expect(result.email).toBe('john@example.com');
    });

    it('should recursively redact nested objects and arrays', () => {
      const input = {
        user: {
          id: 1,
          credentials: {
            password: 'secretPassword',
            salt: 'salt123',
          },
          tokens: [{ token: 'tok-1' }, { token: 'tok-2', valid: true }],
        },
      };

      const result = redactSensitive(input) as any;

      expect(result.user.id).toBe(1);
      expect(result.user.credentials.password).toBe('[REDACTED]');
      expect(result.user.credentials.salt).toBe('salt123');
      expect(result.user.tokens[0].token).toBe('[REDACTED]');
      expect(result.user.tokens[1].token).toBe('[REDACTED]');
      expect(result.user.tokens[1].valid).toBe(true);
    });

    it('should support custom sensitive fields', () => {
      const input = {
        pinCode: '1234',
        ssn: '000-11-2222',
        name: 'Jane',
      };

      const result = redactSensitive(input, ['pinCode', 'ssn']) as Record<
        string,
        unknown
      >;

      expect(result.pinCode).toBe('[REDACTED]');
      expect(result.ssn).toBe('[REDACTED]');
      expect(result.name).toBe('Jane');
    });

    it('should convert Prisma Decimal / BigNumber objects into readable numbers', () => {
      const mockDecimal = {
        d: [5000],
        e: 3,
        s: 1,
        toFixed: () => '5000.00',
        toNumber: () => 5000,
        toString: () => '5000',
      };

      const input = {
        id: 'plan-1',
        name: 'Annual Plan',
        price: mockDecimal,
      };

      const result = redactSensitive(input) as any;
      expect(result.price).toBe(5000);
    });

    it('should safely handle circular references', () => {
      const obj: any = { name: 'CircularTest' };
      obj.self = obj;

      const result = redactSensitive(obj) as any;
      expect(result.name).toBe('CircularTest');
      expect(result.self).toBe('[CIRCULAR]');
    });

    it('should not mutate original input', () => {
      const input = { password: 'myPassword', user: { token: 'myToken' } };
      const originalClone = JSON.parse(JSON.stringify(input));

      redactSensitive(input);

      expect(input).toEqual(originalClone);
    });
  });

  describe('truncatePayload', () => {
    it('should not truncate string shorter than or equal to maxLength', () => {
      expect(truncatePayload('hello', 10)).toBe('hello');
      expect(truncatePayload('hello', 5)).toBe('hello');
    });

    it('should truncate string longer than maxLength and append notice', () => {
      const result = truncatePayload('hello world', 5);
      expect(result).toBe('hello... [truncated]');
    });

    it('should return empty/falsy string as-is', () => {
      expect(truncatePayload('', 10)).toBe('');
    });
  });

  describe('safeSerializeAndRedact', () => {
    it('should serialize, redact, and truncate', () => {
      const input = {
        user: { name: 'Alice' },
        password: 'superSecretPassword',
      };

      const result = safeSerializeAndRedact(input, 50);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('superSecretPassword');
    });

    it('should serialize in pretty mode with indentation and preserve Arabic text unescaped', () => {
      const input = {
        success: true,
        message: 'تم استرجاع بيانات الملف الشخصي بنجاح.',
        data: {
          id: 'cm123',
          fullName: 'مصطفى السيد',
        },
      };

      const result = safeSerializeAndRedact(input, 1000, [], true);
      expect(result).toContain('{\n  "success": true,');
      expect(result).toContain(
        '"message": "تم استرجاع بيانات الملف الشخصي بنجاح.",',
      );
      expect(result).toContain('"fullName": "مصطفى السيد"');
      // Verify Arabic text is NOT escaped to unicode (\u06...)
      expect(result).not.toContain('\\u');
    });

    it('should handle circular structures gracefully in safeSerializeAndRedact', () => {
      const obj: any = { a: 1 };
      obj.circular = obj;

      const result = safeSerializeAndRedact(obj, 1000);
      expect(result).toContain('[CIRCULAR]');
    });
  });

  describe('formatIndentedBody', () => {
    it('should format single-line body with Body: prefix', () => {
      const result = formatIndentedBody('{"status":"ok"}');
      expect(result).toBe('  Body: {"status":"ok"}');
    });

    it('should format multi-line body with proper indentation on all lines', () => {
      const body = '{\n  "name": "علي",\n  "active": true\n}';
      const result = formatIndentedBody(body);
      expect(result).toBe(
        '  Body: {\n    "name": "علي",\n    "active": true\n  }',
      );
    });
  });
});
