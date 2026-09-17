import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { WhatsAppService } from './whatsapp.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { NotificationQueryDto } from './dto/get-notifications.dto';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let whatsAppService: jest.Mocked<Partial<WhatsAppService>>;
  let prismaService: {
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    whatsAppService = {
      sendMessage: jest.fn().mockResolvedValue(true),
    };

    prismaService = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: WhatsAppService,
          useValue: whatsAppService,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAndDispatch', () => {
    it('should send WhatsApp message and save notification in database', async () => {
      prismaService.notification.create.mockResolvedValueOnce({
        id: 'notif-1',
        title: 'Absence Alert',
        isSent: true,
      });

      const result = await service.createAndDispatch({
        centerId: 'center-1',
        recipientPhone: '01000000000',
        title: 'Absence Alert',
        message: 'Student was absent',
        type: NotificationType.ATTENDANCE_ABSENCE,
      });

      expect(whatsAppService.sendMessage).toHaveBeenCalledWith({
        to: '01000000000',
        message: 'Student was absent',
      });
      expect(prismaService.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            centerId: 'center-1',
            isSent: true,
            recipient: '01000000000',
          }) as unknown,
        }),
      );
      expect(result.id).toBe('notif-1');
    });
  });

  describe('findAll', () => {
    it('should query notifications for center', async () => {
      prismaService.notification.count.mockResolvedValueOnce(1);
      prismaService.notification.findMany.mockResolvedValueOnce([
        { id: 'notif-1', title: 'Test', centerId: 'center-1' },
      ]);

      const query = new NotificationQueryDto();
      const result = await service.findAll('center-1', query);

      expect(prismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ centerId: 'center-1' }) as unknown,
        }),
      );
      expect(result.data.length).toBe(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
