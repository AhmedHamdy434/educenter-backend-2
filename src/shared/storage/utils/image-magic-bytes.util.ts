import { BadRequestException } from '@nestjs/common';

export interface VerifiedImageDetails {
  extension: string;
  mimetype: string;
}

/**
 * فحص توقيع البايتات الحقيقي (Magic Bytes) للصور في الذاكرة.
 * يمنع تزييف الـ MIME-type، ويحظر ملفات SVG نهائياً لمنع ثغرات Stored XSS.
 */
export function verifyImageMagicBytes(
  buffer: Buffer,
  originalFilename?: string,
  clientMimetype?: string,
): VerifiedImageDetails {
  // 1. فحص مبكر لملفات SVG عبر الاسم أو الـ Header أو المحتوى النصي
  const filename = (originalFilename || '').toLowerCase();
  const mime = (clientMimetype || '').toLowerCase();

  const isSvgByMetadata =
    filename.endsWith('.svg') ||
    mime.includes('svg') ||
    mime === 'image/svg+xml';

  if (isSvgByMetadata) {
    throw new BadRequestException(
      'صيغة SVG غير مدعومة لدواعي الأمان، يرجى استخدام إحدى الصيغ التالية: JPG، PNG، WEBP، GIF.',
    );
  }

  // فحص ما إذا كان الملف نصياً يبدأ بـ XML أو SVG بالرغم من تغيير الامتداد
  if (buffer && buffer.length > 0) {
    const headText = buffer
      .subarray(0, Math.min(buffer.length, 256))
      .toString('utf8')
      .trim()
      .toLowerCase();

    if (
      headText.startsWith('<?xml') ||
      headText.startsWith('<svg') ||
      headText.includes('<svg')
    ) {
      throw new BadRequestException(
        'صيغة SVG غير مدعومة لدواعي الأمان، يرجى استخدام إحدى الصيغ التالية: JPG، PNG، WEBP، GIF.',
      );
    }
  }

  // 2. التحقق من الحد الأدنى لحجم الترويسة (12 بايت لقراءة WEBP بدقة)
  if (!buffer || buffer.length < 12) {
    throw new BadRequestException('محتوى الصورة المرفوعة تالف أو غير صالح.');
  }

  // 3. التحقق من صيغة JPEG (أول 3 بايتات: FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      extension: '.jpg',
      mimetype: 'image/jpeg',
    };
  }

  // 4. التحقق من صيغة PNG (أول 8 بايتات: 89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      extension: '.png',
      mimetype: 'image/png',
    };
  }

  // 5. التحقق من صيغة GIF (أول 4 بايتات: 47 49 46 38 / 'GIF8')
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return {
      extension: '.gif',
      mimetype: 'image/gif',
    };
  }

  // 6. التحقق من صيغة WEBP:
  // بايتات 0-3: 'RIFF' (0x52, 0x49, 0x46, 0x46)
  // بايتات 8-11: 'WEBP' (0x57, 0x45, 0x42, 0x50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return {
      extension: '.webp',
      mimetype: 'image/webp',
    };
  }

  // 7. إذا لم يتطابق الملف مع أي من الصيغ النقطية الأربع المسموحة
  throw new BadRequestException(
    'محتوى الملف غير صالح أو لا يتطابق مع صيغ الصور المسموحة (JPG، PNG، WEBP، GIF).',
  );
}
