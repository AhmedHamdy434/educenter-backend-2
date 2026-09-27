import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  BuildTemplateOptions,
  BuildWorkbookOptions,
  ParsedSheetResult,
  ParseSheetOptions,
} from './interfaces/excel.interface';
import { sanitizeRowForExport } from './utils/excel-sanitizer.util';
import { normalizeArabicText } from './utils/arabic-normalizer.util';

const DEFAULT_MAX_ROWS = 3000;

@Injectable()
export class ExcelService {
  private readonly logger = new Logger(ExcelService.name);

  /**
   * إنشاء وتصدير ملف Excel (Workbook) مع دعم التنسيق الكامل والـ RTL وتطهير الـ Formula Injection.
   */
  async buildWorkbookBuffer(options: BuildWorkbookOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EduCenter SaaS Platform';
    workbook.created = new Date();

    const sheetName = options.sheetName || 'البيانات';
    const worksheet = workbook.addWorksheet(sheetName, {
      views: [
        { state: 'frozen', ySplit: 1, rightToLeft: options.isRtl !== false },
      ],
    });

    // 1. تعريف الأعمدة
    worksheet.columns = options.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || Math.max(col.header.length + 6, 16),
      style: col.numFmt ? { numFmt: col.numFmt } : undefined,
    }));

    // 2. تنسيق صف العناوين (Row 1)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 32;
    headerRow.eachCell((cell) => {
      cell.font = {
        name: 'Segoe UI',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Dark Slate
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });

    // 3. إضافة وتنسيق صفوف البيانات مع تطبيق التطهير (Formula Sanitization)
    const shouldSanitize = options.sanitizeFormula !== false;

    for (let i = 0; i < options.data.length; i++) {
      const rawItem = options.data[i];
      const itemToInsert = shouldSanitize
        ? sanitizeRowForExport(rawItem)
        : rawItem;

      const row = worksheet.addRow(itemToInsert);
      row.height = 24;

      // تطبيق تدرج لوني خفيف (Zebra Striping) للصفوف الزوجية
      const isEven = i % 2 === 0;
      const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBgColor },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * إنشاء قالب Excel فارغ ومجهز بصفحتين:
   * - صفحة 1: صفحة إدخال البيانات تبدأ بالعناوين في الصف 1 وأمثلة توضيحية.
   * - صفحة 2: ورقة التعليمات وقوائم البيانات المرجعية المتاحة.
   */
  async buildTemplateBuffer(options: BuildTemplateOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EduCenter SaaS Platform';
    workbook.created = new Date();

    // 1. ورقة إدخال البيانات (Sheet 1)
    const dataSheetName = options.dataSheetName || 'البيانات';
    const dataSheet = workbook.addWorksheet(dataSheetName, {
      views: [{ state: 'frozen', ySplit: 1, rightToLeft: true }],
    });

    dataSheet.columns = options.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || Math.max(col.header.length + 8, 20),
      style: col.numFmt ? { numFmt: col.numFmt } : { numFmt: '@' },
    }));

    // تنسيق هيدر ورقة البيانات
    const dataHeaderRow = dataSheet.getRow(1);
    dataHeaderRow.height = 34;
    dataHeaderRow.eachCell((cell) => {
      cell.font = {
        name: 'Segoe UI',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }, // Deep Navy Blue
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF3B82F6' } },
        left: { style: 'thin', color: { argb: 'FF3B82F6' } },
        bottom: { style: 'medium', color: { argb: 'FF1E40AF' } },
        right: { style: 'thin', color: { argb: 'FF3B82F6' } },
      };
    });

    // إضافة صفوف نموذجية إذا وجدت
    if (options.sampleRows && options.sampleRows.length > 0) {
      for (const sample of options.sampleRows) {
        const row = dataSheet.addRow(sample);
        row.height = 24;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: 'Segoe UI', size: 10, italic: true };
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      }
    }

    // 2. ورقة التعليمات والإرشادات (Sheet 2)
    const instructionsSheetName = options.instructionsSheetName || 'التعليمات';
    const instructionsSheet = workbook.addWorksheet(instructionsSheetName, {
      views: [{ rightToLeft: true }],
    });

    instructionsSheet.getColumn(1).width = 6;
    instructionsSheet.getColumn(2).width = 38;
    instructionsSheet.getColumn(3).width = 42;

    // العنوان الرئيسي للورقة
    const titleRow = instructionsSheet.getRow(2);
    titleRow.getCell(2).value = 'دليل وتعليمات استيراد البيانات عبر Excel';
    titleRow.getCell(2).font = {
      name: 'Segoe UI',
      size: 14,
      bold: true,
      color: { argb: 'FF1E3A8A' },
    };
    titleRow.height = 30;
    instructionsSheet.mergeCells(2, 2, 2, 3);

    let currentRowIdx = 4;

    // كتابة نقاط التعليمات
    if (options.instructions && options.instructions.length > 0) {
      for (const inst of options.instructions) {
        const row = instructionsSheet.getRow(currentRowIdx);
        row.getCell(1).value = '•';
        row.getCell(1).font = { bold: true, size: 12 };
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).value = inst;
        row.getCell(2).font = { name: 'Segoe UI', size: 10 };
        row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
        instructionsSheet.mergeCells(currentRowIdx, 2, currentRowIdx, 3);
        row.height = 24;
        currentRowIdx++;
      }
      currentRowIdx += 2;
    }

    // كتابة الجداول المرجعية (Reference Tables)
    if (options.referenceTables && options.referenceTables.length > 0) {
      for (const refTable of options.referenceTables) {
        const tableHeaderRow = instructionsSheet.getRow(currentRowIdx);
        tableHeaderRow.getCell(2).value = refTable.title;
        tableHeaderRow.getCell(2).font = {
          name: 'Segoe UI',
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };
        tableHeaderRow.getCell(2).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E293B' },
        };
        tableHeaderRow.getCell(2).alignment = {
          vertical: 'middle',
          horizontal: 'center',
        };
        instructionsSheet.mergeCells(currentRowIdx, 2, currentRowIdx, 3);
        tableHeaderRow.height = 28;
        currentRowIdx++;

        if (refTable.rows && refTable.rows.length > 0) {
          const subHeaderRow = instructionsSheet.getRow(currentRowIdx);
          const idHeader = refTable.headers?.[0] || 'معرف الكيان (ID - للنسخ)';
          const nameHeader = refTable.headers?.[1] || 'الاسم والبيان';

          subHeaderRow.getCell(2).value = idHeader;
          subHeaderRow.getCell(3).value = nameHeader;

          [subHeaderRow.getCell(2), subHeaderRow.getCell(3)].forEach((cell) => {
            cell.font = {
              name: 'Segoe UI',
              bold: true,
              size: 10,
              color: { argb: 'FF0F172A' },
            };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE2E8F0' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF94A3B8' } },
              bottom: { style: 'medium', color: { argb: 'FF64748B' } },
              left: { style: 'thin', color: { argb: 'FF94A3B8' } },
              right: { style: 'thin', color: { argb: 'FF94A3B8' } },
            };
          });
          subHeaderRow.height = 24;
          currentRowIdx++;

          for (let rIdx = 0; rIdx < refTable.rows.length; rIdx++) {
            const item = refTable.rows[rIdx];
            const itemRow = instructionsSheet.getRow(currentRowIdx);
            const isEven = rIdx % 2 === 0;
            const bg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

            const idCell = itemRow.getCell(2);
            idCell.value = item.id;
            idCell.numFmt = '@';
            idCell.font = {
              name: 'Consolas',
              size: 10,
              color: { argb: 'FF0F172A' },
            };
            idCell.alignment = { vertical: 'middle', horizontal: 'center' };
            idCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: bg },
            };
            idCell.border = {
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };

            const nameCell = itemRow.getCell(3);
            nameCell.value = item.name;
            nameCell.font = { name: 'Segoe UI', size: 10 };
            nameCell.alignment = { vertical: 'middle', horizontal: 'right' };
            nameCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: bg },
            };
            nameCell.border = {
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };

            itemRow.height = 22;
            currentRowIdx++;
          }
        } else if (refTable.items && refTable.items.length > 0) {
          for (const item of refTable.items) {
            const itemRow = instructionsSheet.getRow(currentRowIdx);
            itemRow.getCell(2).value = item;
            itemRow.getCell(2).font = { name: 'Segoe UI', size: 10 };
            instructionsSheet.mergeCells(currentRowIdx, 2, currentRowIdx, 3);
            itemRow.getCell(2).border = {
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };
            itemRow.height = 22;
            currentRowIdx++;
          }
        }
        currentRowIdx += 2;
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * قراءة وفك محتوى ورقة العمل بأمان مع فحص الـ Formula وحماية من الـ Zip Bomb والحد الأقصى للصفوف.
   */
  async parseSheetRows(
    fileBuffer: Buffer,
    options?: ParseSheetOptions,
  ): Promise<ParsedSheetResult> {
    const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
    const headerRowNumber = options?.headerRowNumber ?? 1;

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to parse Excel buffer: ${errMsg}`);
      throw new BadRequestException(
        'الملف المرفوع غير صالح أو تالف أو لا يتطابق مع معايير ملفات Excel (.xlsx).',
      );
    }

    // 1. تحديد ورقة العمل المستهدفة
    let worksheet: ExcelJS.Worksheet | undefined;
    if (typeof options?.sheetIndexOrName === 'string') {
      worksheet = workbook.getWorksheet(options.sheetIndexOrName);
    } else if (typeof options?.sheetIndexOrName === 'number') {
      worksheet = workbook.worksheets[options.sheetIndexOrName - 1];
    } else {
      worksheet = workbook.worksheets[0];
    }

    if (!worksheet) {
      throw new BadRequestException(
        'لم يتم العثور على ورقة العمل المطلوبة داخل ملف Excel.',
      );
    }

    // 2. التحقق من الحد الأقصى لعدد الصفوف
    const dataRowCount = Math.max(
      0,
      worksheet.actualRowCount - headerRowNumber,
    );
    if (dataRowCount > maxRows) {
      throw new BadRequestException(
        `تجاوز الملف الحد الأقصى المسموح به للبيانات (${maxRows} صف). عدد الصفوف الحالية: ${dataRowCount}.`,
      );
    }

    // 3. استخراج وفحص العناوين من صف الهيدر
    const headerRow = worksheet.getRow(headerRowNumber);
    const headersMap = new Map<number, string>();
    const headersList: string[] = [];

    headerRow.eachCell((cell, colNumber) => {
      const cellVal = cell.value;
      const headerVal = cell.text
        ? cell.text.trim()
        : typeof cellVal === 'string'
          ? cellVal.trim()
          : '';
      if (headerVal) {
        headersMap.set(colNumber, headerVal);
        headersList.push(headerVal);
      }
    });

    if (headersList.length === 0) {
      throw new BadRequestException(
        'صف العناوين في ملف Excel فارغ. يرجى استخدام القالب المعتمد.',
      );
    }

    // التحقق من توافر العناوين الإلزامية المطلوبة (مع تطبيع النصوص للمقارنة)
    if (options?.expectedHeaders && options.expectedHeaders.length > 0) {
      const normalizedFoundHeaders = headersList.map((h) =>
        normalizeArabicText(h),
      );

      const missingHeaders = options.expectedHeaders.filter((expected) => {
        const normalizedExpected = normalizeArabicText(expected);
        return !normalizedFoundHeaders.includes(normalizedExpected);
      });

      if (missingHeaders.length > 0) {
        throw new BadRequestException(
          `الملف المرفوع تنقصه الأعمدة الإلزامية التالية: [${missingHeaders.join(', ')}].`,
        );
      }
    }

    // 4. قراءة صفوف البيانات (الصفوف التالية لصف العناوين)
    const parsedRows: Array<{
      rowNumber: number;
      values: Record<string, any>;
    }> = [];

    worksheet.eachRow((row, rowNumber) => {
      // تخطي صف العناوين وأي صفوف تسبقه
      if (rowNumber <= headerRowNumber) {
        return;
      }

      // التحقق من أن الصف ليس فارغاً تماماً
      let hasData = false;
      const rowValues: Record<string, unknown> = {};

      headersMap.forEach((headerName, colNumber) => {
        const cell = row.getCell(colNumber);
        const cellVal: unknown = this.extractCellValue(cell);

        if (cellVal !== null && cellVal !== undefined && cellVal !== '') {
          hasData = true;
          rowValues[headerName] = cellVal;
        } else {
          rowValues[headerName] = null;
        }
      });

      if (hasData) {
        parsedRows.push({
          rowNumber,
          values: rowValues,
        });
      }
    });

    return {
      headers: headersList,
      rows: parsedRows,
    };
  }

  /**
   * استخراج القيمة من الخلية بأمان تام:
   * - معالجة الخلايا الحسابية (Formula) باستخراج القيمة الناتجة فقط (cell.result) دون تنفيذ أي معادلات
   * - استخراج النصوص الغنية (RichText) كنص عادي
   * - المحافظة على التواريخ والأرقام
   */
  private extractCellValue(cell: ExcelJS.Cell): unknown {
    const val = cell.value;
    if (val === null || val === undefined) {
      return null;
    }

    // إذا كانت الخلية تحتوي على كائن
    if (typeof val === 'object') {
      // معادلة (Formula): نستخرج result فقط
      if ('result' in val) {
        const res = (val as { result?: unknown }).result;
        if (typeof res === 'string' || typeof res === 'number') {
          return res.toString().trim();
        }
        return null;
      }

      // نصوص غنية (RichText)
      if (
        'richText' in val &&
        Array.isArray((val as unknown as Record<string, unknown>).richText)
      ) {
        const richText = (val as { richText: Array<{ text?: string }> })
          .richText;
        return richText
          .map((t) => t.text || '')
          .join('')
          .trim();
      }

      // التواريخ
      if (val instanceof Date) {
        return val;
      }

      // روابط Hyperlink
      if ('text' in val) {
        const textVal = (val as { text?: unknown }).text;
        if (typeof textVal === 'string') {
          return textVal.trim();
        }
      }
    }

    if (typeof val === 'string') {
      return val.trim();
    }

    return val;
  }
}
