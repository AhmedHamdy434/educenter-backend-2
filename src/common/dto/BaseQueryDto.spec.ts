import 'reflect-metadata';
import { BaseQueryDto } from './BaseQueryDto';

describe('BaseQueryDto', () => {
  it('should generate insensitive OR search query using getWhere', () => {
    const dto = new BaseQueryDto();
    (dto as any).search = 'alex';

    const where = dto.getWhere(['name', 'email']);
    expect(where).toEqual({
      OR: [
        { name: { contains: 'alex', mode: 'insensitive' } },
        { email: { contains: 'alex', mode: 'insensitive' } },
      ],
    });
  });

  it('should return default order if sortBy is not specified', () => {
    const dto = new BaseQueryDto();
    const orderBy = dto.getOrderBy(['name', 'createdAt']);

    expect(orderBy).toEqual({ createdAt: 'desc' });
  });

  it('should return custom default order if provided and sortBy is not specified', () => {
    const dto = new BaseQueryDto();
    const orderBy = dto.getOrderBy(
      ['name'],
      [{ order: 'asc' }, { createdAt: 'desc' }],
    );

    expect(orderBy).toEqual([{ order: 'asc' }, { createdAt: 'desc' }]);
  });

  it('should return mapped orderBy when sortBy is in allowedFields', () => {
    const dto = new BaseQueryDto();
    (dto as any).sortBy = 'name';
    (dto as any).sortOrder = 'asc';

    const orderBy = dto.getOrderBy(['name', 'createdAt']);
    expect(orderBy).toEqual({ name: 'asc' });
  });

  it('should fall back to default order if sortBy is not in allowedFields', () => {
    const dto = new BaseQueryDto();
    (dto as any).sortBy = 'unauthorized_column';
    (dto as any).sortOrder = 'asc';

    const orderBy = dto.getOrderBy(['name', 'createdAt']);
    expect(orderBy).toEqual({ createdAt: 'desc' });
  });

  it('should return relation count order when sortBy is in relationCountFields array', () => {
    const dto = new BaseQueryDto();
    (dto as any).sortBy = 'subjects';
    (dto as any).sortOrder = 'desc';

    const orderBy = dto.getOrderBy(
      ['name', 'createdAt'],
      { createdAt: 'desc' },
      ['subjects', 'groups', 'enrollments'],
    );
    expect(orderBy).toEqual({ subjects: { _count: 'desc' } });
  });

  it('should return mapped relation count order when relationCountFields is a map', () => {
    const dto = new BaseQueryDto();
    (dto as any).sortBy = 'studentsCount';
    (dto as any).sortOrder = 'asc';

    const orderBy = dto.getOrderBy(
      ['name', 'createdAt'],
      { createdAt: 'desc' },
      { studentsCount: 'enrollments', subjectsCount: 'subjects' },
    );
    expect(orderBy).toEqual({ enrollments: { _count: 'asc' } });
  });
});
