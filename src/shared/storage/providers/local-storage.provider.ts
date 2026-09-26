import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import 'multer';
import { UploadFolder } from '../enums/upload-folder.enum';
import { StoredFile } from '../interfaces/stored-file.interface';
import { IStorageProvider } from '../interfaces/storage-provider.interface';
import { verifyImageMagicBytes } from '../utils/image-magic-bytes.util';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseUploadDir: string;

  constructor(private readonly configService: ConfigService) {
    const configuredDir =
      this.configService.get<string>('UPLOAD_DIR') || 'uploads';
    this.baseUploadDir = path.isAbsolute(configuredDir)
      ? configuredDir
      : path.resolve(process.cwd(), configuredDir);

    // التأكد من وجود المجلد الجذري للتخزين
    if (!fs.existsSync(this.baseUploadDir)) {
      try {
        fs.mkdirSync(this.baseUploadDir, { recursive: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`فشل إنشاء مجلد التخزين: ${message}`);
      }
    }
  }

  /**
   * رفع وحفظ صورة محلياً على القرص.
   */
  async upload(
    file: Express.Multer.File,
    folder: UploadFolder = UploadFolder.IMAGES,
  ): Promise<StoredFile> {
    if (!file || !file.buffer) {
      throw new BadRequestException('لم يتم تقديم محتوى صورة صالح للرفع.');
    }

    // 1. فحص البايتات السحرية في الذاكرة أولاً قبل أي كتابة على القرص
    const { extension, mimetype } = verifyImageMagicBytes(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    // 2. التحقق من سلامة مسار المجلد لمنع Path Traversal
    const targetDir = path.resolve(this.baseUploadDir, folder);
    if (
      !targetDir.startsWith(this.baseUploadDir) ||
      folder.includes('..') ||
      folder.includes('/') ||
      folder.includes('\\')
    ) {
      throw new BadRequestException('مجلد التخزين المحدد غير صالح.');
    }

    // التأكد من وجود المجلد الفرعي
    await fs.promises.mkdir(targetDir, { recursive: true });

    // 3. توليد اسم فريد باستخدام UUID والامتداد الموثق
    const filename = `${randomUUID()}${extension}`;
    const targetFilePath = path.resolve(targetDir, filename);

    // التحقق الأمني الإضافي من مسار الملف
    if (!targetFilePath.startsWith(targetDir)) {
      throw new BadRequestException('مسار حفظ الملف غير صالح.');
    }

    // 4. كتابة الملف في القرص بعد اجتياز كافة الفحوصات
    await fs.promises.writeFile(targetFilePath, file.buffer);

    // 5. بناء الـ URL النسبي المتاح عبر useStaticAssets
    const url = `/uploads/${folder}/${filename}`;

    return {
      url,
      secure_url: url, // للتوافق التام مع أي كود كان يعتمد على خاصية Cloudinary
      filename,
      path: targetFilePath,
      size: file.size,
      mimetype,
    };
  }

  /**
   * حذف ملف محلي بأمان.
   */
  async delete(url: string | null | undefined): Promise<boolean> {
    if (!url || !this.isLocalFile(url)) {
      if (url) {
        this.logger.debug(
          `تم تخطي حذف الرابط الخارجي أو السحابي للحفاظ على البيانات القديمة: ${url}`,
        );
      }
      return false;
    }

    try {
      // تطبيع المسار النسبي: إزالة أي /uploads/ أو uploads/ من البداية
      const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
      const normalizedSubPath = cleanUrl.replace(/^uploads[/\\]/, '');

      const absolutePath = path.resolve(this.baseUploadDir, normalizedSubPath);

      // حماية ضد Path Traversal
      if (!absolutePath.startsWith(this.baseUploadDir)) {
        this.logger.warn(`محاولة مسار غير آمن في delete: ${url}`);
        return false;
      }

      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
        this.logger.log(`تم حذف الملف المحلي بنجاح: ${absolutePath}`);
        return true;
      }

      return false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`فشل حذف الملف المحلي (${url}): ${message}`);
      return false;
    }
  }

  /**
   * التحقق مما إذا كان الرابط يشير إلى ملف محلي داخل نظام التخزين الحالي.
   */
  isLocalFile(url: string | null | undefined): boolean {
    if (!url) return false;
    const trimmed = url.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.includes('cloudinary.com')
    ) {
      return false;
    }
    return trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/');
  }

  /**
   * الحصول على المسار المطلق لمجلد التخزين الرئيسي.
   */
  getBaseUploadDir(): string {
    return this.baseUploadDir;
  }
}
