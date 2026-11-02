import { GroupExtraSessionsController } from './group-extra-sessions.controller';
import { ExtraSessionsService } from './extra-sessions.service';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface';
import type { CreateExtraSessionDto } from './dto/create-extra-session.dto';
import { AppRole } from '../../common/enums/app-role.enum';

describe('GroupExtraSessionsController', () => {
  let controller: GroupExtraSessionsController;
  let service: {
    create: jest.Mock;
    findAllForGroup: jest.Mock;
  };

  const centerId = 'center-1';
  const groupId = 'group-1';
  const mockUser: RequestUser = {
    id: 'user-1',
    centerId,
    role: AppRole.OWNER,
  };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAllForGroup: jest.fn(),
    };
    controller = new GroupExtraSessionsController(
      service as unknown as ExtraSessionsService,
    );
  });

  describe('create', () => {
    it('should create extra session directly and return session details', async () => {
      const mockCreatedSession = { id: 'es-1', title: 'مراجعة' };
      service.create.mockResolvedValue(mockCreatedSession);

      const dto: CreateExtraSessionDto = {
        date: '2026-11-05',
        hour: 16,
        minute: 0,
      };

      const result = await controller.create(centerId, mockUser, groupId, dto);

      expect(service.create).toHaveBeenCalledWith(
        centerId,
        groupId,
        dto,
        mockUser.id,
      );
      expect(result).toEqual(mockCreatedSession);
    });
  });
});
