import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import 'multer';
import { UploadFolder } from '../enums/upload-folder.enum';
import { StoredFile } from '../interfaces/stored-file.interface';
import { IStorageProvider } from '../interfaces/storage-provider.interface';
import { verifyImageMagicBytes } from '../utils/image-magic-bytes.util';

/**
 * دالة مساعدة نقية لاستخراج الـ public_id من أي رابط Cloudinary.
 * تدعم الروابط القياسية، الروابط بدون version، الروابط التي تحوي Transformations، والمجلدات المتعددة.
 */
export function extractCloudinaryPublicId(
  url: string | null | undefined,
): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed.includes('cloudinary.com')) return null;

  const uploadIndex = trimmed.indexOf('/upload/');
  if (uploadIndex === -1) return null;

  // الجزء الذي يلي /upload/
  let subPath = trimmed.slice(uploadIndex + '/upload/'.length);

  // إزالة أي query parameters أو hash
  subPath = subPath.split('?')[0].split('#')[0];

  const segments = subPath.split('/');
  if (segments.length === 0) return null;

  let startIndex = 0;
  while (startIndex < segments.length) {
    const segment = segments[startIndex];
    // إذا كان الجزء يمثل رقم الإصدار (v123456789)
    if (/^v\d+$/.test(segment)) {
      startIndex++;
      break; // يبدأ الـ public_id مباشرة بعد جزء الإصدار
    }
    // إذا كان تحويلاً (transformation) مثل w_200 أو c_fill,w_300 أو fl_attachment أو q_auto
    if (/^[a-z]{1,3}_[^/]+/.test(segment) || segment.includes(',')) {
      startIndex++;
      continue;
    }
    // وصل إلى بداية مسار المجلد أو اسم الملف
    break;
  }

  const remainingSegments = segments.slice(startIndex);
  if (remainingSegments.length === 0) return null;

  const fullPathWithExt = remainingSegments.join('/');
  const lastDotIndex = fullPathWithExt.lastIndexOf('.');
  if (lastDotIndex !== -1) {
    return fullPathWithExt.slice(0, lastDotIndex);
  }

  return fullPathWithExt;
}

@Injectable()
export class CloudinaryStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(CloudinaryStorageProvider.name);
  private readonly rootFolder: string;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.rootFolder =
      this.configService.get<string>('CLOUDINARY_ROOT_FOLDER') || 'educenter';

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn(
        'بيانات اعتماد Cloudinary غير مكتملة في متغيرات البيئة (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  /**
   * رفع وحفظ صورة سحابياً على Cloudinary.
   */
  async upload(
    file: Express.Multer.File,
    folder: UploadFolder = UploadFolder.IMAGES,
  ): Promise<StoredFile> {
    if (!file || !file.buffer) {
      throw new BadRequestException('لم يتم تقديم محتوى صورة صالح للرفع.');
    }

    // 1. فحص البايتات السحرية في الذاكرة أولاً قبل إرسال أي بيانات عبر الشبكة
    const { mimetype } = verifyImageMagicBytes(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const targetFolder = `${this.rootFolder}/${folder}`;
    const fileId = randomUUID();

    // 2. ضخ الـ Buffer عبر Stream مباشرة إلى Cloudinary
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: targetFolder,
          public_id: fileId,
          resource_type: 'image',
          overwrite: true,
        },
        (error, uploadResult) => {
          if (error) {
            this.logger.error(
              `فشل رفع الصورة إلى Cloudinary: ${error.message || JSON.stringify(error)}`,
            );
            return reject(
              new BadRequestException('فشل رفع الصورة إلى Cloudinary.'),
            );
          }
          if (!uploadResult) {
            return reject(
              new BadRequestException('فشل استلام نتيجة الرفع من Cloudinary.'),
            );
          }
          resolve(uploadResult);
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });

    const format = result.format || mimetype.split('/')[1] || 'jpg';
    const filename = `${fileId}.${format}`;
    const resolvedUrl = result.secure_url || result.url;

    return {
      url: resolvedUrl,
      secure_url: resolvedUrl,
      filename,
      path: result.public_id,
      size: result.bytes ?? file.size,
      mimetype: `image/${format}`,
    };
  }

  /**
   * حذف ملف من Cloudinary بأمان وفق الـ URL.
   */
  async delete(url: string | null | undefined): Promise<boolean> {
    if (!url) return false;

    const publicId = this.extractPublicId(url);
    if (!publicId) {
      this.logger.debug(
        `تخطي حذف الرابط لأنه ليس رابط Cloudinary صالحاً: ${url}`,
      );
      return false;
    }

    try {
      const response = (await cloudinary.uploader.destroy(publicId, {
        invalidate: true,
        resource_type: 'image',
      })) as { result?: string };

      const isSuccess = response?.result === 'ok';
      if (isSuccess) {
        this.logger.log(`تم حذف الصورة من Cloudinary بنجاح: ${publicId}`);
      } else {
        this.logger.warn(
          `استجابة Cloudinary عند الحذف (${publicId}): ${response?.result}`,
        );
      }
      return isSuccess;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `فشل حذف الصورة من Cloudinary (${publicId}): ${message}`,
      );
      return false;
    }
  }

  /**
   * التحقق مما إذا كان الرابط يشير إلى ملف محلي داخل نظام التخزين الحالي.
   * دائماً false في مزود Cloudinary السحابي.
   */
  isLocalFile(url: string | null | undefined): boolean {
    if (!url) return false;
    return false;
  }

  /**
   * استخراج معرف الصورة العام (public_id) من رابط Cloudinary.
   */
  extractPublicId(url: string | null | undefined): string | null {
    return extractCloudinaryPublicId(url);
  }
}
