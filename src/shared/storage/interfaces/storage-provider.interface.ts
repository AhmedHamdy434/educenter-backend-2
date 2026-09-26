import 'multer';
import { UploadFolder } from '../enums/upload-folder.enum';
import { StoredFile } from './stored-file.interface';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

/**
 * العقد المشترك لجميع مزودي التخزين (Local Disk, S3, Cloudinary, etc.)
 */
export interface IStorageProvider {
  /**
   * رفع وحفظ ملف الصورة وفق استراتيجية المزود
   */
  upload(file: Express.Multer.File, folder: UploadFolder): Promise<StoredFile>;

  /**
   * حذف ملف بأمان وفق استراتيجية المزود
   */
  delete(url: string | null | undefined): Promise<boolean>;

  /**
   * التحقق مما إذا كان الرابط تابعاً لنظام التخزين المحلي
   */
  isLocalFile(url: string | null | undefined): boolean;

  /**
   * الحصول على مسار التخزين الأساسي (إن كان مدعوماً من المزود)
   */
  getBaseUploadDir?(): string;
}
