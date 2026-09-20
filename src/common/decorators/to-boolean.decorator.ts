import { Transform } from 'class-transformer';

export function ToBoolean() {
  return Transform(({ value }) => {
    if (value === '1' || value === 1 || value === 'true' || value === true) {
      return true;
    }

    if (value === '0' || value === 0 || value === 'false' || value === false) {
      return false;
    }

    return undefined;
  });
}
