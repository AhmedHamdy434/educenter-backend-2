import { Test, TestingModule } from '@nestjs/testing';
import { CentersService } from './centers.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CloudinaryService } from '../../shared/cloudinary/cloudinary.service';

describe('CentersService', () => {
  let service: CentersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CentersService,
        {
          provide: PrismaService,
          useValue: {
            center: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: CloudinaryService,
          useValue: {
            uploadImage: jest.fn(),
            deleteFile: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CentersService>(CentersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
