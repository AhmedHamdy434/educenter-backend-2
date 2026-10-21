import 'multer';
import { UploadFolder } from '../enums/upload-folder.enum';
import { StoredFile } from './stored-file.interface';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface IStorageProvider {
  upload(file: Express.Multer.File, folder: UploadFolder): Promise<StoredFile>;

  delete(url: string | null | undefined): Promise<boolean>;

  isLocalFile(url: string | null | undefined): boolean;

  getBaseUploadDir?(): string;
}
