import { Test, TestingModule } from '@nestjs/testing';
import { ExtraSessionStatus } from '@prisma/client';
import { ExtraSessionsReminderService } from './extra-sessions.reminder.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WhatsAppService } from '../notifications/whatsapp.service';
import { getCairoDateParts } from '../../common/utils/date.util';

describe('ExtraSessionsReminderService', () => {
  let service: ExtraSessionsReminderService;
  let prisma: any;
  let whatsappService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    prisma = {
      extraSession: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtraSessionsReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppService, useValue: whatsappService },
      ],
    }).compile();

    service = module.get<ExtraSessionsReminderService>(
      ExtraSessionsReminderService,
    );
  });

  it('should send reminder and update reminderSentAt atomically if session starts in 2 hours', async () => {
    const cairoNow = getCairoDateParts(new Date());
    // Schedule session 2 hours (120 minutes) from now
    const targetMinutes = cairoNow.hour * 60 + cairoNow.minute + 120;
    const targetHour = Math.floor(targetMinutes / 60) % 24;
    const targetMinute = targetMinutes % 60;

    prisma.extraSession.findMany.mockResolvedValue([
      {
        id: 'es-1',
        title: 'مراجعة',
        date: new Date(),
        hour: targetHour,
        minute: targetMinute,
        status: ExtraSessionStatus.SCHEDULED,
        reminderSentAt: null,
        group: { name: 'مجموعة 1' },
        participants: [
          {
            student: {
              parentPhone: '01012345678',
              user: { fullName: 'أحمد' },
            },
          },
        ],
      },
    ]);

    prisma.extraSession.updateMany.mockResolvedValue({ count: 1 });

    await service.handleUpcomingSessionReminders();

    expect(prisma.extraSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'es-1',
        reminderSentAt: null,
      },
      data: {
        reminderSentAt: expect.any(Date),
      },
    });

    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '01012345678',
        message: expect.stringContaining('تذكير: موعد الحصة الإضافية'),
      }),
    );
  });

  it('should skip sending if another worker already set reminderSentAt (count === 0)', async () => {
    const cairoNow = getCairoDateParts(new Date());
    const targetMinutes = cairoNow.hour * 60 + cairoNow.minute + 120;
    const targetHour = Math.floor(targetMinutes / 60) % 24;
    const targetMinute = targetMinutes % 60;

    prisma.extraSession.findMany.mockResolvedValue([
      {
        id: 'es-1',
        title: 'مراجعة',
        date: new Date(),
        hour: targetHour,
        minute: targetMinute,
        status: ExtraSessionStatus.SCHEDULED,
        reminderSentAt: null,
        group: { name: 'مجموعة 1' },
        participants: [
          {
            student: {
              parentPhone: '01012345678',
            },
          },
        ],
      },
    ]);

    // Another process already updated
    prisma.extraSession.updateMany.mockResolvedValue({ count: 0 });

    await service.handleUpcomingSessionReminders();

    expect(whatsappService.sendMessage).not.toHaveBeenCalled();
  });
});

