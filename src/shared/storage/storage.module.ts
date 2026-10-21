import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';
import { StorageDriver } from './enums/storage-driver.enum';

const logger = new Logger('StorageModule');

@Module({
  imports: [ConfigModule],
  providers: [
    LocalStorageProvider,
    CloudinaryStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (
        configService: ConfigService,
        localProvider: LocalStorageProvider,
        cloudinaryProvider: CloudinaryStorageProvider,
      ) => {
        const rawDriver =
          configService.get<string>('STORAGE_DRIVER') ||
          configService.get<string>('STORAGE_TYPE') ||
          StorageDriver.LOCAL;

        const driver = rawDriver.toLowerCase().trim();

        if (driver === (StorageDriver.CLOUDINARY as string)) {
          logger.log('Active Storage Provider: CLOUDINARY');
          return cloudinaryProvider;
        }

        logger.log('Active Storage Provider: LOCAL');
        return localProvider;
      },
      inject: [ConfigService, LocalStorageProvider, CloudinaryStorageProvider],
    },
    StorageService,
  ],
  exports: [
    StorageService,
    STORAGE_PROVIDER,
    LocalStorageProvider,
    CloudinaryStorageProvider,
  ],
})
export class StorageModule {}
