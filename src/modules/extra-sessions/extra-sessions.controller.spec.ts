import { ExtraSessionsController } from './extra-sessions.controller';
import { ExtraSessionsService } from './extra-sessions.service';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import { AppRole } from '../../common/enums/app-role.enum';

describe('ExtraSessionsController', () => {
  let controller: ExtraSessionsController;
  let service: {
    findOne: jest.Mock;
    update: jest.Mock;
    cancel: jest.Mock;
    addStudents: jest.Mock;
    payStudent: jest.Mock;
    waiveStudent: jest.Mock;
    startAttendanceSession: jest.Mock;
  };

  const centerId = 'center-1';
  const sessionId = 'es-1';
  const mockUser: RequestUser = {
    id: 'user-1',
    centerId,
    role: AppRole.OWNER,
  };

  beforeEach(() => {
    service = {
      findOne: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      addStudents: jest.fn(),
      payStudent: jest.fn(),
      waiveStudent: jest.fn(),
      startAttendanceSession: jest.fn(),
    };
    controller = new ExtraSessionsController(
      service as unknown as ExtraSessionsService,
    );
  });

  describe('startAttendanceSession', () => {
    it('should delegate to extraSessionsService.startAttendanceSession with centerId, id, user.role and user.id', async () => {
      const mockResult = {
        session: { id: 'att-1', date: new Date('2026-11-02T00:00:00.000Z') },
        roster: [],
        stats: { total: 0, attended: 0, absent: 0, late: 0 },
      };
      service.startAttendanceSession.mockResolvedValue(mockResult);

      const result = await controller.startAttendanceSession(
        centerId,
        mockUser,
        sessionId,
      );

      expect(service.startAttendanceSession).toHaveBeenCalledWith(
        centerId,
        sessionId,
        mockUser.role,
        mockUser.id,
      );
      expect(result).toEqual(mockResult);
    });
  });
});
