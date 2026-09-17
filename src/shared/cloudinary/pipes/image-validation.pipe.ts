import {
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';

export function ImageValidationPipe(required = true) {
  return new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({
        maxSize: 5 * 1024 * 1024, // 5MB
        message: 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.',
      }),
      new FileTypeValidator({
        fileType: /image\/(jpeg|png|webp|gif|svg\+xml)$/i,
      }),
    ],
    fileIsRequired: required,
  });
}
