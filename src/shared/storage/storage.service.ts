import { Injectable, Inject } from '@nestjs/common';
import 'multer';
import { UploadFolder } from './enums/upload-folder.enum';
import { StoredFile } from './interfaces/stored-file.interface';
import type { IStorageProvider } from './interfaces/storage-provider.interface';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';

/**
 * خدمة التخزين المركزية (Facade/Context).
 * تفصل منطق الـ Business Logic تماماً عن آلية التخزين الفعلية (Local Disk, S3, etc.).
 */
@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly provider: IStorageProvider,
  ) {}

  /**
   * رفع وحفظ صورة وفق المزود المعتمد في النظام
   */
  async uploadImage(
    file: Express.Multer.File,
    folder: UploadFolder = UploadFolder.IMAGES,
  ): Promise<StoredFile> {
    return this.provider.upload(file, folder);
  }

  /**
   * حذف ملف بأمان وفق المزود المعتمد
   */
  async deleteFile(url: string | null | undefined): Promise<boolean> {
    return this.provider.delete(url);
  }

  /**
   * التحقق مما إذا كان الرابط يشير إلى ملف محلي داخل نظام التخزين الحالي
   */
  isLocalFile(url: string | null | undefined): boolean {
    return this.provider.isLocalFile(url);
  }

  /**
   * الحصول على المسار المطلق لمجلد التخزين الرئيسي
   */
  getBaseUploadDir(): string {
    return this.provider.getBaseUploadDir?.() || '';
  }
}
