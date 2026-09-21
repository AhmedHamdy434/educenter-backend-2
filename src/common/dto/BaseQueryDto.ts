import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './PaginationDto';

export class BaseQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'كلمة البحث النصي',
    example: 'سنتر الأمل',
  })
  @IsOptional()
  @IsString()
  readonly search?: string;

  @ApiPropertyOptional({
    description: 'حقل الترتيب',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  readonly sortBy?: string;

  @ApiPropertyOptional({
    description: 'اتجاه الترتيب (asc أو desc)',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
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
   * يتم التحقق من الحقول المسموحة (allowedFields) لحماية قاعدة البيانات من أي أخطاء أو حقول غير مصرح بها.
   */
  getOrderBy<T>(
    allowedFields: string[] = [],
    defaultOrder: T = { createdAt: 'desc' } as unknown as T,
  ): T {
    if (this.sortBy && allowedFields.includes(this.sortBy)) {
      return {
        [this.sortBy]: this.sortOrder || 'desc',
      } as unknown as T;
    }

    return defaultOrder;
  }
}
