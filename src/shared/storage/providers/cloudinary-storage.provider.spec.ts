import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import {
  CloudinaryStorageProvider,
  extractCloudinaryPublicId,
} from './cloudinary-storage.provider';
import { UploadFolder } from '../enums/upload-folder.enum';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

describe('CloudinaryStorageProvider', () => {
  let provider: CloudinaryStorageProvider;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      switch (key) {
        case 'CLOUDINARY_CLOUD_NAME':
          return 'test-cloud';
        case 'CLOUDINARY_API_KEY':
          return 'test-api-key';
        case 'CLOUDINARY_API_SECRET':
          return 'test-api-secret';
        case 'CLOUDINARY_ROOT_FOLDER':
          return 'educenter';
        default:
          return null;
      }
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudinaryStorageProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    provider = module.get<CloudinaryStorageProvider>(CloudinaryStorageProvider);
  });

  describe('Initialization & Configuration', () => {
    it('should configure cloudinary with config values', () => {
      expect(provider).toBeDefined();
      expect(cloudinary.config).toHaveBeenCalledWith({
        cloud_name: 'test-cloud',
        api_key: 'test-api-key',
        api_secret: 'test-api-secret',
      });
    });

    it('should warn when credentials are missing', async () => {
      const emptyConfigService = {
        get: jest.fn().mockReturnValue(null),
      };

      const module = await Test.createTestingModule({
        providers: [
          CloudinaryStorageProvider,
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();

      const instance = module.get<CloudinaryStorageProvider>(
        CloudinaryStorageProvider,
      );
      expect(instance).toBeDefined();
    });
  });

  describe('extractCloudinaryPublicId', () => {
    it('should extract public_id from standard versioned URL', () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/v1710000000/educenter/centers/sample.jpg';
      expect(extractCloudinaryPublicId(url)).toBe('educenter/centers/sample');
    });

    it('should extract public_id from unversioned URL', () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/educenter/centers/sample.png';
      expect(extractCloudinaryPublicId(url)).toBe('educenter/centers/sample');
    });

    it('should extract public_id from URL with transformations and version', () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/w_200,h_200,c_fill/v1710000000/educenter/users/avatar.jpg';
      expect(extractCloudinaryPublicId(url)).toBe('educenter/users/avatar');
    });

    it('should extract public_id from URL with transformations without version', () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/w_300,c_limit/educenter/plans/banner.webp';
      expect(extractCloudinaryPublicId(url)).toBe('educenter/plans/banner');
    });

    it('should extract public_id from root-level file', () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/sample.jpg';
      expect(extractCloudinaryPublicId(url)).toBe('sample');
    });

    it('should return null for non-cloudinary URLs', () => {
      expect(
        extractCloudinaryPublicId(
          'http://localhost:3000/uploads/centers/1.jpg',
        ),
      ).toBeNull();
      expect(
        extractCloudinaryPublicId('https://google.com/logo.png'),
      ).toBeNull();
    });

    it('should return null for null, undefined, or empty strings', () => {
      expect(extractCloudinaryPublicId(null)).toBeNull();
      expect(extractCloudinaryPublicId(undefined)).toBeNull();
      expect(extractCloudinaryPublicId('')).toBeNull();
    });
  });

  describe('upload', () => {
    it('should successfully upload a valid JPEG buffer to Cloudinary', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const mockFile = {
        buffer: jpegBuffer,
        originalname: 'logo.jpg',
        mimetype: 'image/jpeg',
        size: jpegBuffer.length,
      } as Express.Multer.File;

      const mockUploadResponse = {
        secure_url:
          'https://res.cloudinary.com/test-cloud/image/upload/v1234/educenter/centers/new-uuid.jpg',
        url: 'http://res.cloudinary.com/test-cloud/image/upload/v1234/educenter/centers/new-uuid.jpg',
        public_id: 'educenter/centers/new-uuid',
        format: 'jpg',
        bytes: 12,
      };

      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (
          _options: unknown,
          callback: (err: Error | null, res: unknown) => void,
        ) => {
          return {
            write: jest.fn(),
            end: jest.fn(() => {
              callback(null, mockUploadResponse);
            }),
            on: jest.fn(),
            once: jest.fn(),
            emit: jest.fn(),
          };
        },
      );

      const result = await provider.upload(mockFile, UploadFolder.CENTERS);

      expect(result.url).toBe(mockUploadResponse.secure_url);
      expect(result.secure_url).toBe(mockUploadResponse.secure_url);
      expect(result.path).toBe(mockUploadResponse.public_id);
      expect(result.mimetype).toBe('image/jpg');
      expect(result.size).toBe(12);
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'educenter/centers',
          resource_type: 'image',
          overwrite: true,
        }),
        expect.any(Function),
      );
    });

    it('should reject SVG upload and NOT call Cloudinary', async () => {
      const svgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      const mockFile = {
        buffer: svgBuffer,
        originalname: 'vector.svg',
        mimetype: 'image/svg+xml',
        size: svgBuffer.length,
      } as Express.Multer.File;

      await expect(
        provider.upload(mockFile, UploadFolder.CENTERS),
      ).rejects.toThrow(BadRequestException);

      expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    });

    it('should reject invalid or spoofed files without calling Cloudinary', async () => {
      const fakeBuffer = Buffer.from('not an image content at all');
      const mockFile = {
        buffer: fakeBuffer,
        originalname: 'fake.png',
        mimetype: 'image/png',
        size: fakeBuffer.length,
      } as Express.Multer.File;

      await expect(
        provider.upload(mockFile, UploadFolder.CENTERS),
      ).rejects.toThrow(BadRequestException);

      expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    });

    it('should reject when file or buffer is missing', async () => {
      await expect(
        provider.upload(null as unknown as Express.Multer.File),
      ).rejects.toThrow(
        new BadRequestException('لم يتم تقديم محتوى صورة صالح للرفع.'),
      );
    });

    it('should handle Cloudinary upload error gracefully', async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const mockFile = {
        buffer: pngBuffer,
        originalname: 'logo.png',
        mimetype: 'image/png',
        size: pngBuffer.length,
      } as Express.Multer.File;

      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (
          _options: unknown,
          callback: (err: Error | null, res: unknown) => void,
        ) => {
          return {
            write: jest.fn(),
            end: jest.fn(() => {
              callback(new Error('Cloudinary connection timeout'), null);
            }),
            on: jest.fn(),
            once: jest.fn(),
            emit: jest.fn(),
          };
        },
      );

      await expect(
        provider.upload(mockFile, UploadFolder.CENTERS),
      ).rejects.toThrow(
        new BadRequestException('فشل رفع الصورة إلى Cloudinary.'),
      );
    });
  });

  describe('delete', () => {
    it('should successfully delete an existing Cloudinary image and return true', async () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/v1234/educenter/centers/sample.jpg';
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
        result: 'ok',
      });

      const result = await provider.delete(url);

      expect(result).toBe(true);
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'educenter/centers/sample',
        expect.objectContaining({ invalidate: true, resource_type: 'image' }),
      );
    });

    it('should return false if Cloudinary responds with not found', async () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/v1234/educenter/centers/missing.jpg';
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
        result: 'not found',
      });

      const result = await provider.delete(url);
      expect(result).toBe(false);
    });

    it('should return false safely without throwing when Cloudinary destroy errors', async () => {
      const url =
        'https://res.cloudinary.com/test-cloud/image/upload/v1234/educenter/centers/sample.jpg';
      (cloudinary.uploader.destroy as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      const result = await provider.delete(url);
      expect(result).toBe(false);
    });

    it('should return false and skip non-cloudinary URLs', async () => {
      const result = await provider.delete('/uploads/centers/sample.jpg');
      expect(result).toBe(false);
      expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    });

    it('should return false for null, undefined, or empty string', async () => {
      expect(await provider.delete(null)).toBe(false);
      expect(await provider.delete(undefined)).toBe(false);
      expect(await provider.delete('')).toBe(false);
    });
  });

  describe('isLocalFile', () => {
    it('should always return false for Cloudinary provider', () => {
      expect(
        provider.isLocalFile(
          'https://res.cloudinary.com/test-cloud/image/upload/sample.jpg',
        ),
      ).toBe(false);
      expect(provider.isLocalFile('/uploads/centers/sample.jpg')).toBe(false);
      expect(provider.isLocalFile(null)).toBe(false);
    });
  });
});
