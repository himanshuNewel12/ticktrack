import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const BLOCKED_EXT = new Set(['exe', 'bat', 'cmd', 'sh', 'js', 'msi', 'apk', 'com', 'scr', 'ps1']);

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('AWS_S3_BUCKET') || '';
    this.client = new S3Client({
      region: config.get<string>('AWS_REGION') || 'ap-south-1',
      credentials: {
        accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });
  }

  /** Uploads under `<folder>/<uuid>-<name>` and returns the object key. */
  async upload(file: Express.Multer.File, folder: string) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!this.bucket) throw new BadRequestException('File storage is not configured');
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (BLOCKED_EXT.has(ext)) throw new BadRequestException('This file type is not allowed');

    const safeName = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(-120);
    const key = `${folder}/${randomUUID()}-${safeName}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ServerSideEncryption: 'AES256',
      }),
    );
    return { key, name: file.originalname, size: file.size, mimeType: file.mimetype };
  }

  /** Short-lived download link; the bucket itself stays private. */
  async getDownloadUrl(key: string, expiresInSec = 300) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      throw new NotFoundException('File not found');
    }
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSec });
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
