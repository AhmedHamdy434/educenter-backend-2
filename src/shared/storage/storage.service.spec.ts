import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { UploadFolder } from './enums/upload-folder.enum';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';

describe('StorageService with Strategy Pattern (LocalStorageProvider)', () => {
  let service: StorageService;
  let provider: LocalStorageProvider;
  const testUploadDir = path.resolve(__dirname, '../../../test-uploads');

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'UPLOAD_DIR') return testUploadDir;
      return null;
    }),
  };

  beforeAll(() => {
    if (!fs.existsSync(testUploadDir)) {
      fs.mkdirSync(testUploadDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(testUploadDir)) {
      await fs.promises.rm(testUploadDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalStorageProvider,
        {
          provide: STORAGE_PROVIDER,
          useExisting: LocalStorageProvider,
        },
        StorageService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    provider = module.get<LocalStorageProvider>(LocalStorageProvider);
  });

  it('should be defined and delegate to STORAGE_PROVIDER', () => {
    expect(service).toBeDefined();
    expect(provider).toBeDefined();
  });

  describe('verifyImageMagicBytes & uploadImage via Strategy', () => {
    it('should successfully upload a valid JPEG image', async () => {
      // JPEG Magic bytes: FF D8 FF E0 + padding
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const mockFile = {
        buffer: jpegBuffer,
        originalname: 'my-photo.jpg',
        mimetype: 'image/jpeg',
        size: jpegBuffer.length,
      } as Express.Multer.File;

      const result = await service.uploadImage(mockFile, UploadFolder.CENTERS);

      expect(result.url).toMatch(/^\/uploads\/centers\/[a-f0-9-]+\.jpg$/);
      expect(result.mimetype).toBe('image/jpeg');
      expect(fs.existsSync(result.path)).toBe(true);

      // Cleanup
      await fs.promises.unlink(result.path);
    });

    it('should successfully upload a valid PNG image', async () => {
      // PNG Magic bytes: 89 50 4E 47 0D 0A 1A 0A + padding
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const mockFile = {
        buffer: pngBuffer,
        originalname: 'logo.png',
        mimetype: 'image/png',
        size: pngBuffer.length,
      } as Express.Multer.File;

      const result = await service.uploadImage(mockFile, UploadFolder.CENTERS);

      expect(result.url).toMatch(/^\/uploads\/centers\/[a-f0-9-]+\.png$/);
      expect(result.mimetype).toBe('image/png');
      expect(fs.existsSync(result.path)).toBe(true);

      // Cleanup
      await fs.promises.unlink(result.path);
    });

    it('should successfully upload a valid WEBP image with exact offset check', async () => {
      // WEBP Magic bytes: 0-3: 'RIFF', 4-7: size (4 bytes), 8-11: 'WEBP'
      const webpBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // 'RIFF'
        0x20,
        0x00,
        0x00,
        0x00, // file length bytes
        0x57,
        0x45,
        0x42,
        0x50, // 'WEBP'
      ]);
      const mockFile = {
        buffer: webpBuffer,
        originalname: 'banner.webp',
        mimetype: 'image/webp',
        size: webpBuffer.length,
      } as Express.Multer.File;

      const result = await service.uploadImage(mockFile, UploadFolder.CENTERS);

      expect(result.url).toMatch(/^\/uploads\/centers\/[a-f0-9-]+\.webp$/);
      expect(result.mimetype).toBe('image/webp');
      expect(fs.existsSync(result.path)).toBe(true);

      // Cleanup
      await fs.promises.unlink(result.path);
    });

    it('should successfully upload a valid GIF image', async () => {
      // GIF Magic bytes: 47 49 46 38 + padding
      const gifBuffer = Buffer.from([
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
      ]);
      const mockFile = {
        buffer: gifBuffer,
        originalname: 'animated.gif',
        mimetype: 'image/gif',
        size: gifBuffer.length,
      } as Express.Multer.File;

      const result = await service.uploadImage(mockFile, UploadFolder.CENTERS);

      expect(result.url).toMatch(/^\/uploads\/centers\/[a-f0-9-]+\.gif$/);
      expect(result.mimetype).toBe('image/gif');
      expect(fs.existsSync(result.path)).toBe(true);

      // Cleanup
      await fs.promises.unlink(result.path);
    });

    it('should reject SVG upload with a clear, specific security error message', async () => {
      const svgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      const mockFile = {
        buffer: svgBuffer,
        originalname: 'icon.svg',
        mimetype: 'image/svg+xml',
        size: svgBuffer.length,
      } as Express.Multer.File;

      await expect(
        service.uploadImage(mockFile, UploadFolder.CENTERS),
      ).rejects.toThrow(
        new BadRequestException(
          'صيغة SVG غير مدعومة لدواعي الأمان، يرجى استخدام إحدى الصيغ التالية: JPG، PNG، WEBP، GIF.',
        ),
      );
    });

    it('should detect and reject disguised SVG files even with a .png extension', async () => {
      const svgBuffer = Buffer.from(
        '<?xml version="1.0"?><svg onload="alert(1)"></svg>',
      );
      const mockFile = {
        buffer: svgBuffer,
        originalname: 'avatar.png',
        mimetype: 'image/png',
        size: svgBuffer.length,
      } as Express.Multer.File;

      await expect(
        service.uploadImage(mockFile, UploadFolder.CENTERS),
      ).rejects.toThrow(
        new BadRequestException(
          'صيغة SVG غير مدعومة لدواعي الأمان، يرجى استخدام إحدى الصيغ التالية: JPG، PNG، WEBP، GIF.',
        ),
      );
    });

    it('should reject spoofed non-image files claiming to be images', async () => {
      const textBuffer = Buffer.from(
        'This is a plain text or executable file disguised as a JPEG',
      );
      const mockFile = {
        buffer: textBuffer,
        originalname: 'malicious.jpg',
        mimetype: 'image/jpeg',
        size: textBuffer.length,
      } as Express.Multer.File;

      await expect(
        service.uploadImage(mockFile, UploadFolder.CENTERS),
      ).rejects.toThrow(
        new BadRequestException(
          'محتوى الملف غير صالح أو لا يتطابق مع صيغ الصور المسموحة (JPG، PNG، WEBP، GIF).',
        ),
      );
    });

    it('should reject files with buffers smaller than 12 bytes', async () => {
      const tinyBuffer = Buffer.from([0x01, 0x02, 0x03]);
      const mockFile = {
        buffer: tinyBuffer,
        originalname: 'tiny.jpg',
        mimetype: 'image/jpeg',
        size: tinyBuffer.length,
      } as Express.Multer.File;

      await expect(
        service.uploadImage(mockFile, UploadFolder.CENTERS),
      ).rejects.toThrow(
        new BadRequestException('محتوى الصورة المرفوعة تالف أو غير صالح.'),
      );
    });
  });

  describe('isLocalFile', () => {
    it('should return false for Cloudinary URLs', () => {
      expect(
        service.isLocalFile(
          'https://res.cloudinary.com/demo/image/upload/v12345/centers/logo.jpg',
        ),
      ).toBe(false);
    });

    it('should return false for generic remote URLs', () => {
      expect(service.isLocalFile('http://example.com/logo.png')).toBe(false);
      expect(service.isLocalFile('https://example.com/logo.png')).toBe(false);
    });

    it('should return false for null, undefined, or empty string', () => {
      expect(service.isLocalFile(null)).toBe(false);
      expect(service.isLocalFile(undefined)).toBe(false);
      expect(service.isLocalFile('')).toBe(false);
    });

    it('should return true for local upload paths', () => {
      expect(service.isLocalFile('/uploads/centers/sample.jpg')).toBe(true);
      expect(service.isLocalFile('uploads/centers/sample.jpg')).toBe(true);
    });
  });

  describe('deleteFile', () => {
    it('should NOT attempt to delete remote or Cloudinary files and return false', async () => {
      const cloudinaryUrl =
        'https://res.cloudinary.com/demo/image/upload/v12345/centers/old-logo.jpg';
      const result = await service.deleteFile(cloudinaryUrl);
      expect(result).toBe(false);
    });

    it('should successfully delete an existing local file and return true', async () => {
      // First create a file
      const dummyFile = path.join(testUploadDir, 'centers', 'delete-me.jpg');
      await fs.promises.mkdir(path.dirname(dummyFile), { recursive: true });
      await fs.promises.writeFile(dummyFile, 'content');

      const result = await service.deleteFile('/uploads/centers/delete-me.jpg');
      expect(result).toBe(true);
      expect(fs.existsSync(dummyFile)).toBe(false);
    });

    it('should return false when trying to delete a non-existent local file', async () => {
      const result = await service.deleteFile('/uploads/centers/not-found.jpg');
      expect(result).toBe(false);
    });

    it('should prevent path traversal attempts during deletion', async () => {
      const result = await service.deleteFile(
        '/uploads/../../sensitive-file.txt',
      );
      expect(result).toBe(false);
    });
  });

  describe('StorageService with CloudinaryStorageProvider strategy delegation', () => {
    let cloudinaryService: StorageService;
    const mockCloudinaryProvider = {
      upload: jest.fn(),
      delete: jest.fn(),
      isLocalFile: jest.fn().mockReturnValue(false),
      getBaseUploadDir: jest.fn().mockReturnValue(''),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: STORAGE_PROVIDER,
            useValue: mockCloudinaryProvider,
          },
        ],
      }).compile();

      cloudinaryService = module.get<StorageService>(StorageService);
    });

    it('should delegate uploadImage to Cloudinary provider', async () => {
      const mockFile = { buffer: Buffer.from('test') } as Express.Multer.File;
      const expectedResult = {
        url: 'https://res.cloudinary.com/test/image/upload/sample.jpg',
        secure_url: 'https://res.cloudinary.com/test/image/upload/sample.jpg',
        filename: 'sample.jpg',
        path: 'sample',
        size: 4,
        mimetype: 'image/jpeg',
      };
      mockCloudinaryProvider.upload.mockResolvedValue(expectedResult);

      const res = await cloudinaryService.uploadImage(
        mockFile,
        UploadFolder.CENTERS,
      );

      expect(res).toEqual(expectedResult);
      expect(mockCloudinaryProvider.upload).toHaveBeenCalledWith(
        mockFile,
        UploadFolder.CENTERS,
      );
    });

    it('should delegate deleteFile to Cloudinary provider', async () => {
      mockCloudinaryProvider.delete.mockResolvedValue(true);

      const res = await cloudinaryService.deleteFile(
        'https://res.cloudinary.com/test/image/upload/sample.jpg',
      );

      expect(res).toBe(true);
      expect(mockCloudinaryProvider.delete).toHaveBeenCalledWith(
        'https://res.cloudinary.com/test/image/upload/sample.jpg',
      );
    });

    it('should delegate isLocalFile to Cloudinary provider', () => {
      expect(
        cloudinaryService.isLocalFile('https://res.cloudinary.com/...'),
      ).toBe(false);
      expect(mockCloudinaryProvider.isLocalFile).toHaveBeenCalled();
    });
  });
});
