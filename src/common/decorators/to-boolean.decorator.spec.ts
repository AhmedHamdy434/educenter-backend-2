import { plainToInstance } from 'class-transformer';
import { ToBoolean } from './to-boolean.decorator';

class TestDto {
  @ToBoolean()
  active?: boolean;
}

describe('ToBoolean Decorator', () => {
  it('should transform "1", 1, "true", and true to true', () => {
    expect(plainToInstance(TestDto, { active: '1' }).active).toBe(true);
    expect(plainToInstance(TestDto, { active: 1 }).active).toBe(true);
    expect(plainToInstance(TestDto, { active: 'true' }).active).toBe(true);
    expect(plainToInstance(TestDto, { active: true }).active).toBe(true);
  });

  it('should transform "0", 0, "false", and false to false', () => {
    expect(plainToInstance(TestDto, { active: '0' }).active).toBe(false);
    expect(plainToInstance(TestDto, { active: 0 }).active).toBe(false);
    expect(plainToInstance(TestDto, { active: 'false' }).active).toBe(false);
    expect(plainToInstance(TestDto, { active: false }).active).toBe(false);
  });

  it('should return undefined for missing, empty, or invalid values', () => {
    expect(plainToInstance(TestDto, {}).active).toBeUndefined();
    expect(plainToInstance(TestDto, { active: '' }).active).toBeUndefined();
    expect(
      plainToInstance(TestDto, { active: 'invalid' }).active,
    ).toBeUndefined();
    expect(plainToInstance(TestDto, { active: null }).active).toBeUndefined();
  });

  it('should prioritize raw obj[key] over implicitly converted value', () => {
    // Simulating class-transformer passing true for value while obj.active is still "0"
    const instance = plainToInstance(TestDto, { active: '0' });
    expect(instance.active).toBe(false);
  });
});
