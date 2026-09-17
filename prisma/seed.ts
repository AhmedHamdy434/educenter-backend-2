import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { hashPassword } from '../src/common/utils/password.util';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Check if plans exist before creating them to avoid duplicates if seed is run again
  const planCount = await prisma.subscriptionPlan.count();
  if (planCount === 0) {
    await prisma.subscriptionPlan.createMany({
      data: [
        {
          name: 'مجاني',
          description: 'مناسب للسناتر الصغيرة التي تبدأ باستخدام النظام.',
          price: 0,
          type: 'MONTHLY',
          studentLimit: 30,
          teacherLimit: 3,
          canCreateExams: false,
          isPopular: false,
          isActive: true,
        },
        {
          name: 'الأساسية',
          description: 'مناسبة للسناتر المتوسطة مع إمكانيات إضافية.',
          price: 299,
          type: 'MONTHLY',
          studentLimit: 200,
          teacherLimit: 15,
          canCreateExams: true,
          isPopular: true,
          isActive: true,
        },
        {
          name: 'الاحترافية',
          description: 'جميع المميزات بدون قيود تقريبًا.',
          price: 699,
          type: 'MONTHLY',
          studentLimit: 1000,
          teacherLimit: 100,
          canCreateExams: true,
          isPopular: false,
          isActive: true,
        },
      ],
    });
    console.log('✅ تم إضافة الباقات بنجاح');
  } else {
    console.log('ℹ️ باقات الاشتراك موجودة بالفعل');
  }

  // Seed Super Admin
  const adminEmail = 'superadmin@educenter.com';
  const hashedPassword = await hashPassword('Admin@123456');

  await prisma.superAdmin.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      isActive: true,
    },
    create: {
      fullName: 'المدير العام (Super Admin)',
      email: adminEmail,
      password: hashedPassword,
      isActive: true,
    },
  });
  console.log(
    '✅ تم ضبط وتأكيد حساب المدير العام بنجاح: superadmin@educenter.com / Admin@123456',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
