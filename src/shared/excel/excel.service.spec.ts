import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ExcelService } from './excel.service';
import { ExcelValidationPipe } from './pipes/excel-validation.pipe';
import {
  normalizeArabicDigits,
  normalizeArabicText,
  normalizeEgyptianPhone,
  areArabicTextsEqual,
} from './utils/arabic-normalizer.util';
import { sanitizeForExport } from './utils/excel-sanitizer.util';

describe('Excel Infrastructure Unit Tests', () => {
  let excelService: ExcelService;

  beforeEach(() => {
    excelService = new ExcelService();
  });

  describe('Arabic Normalizer & Phone Utility', () => {
    it('should convert Hindi / Eastern Arabic digits to standard digits', () => {
      expect(normalizeArabicDigits('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678');
      expect(normalizeArabicDigits('سنة ٢٠٢٦')).toBe('سنة 2026');
    });

    it('should normalize Arabic text variations for flexible matching', () => {
      expect(normalizeArabicText('أحمد')).toBe('احمد');
      expect(normalizeArabicText('إبراهيم')).toBe('ابراهيم');
      expect(normalizeArabicText('آية')).toBe('ايه');
      expect(normalizeArabicText('المرحلة   الثانوية  ')).toBe(
        'المرحله الثانويه',
      );
      expect(areArabicTextsEqual('مرحلة أولي', 'مرحله اولي')).toBe(true);
    });

    it('should restore leading zero to Egyptian phone numbers and normalize country codes', () => {
      expect(normalizeEgyptianPhone('1012345678')).toBe('01012345678');
      expect(normalizeEgyptianPhone('1112345678')).toBe('01112345678');
      expect(normalizeEgyptianPhone('1212345678')).toBe('01212345678');
      expect(normalizeEgyptianPhone('1512345678')).toBe('01512345678');
      expect(normalizeEgyptianPhone('+201012345678')).toBe('01012345678');
      expect(normalizeEgyptianPhone('00201012345678')).toBe('01012345678');
      expect(normalizeEgyptianPhone('201012345678')).toBe('01012345678');
      expect(normalizeEgyptianPhone('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678');
      expect(normalizeEgyptianPhone(1012345678)).toBe('01012345678');
    });
  });

  describe('Formula Sanitizer (Export Only)', () => {
    it('should prepend a single quote to strings starting with dangerous formula characters', () => {
      expect(sanitizeForExport('=SUM(A1:B2)')).toBe(`'=SUM(A1:B2)`);
      expect(sanitizeForExport('+12345')).toBe(`'+12345`);
      expect(sanitizeForExport('-cmd|...')).toBe(`'-cmd|...`);
      expect(sanitizeForExport('@alert')).toBe(`'@alert`);
    });

    it('should leave safe values unchanged', () => {
      expect(sanitizeForExport('محمد أحمد')).toBe('محمد أحمد');
      expect(sanitizeForExport(100)).toBe(100);
      expect(sanitizeForExport(null)).toBeNull();
      expect(sanitizeForExport(undefined)).toBeUndefined();
    });
  });

  describe('ExcelValidationPipe', () => {
    const pipe = new ExcelValidationPipe({ maxSizeBytes: 1024 * 1024 });

    it('should accept a valid zip/xlsx file buffer starting with PK magic bytes', () => {
      const validBuffer = Buffer.from([
        0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
      ]);
      const mockFile = {
        buffer: validBuffer,
        size: validBuffer.length,
        originalname: 'students.xlsx',
      } as Express.Multer.File;

      expect(pipe.transform(mockFile)).toBe(mockFile);
    });

    it('should reject non-xlsx file extensions', () => {
      const validBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const mockFile = {
        buffer: validBuffer,
        size: validBuffer.length,
        originalname: 'script.exe',
      } as Express.Multer.File;

      expect(() => pipe.transform(mockFile)).toThrow(BadRequestException);
    });

    it('should reject files with forged extension but invalid magic bytes', () => {
      const forgedBuffer = Buffer.from('NOT_A_ZIP_HEADER_CONTENT');
      const mockFile = {
        buffer: forgedBuffer,
        size: forgedBuffer.length,
        originalname: 'test.xlsx',
      } as Express.Multer.File;

      expect(() => pipe.transform(mockFile)).toThrow(BadRequestException);
    });

    it('should reject files exceeding maxSizeBytes', () => {
      const largeBuffer = Buffer.alloc(2 * 1024 * 1024);
      largeBuffer[0] = 0x50;
      largeBuffer[1] = 0x4b;
      largeBuffer[2] = 0x03;
      largeBuffer[3] = 0x04;

      const mockFile = {
        buffer: largeBuffer,
        size: largeBuffer.length,
        originalname: 'large.xlsx',
      } as Express.Multer.File;

      expect(() => pipe.transform(mockFile)).toThrow(BadRequestException);
    });
  });

  describe('ExcelService - Export & Template Generation', () => {
    it('should build a formatted Excel workbook buffer with RTL and sanitized formula strings', async () => {
      const buffer = await excelService.buildWorkbookBuffer({
        sheetName: 'المراحل الدراسية',
        columns: [
          { header: 'اسم المرحلة', key: 'name', width: 25 },
          { header: 'الترتيب', key: 'order', width: 10 },
          { header: 'ملاحظة', key: 'notes', width: 30 },
        ],
        data: [
          { name: 'الصف الأول الثانوي', order: 1, notes: 'عام' },
          { name: '=SUM(1+1)', order: 2, notes: 'اختبار معادلة' },
        ],
      });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // نقرأ الملف الناتج للتأكد من المحتوى والتطهير
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
      const sheet = workbook.getWorksheet('المراحل الدراسية');
      expect(sheet).toBeDefined();
      expect(sheet?.views?.[0]?.rightToLeft).toBe(true);

      const row2Name = sheet?.getRow(2).getCell(1).value;
      const row3Name = sheet?.getRow(3).getCell(1).value;

      expect(row2Name).toBe('الصف الأول الثانوي');
      // التأكد من تطهير المعادلة بفاصلة عليا
      expect(row3Name).toBe(`'=SUM(1+1)`);
    });

    it('should build a dual-sheet template with data sheet and instructions sheet', async () => {
      const templateBuffer = await excelService.buildTemplateBuffer({
        dataSheetName: 'بيانات الطلاب',
        instructionsSheetName: 'دليل الاستيراد',
        columns: [
          { header: 'اسم الطالب', key: 'fullName', width: 25 },
          { header: 'رقم الهاتف', key: 'phone', width: 15, numFmt: '@' },
          { header: 'المرحلة الدراسية', key: 'gradeName', width: 20 },
        ],
        sampleRows: [
          {
            fullName: 'أحمد محمود',
            phone: '01012345678',
            gradeName: 'الصف الأول الثانوي',
          },
        ],
        instructions: [
          'يرجى التأكد من كتابة أرقام الهواتف بشكل صحيح.',
          'المرحلة الدراسية يجب أن تكون من ضمن المراحل المسجلة في السنتر.',
        ],
        referenceTables: [
          {
            title: 'المراحل المتاحة بالمركز',
            items: ['الصف الأول الثانوي', 'الصف الثاني الثانوي'],
          },
        ],
      });

      expect(templateBuffer).toBeInstanceOf(Buffer);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(
        templateBuffer as unknown as Parameters<typeof wb.xlsx.load>[0],
      );

      expect(wb.worksheets.length).toBe(2);
      expect(wb.worksheets[0].name).toBe('بيانات الطلاب');
      expect(wb.worksheets[1].name).toBe('دليل الاستيراد');

      // فحص ورقة البيانات
      expect(wb.worksheets[0].getRow(1).getCell(1).value).toBe('اسم الطالب');
      expect(wb.worksheets[0].getRow(2).getCell(1).value).toBe('أحمد محمود');
    });
  });

  describe('ExcelService - Safe Sheet Parsing', () => {
    it('should safely parse rows, extract cell values, and keep real row numbers', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['اسم المرحلة', 'الترتيب']);
      ws.addRow(['الصف الأول', 1]);
      ws.addRow(['الصف الثاني', 2]);
      const fileBuffer = Buffer.from(await wb.xlsx.writeBuffer());

      const result = await excelService.parseSheetRows(fileBuffer, {
        expectedHeaders: ['اسم المرحلة', 'الترتيب'],
      });

      expect(result.headers).toEqual(['اسم المرحلة', 'الترتيب']);
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].rowNumber).toBe(2);
      expect(result.rows[0].values['اسم المرحلة']).toBe('الصف الأول');
      expect(result.rows[0].values['الترتيب']).toBe(1);
      expect(result.rows[1].rowNumber).toBe(3);
    });

    it('should throw BadRequestException if expected headers are missing', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['اسم خاطئ', 'ترتيب']);
      ws.addRow(['الصف الأول', 1]);
      const fileBuffer = Buffer.from(await wb.xlsx.writeBuffer());

      await expect(
        excelService.parseSheetRows(fileBuffer, {
          expectedHeaders: ['اسم المرحلة', 'الترتيب'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce maxRows limit and reject files with excessive rows', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['اسم']);
      for (let i = 0; i < 15; i++) {
        ws.addRow([`اسم ${i}`]);
      }
      const fileBuffer = Buffer.from(await wb.xlsx.writeBuffer());

      await expect(
        excelService.parseSheetRows(fileBuffer, {
          maxRows: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should extract formula cell result without executing', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['الاسم', 'المجموع']);
      ws.addRow(['طالب 1', { formula: 'SUM(10,20)', result: '30' }]);
      const fileBuffer = Buffer.from(await wb.xlsx.writeBuffer());

      const result = await excelService.parseSheetRows(fileBuffer);
      expect(result.rows[0].values['المجموع']).toBe('30');
    });

    it('should reject invalid or corrupted non-excel buffers', async () => {
      const corruptedBuffer = Buffer.from('Corrupted File Content');

      await expect(
        excelService.parseSheetRows(corruptedBuffer),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
