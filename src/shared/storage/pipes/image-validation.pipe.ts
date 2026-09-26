import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';
import 'multer';
import { verifyImageMagicBytes } from '../utils/image-magic-bytes.util';

export const MAX_IMAGE_SIZE_MB = 5;
export const MAX_IMAGE_SIZE = MAX_IMAGE_SIZE_MB * 1024 * 1024;

@Injectable()
export class ImageValidationPipeInstance implements PipeTransform<
  Express.Multer.File | undefined,
  Express.Multer.File | undefined
> {
  constructor(private readonly required: boolean = true) {}

  transform(file?: Express.Multer.File): Express.Multer.File | undefined {
    // 1. إذا كان الملف اختيارياً ولم يتم إرساله
    if (!file) {
      if (this.required) {
        throw new BadRequestException('يرجى اختيار صورة للرفع.');
      }
      return undefined;
    }

    // 2. التحقق من حجم الملف
    if (file.size > MAX_IMAGE_SIZE) {
      throw new BadRequestException(
        `حجم الصورة يجب ألا يتجاوز ${MAX_IMAGE_SIZE_MB} ميجابايت.`,
      );
    }

    // 3. التحقق من الـ Magic Bytes ومنع SVG وتزييف الـ MIME
    if (!file.buffer) {
      throw new BadRequestException('فشل قراءة محتوى الملف المرفوع.');
    }

    verifyImageMagicBytes(file.buffer, file.originalname, file.mimetype);

    return file;
  }
}

/**
 * دالة مصنعية لإنشاء Pipe التحقق من الصور مع تحديد ما إذا كان الملف إلزامياً أم اختيارياً.
 * مثال: `@UploadedFile(ImageValidationPipe(false)) logo?: Express.Multer.File`
 */
export function ImageValidationPipe(required = true): PipeTransform {
  return new ImageValidationPipeInstance(required);
}
