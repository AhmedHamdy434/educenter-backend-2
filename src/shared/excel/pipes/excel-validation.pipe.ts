import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

export interface ExcelValidationPipeOptions {
  required?: boolean;
  maxSizeBytes?: number;
}

const DEFAULT_MAX_SIZE = 3 * 1024 * 1024; // 3 ميجابايت كحد أقصى موحد
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

@Injectable()
export class ExcelValidationPipe implements PipeTransform {
  private readonly required: boolean;
  private readonly maxSizeBytes: number;

  constructor(options?: ExcelValidationPipeOptions) {
    this.required = options?.required ?? true;
    this.maxSizeBytes = options?.maxSizeBytes ?? DEFAULT_MAX_SIZE;
  }

  transform(file?: Express.Multer.File): Express.Multer.File {
    if (!file) {
      if (this.required) {
        throw new BadRequestException('يرجى اختيار ملف Excel للرفع.');
      }
      return file as unknown as Express.Multer.File;
    }

    // 1. التحقق من وجود الـ Buffer
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('الملف المرفوع فارغ تماماً.');
    }

    // 2. التحقق من الحجم الأقصى
    if (file.size > this.maxSizeBytes) {
      const maxMb = Math.round(this.maxSizeBytes / (1024 * 1024));
      throw new BadRequestException(
        `حجم الملف يتجاوز الحد الأقصى المسموح به (${maxMb} ميجابايت).`,
      );
    }

    // 3. التحقق من امتداد الملف
    const originalName = file.originalname || '';
    const hasValidExtension = /\.xlsx$/i.test(originalName);
    if (!hasValidExtension) {
      throw new BadRequestException(
        'امتداد الملف غير صالح. يرجى رفع ملف بصيغة Excel (.xlsx).',
      );
    }

    // 4. فحص الـ Magic Bytes (توقيع ملف الـ ZIP الأصلي PK\x03\x04)
    if (file.buffer.length < 4) {
      throw new BadRequestException('محتوى الملف غير صالح أو تالف.');
    }

    const isZip = ZIP_MAGIC_BYTES.every(
      (byte, index) => file.buffer[index] === byte,
    );

    if (!isZip) {
      throw new BadRequestException(
        'هيكل الملف غير سليم أو تم تغيير امتداده بشكل غير صالح. يرجى رفع ملف Excel سليم.',
      );
    }

    return file;
  }
}
