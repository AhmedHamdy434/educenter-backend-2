import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import 'multer';
import { UploadFolder } from './enums/upload-folder.enum';

@Injectable()
export class CloudinaryService {
  /**
   * Uploads an image to Cloudinary under the specified feature folder.
   * Path: educenter/{folder_name}
   */
  async uploadImage(
    file: Express.Multer.File,
    folder: UploadFolder,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `educenter/${folder}`,
        },
        (error, result) => {
          if (error) {
            return reject(
              new BadRequestException('فشل رفع الصورة إلى Cloudinary.'),
            );
          }
          if (!result) {
            return reject(
              new BadRequestException('فشل الحصول على نتيجة الرفع.'),
            );
          }
          resolve(result);
        },
      );

      // Convert buffer to stream and pipe to Cloudinary
      const stream = new Readable();
      stream.push(file.buffer);
      stream.push(null);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Deletes a file from Cloudinary given its full URL.
   */
  async deleteFile(url: string): Promise<any> {
    const publicId = this.extractPublicId(url);
    if (!publicId) return null;

    try {
      return await cloudinary.uploader.destroy(publicId);
    } catch {
      throw new BadRequestException('فشل حذف الصورة من Cloudinary.');
    }
  }

  /**
   * Helper to extract the public_id from a Cloudinary URL.
   * Matches /image/upload/v12345678/folder/subfolder/public_id.jpg (including folders, excluding file extension)
   */
  extractPublicId(url: string): string | null {
    if (!url) return null;
    const regex = /\/image\/upload\/(?:v\d+\/)?([^/].*?)\.[a-z0-9]+$/i;
    const match = url.match(regex);
    return match ? match[1] : null;
  }
}
