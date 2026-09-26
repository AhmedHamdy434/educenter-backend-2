/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BuildPdfTableOptions } from './interfaces/pdf.interface';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake-rtl');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Roboto = require('pdfmake-rtl/fonts/Roboto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Cairo = require('pdfmake-rtl/fonts/Cairo');

@Injectable()
export class PdfService implements OnModuleInit {
  private readonly logger = new Logger(PdfService.name);
  private fontsInitialized = false;

  onModuleInit() {
    this.initFonts();
  }

  private initFonts() {
    if (!this.fontsInitialized) {
      try {
        pdfmake.addFonts(Roboto);
        pdfmake.addFonts(Cairo);
        this.fontsInitialized = true;
      } catch (err) {
        this.logger.warn(`Could not initialize fonts in pdfmake: ${err}`);
      }
    }
  }

  async buildTablePdfBuffer(options: BuildPdfTableOptions): Promise<Buffer> {
    this.initFonts();
    const {
      title,
      subtitle,
      columns,
      data,
      dateStr = new Date().toISOString().split('T')[0],
      orientation = 'portrait',
    } = options;

    const tableHeader = [
      {
        text: '#',
        bold: true,
        fillColor: '#1e293b',
        color: '#ffffff',
        alignment: 'center',
      },
      ...columns.map((col) => ({
        text: col.header,
        bold: true,
        fillColor: '#1e293b',
        color: '#ffffff',
        alignment: col.align || 'center',
      })),
    ];

    const tableRows = data.map((row, idx) => [
      {
        text: String(idx + 1),
        alignment: 'center',
        color: '#64748b',
      },
      ...columns.map((col) => {
        const rawVal = row[col.key];
        let textVal = '—';
        if (typeof rawVal === 'string') {
          textVal = rawVal;
        } else if (typeof rawVal === 'number' || typeof rawVal === 'boolean') {
          textVal = String(rawVal);
        } else if (rawVal instanceof Date) {
          textVal = rawVal.toISOString().split('T')[0];
        }
        return {
          text: textVal,
          alignment: col.align || 'center',
        };
      }),
    ]);

    const widths: (string | number)[] = ['auto'];
    for (const col of columns) {
      widths.push(col.width ?? '*');
    }

    const docDefinition = {
      rtl: true,
      pageOrientation: orientation,
      pageSize: 'A4',
      pageMargins: [20, 25, 20, 25],
      defaultStyle: {
        font: 'Cairo',
        fontSize: 9,
      },
      content: [
        {
          columns: [
            {
              text: title,
              fontSize: 15,
              bold: true,
              color: '#0f172a',
              alignment: 'right',
            },
            {
              text: `تاريخ التقرير: ${dateStr}\nإجمالي السجلات: ${data.length}`,
              fontSize: 8.5,
              color: '#64748b',
              alignment: 'left',
            },
          ],
          margin: [0, 0, 0, subtitle ? 6 : 12],
        },
        ...(subtitle
          ? [
              {
                text: subtitle,
                fontSize: 9.5,
                color: '#475569',
                margin: [0, 0, 0, 10],
              },
            ]
          : []),
        {
          table: {
            headerRows: 1,
            widths,
            body: [tableHeader, ...tableRows],
          },
          layout: {
            fillColor: (rowIndex: number) => {
              if (rowIndex === 0) return '#1e293b';
              return rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';
            },
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1',
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
        },
      ],
      footer: (currentPage: number, pageCount: number) => ({
        text: `صفحة ${currentPage} من ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#94a3b8',
        margin: [0, 8, 0, 0],
      }),
    };

    const pdf = pdfmake.createPdf(docDefinition);
    return await pdf.getBuffer();
  }
}
