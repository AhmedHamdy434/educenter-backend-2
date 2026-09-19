import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma, User, UserRole } from '@prisma/client';
import { hashPassword } from '../../common/utils/password.util';
import { buildMeta, PaginationMeta } from '../../common/utils/buildMeta';
import { CreateUserDto } from './dto/create-user.dto';
import { UserQueryDto } from './dto/get-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  userDetailsSelect,
  userListSelect,
  UserDetails,
  UserListItem,
} from './constants/user.select';
import { randomBytes } from 'crypto';

export type UserWithCenter = Prisma.UserGetPayload<{
  include: {
    center: {
      select: {
        id: true;
        name: true;
        slug: true;
      };
    };
  };
}>;

export interface CreateUserAccountInput {
  fullName: string;
  email: string;
  password?: string;
  phone?: string;
  avatar?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export interface UpdateUserAccountInput {
  fullName?: string;
  email?: string;
  password?: string;
  phone?: string;
  avatar?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * البحث عن مستخدم بواسطة المعرف الفريد الخاص به (ID).
   */
  async findById(id: string): Promise<UserDetails | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: userDetailsSelect,
    });
  }

  /**
   * البحث عن مستخدم بواسطة البريد الإلكتروني أو رقم الهاتف للتحقق من بيانات الدخول (Authentication) شاملاً بيانات السنتر.
   */
  async findByIdentifier(identifier: string): Promise<UserWithCenter | null> {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
      include: {
        center: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  /**
   * إنشاء مستخدم جديد وتشفير كلمة المرور الخاصة به قبل الحفظ في قاعدة البيانات.
   */
  async create(data: CreateUserDto): Promise<User> {
    const hashedPassword = await hashPassword(data.password);
    return this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });
  }

  /**
   * إنشاء حساب مستخدم جديد بالتشفير والتحقق من التفرد ضمن المعاملة (Transaction).
   * يتم توليد كلمة مرور عشوائية وتفعيل mustChangePassword في حال لم يتم تمرير كلمة مرور.
   */
  async createUserAccount(
    tx: Prisma.TransactionClient,
    centerId: string,
    role: UserRole,
    data: CreateUserAccountInput,
  ): Promise<User> {
    await this.ensureEmailIsUnique(tx, data.email);
    if (data.phone) {
      await this.ensurePhoneIsUnique(tx, data.phone);
    }

    const mustChangePassword = data.mustChangePassword ?? !data.password;
    const plainPassword = data.password || randomBytes(4).toString('hex');
    const hashedPassword = await hashPassword(plainPassword);

    return tx.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        password: hashedPassword,
        phone: data.phone || null,
        avatar: data.avatar || null,
        role,
        centerId,
        isActive: data.isActive ?? true,
        mustChangePassword,
      },
    });
  }

  /**
   * تحديث بيانات حساب مستخدم والتحقق من تفرد البريد والهاتف وتشفير كلمة المرور الجديدة إن وجدت.
   */
  async updateUserAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    data: UpdateUserAccountInput,
  ): Promise<User> {
    const existingUser = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new NotFoundException('المستخدم غير موجود.');
    }

    const updateData: Prisma.UserUpdateInput = {};

    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.mustChangePassword !== undefined)
      updateData.mustChangePassword = data.mustChangePassword;

    if (data.email !== undefined && data.email !== existingUser.email) {
      await this.ensureEmailIsUnique(tx, data.email, userId);
      updateData.email = data.email;
    }

    if (data.phone !== undefined && data.phone !== existingUser.phone) {
      if (data.phone) {
        await this.ensurePhoneIsUnique(tx, data.phone, userId);
        updateData.phone = data.phone;
      } else {
        updateData.phone = null;
      }
    }

    if (data.password) {
      updateData.password = await hashPassword(data.password);
      if (data.mustChangePassword === undefined) {
        updateData.mustChangePassword = false;
      }
    }

    return tx.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  /**
   * التأكد من أن البريد الإلكتروني للمستخدم غير مستخدم مسبقاً.
   */
  async ensureEmailIsUnique(
    tx: Prisma.TransactionClient,
    email: string,
    excludeUserId?: string,
  ): Promise<void> {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing && existing.id !== excludeUserId) {
      throw new ConflictException('البريد الإلكتروني مستخدم بالفعل.');
    }
  }

  /**
   * التأكد من أن رقم الهاتف للمستخدم غير مستخدم مسبقاً.
   */
  async ensurePhoneIsUnique(
    tx: Prisma.TransactionClient,
    phone: string,
    excludeUserId?: string,
  ): Promise<void> {
    const existing = await tx.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (existing && existing.id !== excludeUserId) {
      throw new ConflictException('رقم الهاتف مستخدم بالفعل.');
    }
  }

  /**
   * جلب قائمة مستخدمي المركز مع دعم التصفية والبحث والـ Pagination.
   */
  async findAll(
    centerId: string,
    query: UserQueryDto,
  ): Promise<{ data: UserListItem[]; meta: PaginationMeta }> {
    const { skip, take, role, isActive, search } = query;

    const where: Prisma.UserWhereInput = {
      centerId,
    };

    if (role !== undefined) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        select: userListSelect,
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    const meta = buildMeta(total, query.page, query.limit);

    return { data, meta };
  }

  /**
   * جلب بيانات مستخدم محدد داخل المركز.
   */
  async findOne(centerId: string, id: string): Promise<UserDetails> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        centerId,
      },
      select: userDetailsSelect,
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود.');
    }

    return user;
  }

  /**
   * تحديث بيانات مستخدم داخل المركز مع منع Privilege Escalation.
   */
  async update(
    centerId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserDetails> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, centerId },
      });

      if (!existing) {
        throw new NotFoundException('المستخدم غير موجود.');
      }

      await this.updateUserAccount(tx, id, dto);

      const updated = await tx.user.findUnique({
        where: { id },
        select: userDetailsSelect,
      });

      if (!updated) {
        throw new NotFoundException('فشل استرجاع بيانات المستخدم بعد التحديث.');
      }

      return updated;
    });
  }
}
