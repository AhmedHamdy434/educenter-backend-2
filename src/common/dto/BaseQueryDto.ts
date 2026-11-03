import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './PaginationDto';

export class BaseQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  readonly search?: string;

  @IsOptional()
  @IsString()
  readonly sortBy?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsIn(['asc', 'desc'], {
    message: 'اتجاه الترتيب يجب أن يكون إما asc أو desc.',
  })
  readonly sortOrder?: 'asc' | 'desc' = 'desc';

  /**
   * إنشاء كائن التصفية (where) لـ Prisma بشكل تلقائي للبحث وتجنب التكرار.
   */
  getWhere<T extends { OR?: any[] }>(searchFields: string[] = []): T {
    const where: { OR?: any[] } = {};

    if (this.search && searchFields.length > 0) {
      where.OR = searchFields.map((field) => ({
        [field]: { contains: this.search, mode: 'insensitive' },
      }));
    }

    return where as T;
  }

  /**
   * إنشاء كائن الترتيب (orderBy) لـ Prisma بشكل آمن وموحد.
   * يتم التحقق من الحقول المسموحة (allowedFields) وحقول عد العلاقات (relationCountFields)
   * لحماية قاعدة البيانات من أي أخطاء أو حقول غير مصرح بها.
   */
  getOrderBy<T>(
    allowedFields: string[] = [],
    defaultOrder: T = { createdAt: 'desc' } as unknown as T,
    relationCountFields: string[] | Record<string, string> = [],
  ): T {
    if (this.sortBy) {
      if (Array.isArray(relationCountFields)) {
        if (relationCountFields.includes(this.sortBy)) {
          return {
            [this.sortBy]: { _count: this.sortOrder || 'desc' },
          } as unknown as T;
        }
      } else if (this.sortBy in relationCountFields) {
        const relationKey = relationCountFields[this.sortBy];
        return {
          [relationKey]: { _count: this.sortOrder || 'desc' },
        } as unknown as T;
      }

      if (allowedFields.includes(this.sortBy)) {
        return {
          [this.sortBy]: this.sortOrder || 'desc',
        } as unknown as T;
      }
    }

    return defaultOrder;
  }
}
