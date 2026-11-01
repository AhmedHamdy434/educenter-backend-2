import { HttpStatus } from '@nestjs/common';
import { GroupExtraSessionsController } from './group-extra-sessions.controller';
import { ExtraSessionsService } from './extra-sessions.service';

describe('GroupExtraSessionsController', () => {
  let controller: GroupExtraSessionsController;
  let service: {
    create: jest.Mock;
    findAllForGroup: jest.Mock;
  };

  const centerId = 'center-1';
  const groupId = 'group-1';
  const mockUser = {
    id: 'user-1',
    centerId,
    role: 'OWNER',
  } as any;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAllForGroup: jest.fn(),
    };
    controller = new GroupExtraSessionsController(
      service as unknown as ExtraSessionsService,
    );
  });

  describe('create status code', () => {
    it('should set status 200 OK when created is false (warnings)', async () => {
      service.create.mockResolvedValue({
        created: false,
        warnings: [{ code: 'CONFLICT', message: 'تعارض' }],
      });

      const res = { status: jest.fn() } as any;

      const result = await controller.create(
        centerId,
        mockUser,
        groupId,
        { date: '2026-11-05', hour: 16, minute: 0 } as any,
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result.created).toBe(false);
    });

    it('should set status 201 CREATED when created is true', async () => {
      service.create.mockResolvedValue({
        created: true,
        session: { id: 'es-1' },
      });

      const res = { status: jest.fn() } as any;

      const result = await controller.create(
        centerId,
        mockUser,
        groupId,
        { date: '2026-11-05', hour: 16, minute: 0, force: true } as any,
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result.created).toBe(true);
    });
  });
});
