import { Injectable, Inject } from '@nestjs/common';
import 'multer';
import { UploadFolder } from './enums/upload-folder.enum';
import { StoredFile } from './interfaces/stored-file.interface';
import type { IStorageProvider } from './interfaces/storage-provider.interface';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly provider: IStorageProvider,
  ) {}

  async uploadImage(
    file: Express.Multer.File,
    folder: UploadFolder = UploadFolder.IMAGES,
  ): Promise<StoredFile> {
    return this.provider.upload(file, folder);
  }

  async deleteFile(url: string | null | undefined): Promise<boolean> {
    return this.provider.delete(url);
  }

  isLocalFile(url: string | null | undefined): boolean {
    return this.provider.isLocalFile(url);
  }

  getBaseUploadDir(): string {
    return this.provider.getBaseUploadDir?.() || '';
  }
}
