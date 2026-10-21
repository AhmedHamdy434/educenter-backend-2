import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageModule } from './storage.module';
import {
  IStorageProvider,
  STORAGE_PROVIDER,
} from './interfaces/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';
import { StorageService } from './storage.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

describe('StorageModule Dynamic Provider Selection via STORAGE_DRIVER', () => {
  it('should resolve CloudinaryStorageProvider when STORAGE_DRIVER is "cloudinary"', async () => {
    const mockConfigService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) => {
          if (key === 'STORAGE_DRIVER') return 'cloudinary';
          if (key === 'CLOUDINARY_CLOUD_NAME') return 'demo';
          if (key === 'CLOUDINARY_API_KEY') return '123';
          if (key === 'CLOUDINARY_API_SECRET') return 'abc';
          return defaultValue ?? null;
        }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    const provider: IStorageProvider =
      moduleRef.get<IStorageProvider>(STORAGE_PROVIDER);
    const service: StorageService =
      moduleRef.get<StorageService>(StorageService);

    expect(provider).toBeInstanceOf(CloudinaryStorageProvider);
    expect(service).toBeDefined();
  });

  it('should resolve LocalStorageProvider when STORAGE_DRIVER is "local"', async () => {
    const mockConfigService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) => {
          if (key === 'STORAGE_DRIVER') return 'local';
          if (key === 'UPLOAD_DIR') return 'uploads';
          return defaultValue ?? null;
        }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    const provider: IStorageProvider =
      moduleRef.get<IStorageProvider>(STORAGE_PROVIDER);
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it('should fallback to LocalStorageProvider when STORAGE_DRIVER is empty or undefined', async () => {
    const mockConfigService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) => {
          if (key === 'UPLOAD_DIR') return 'uploads';
          return defaultValue ?? null;
        }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    const provider: IStorageProvider =
      moduleRef.get<IStorageProvider>(STORAGE_PROVIDER);
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });
});
