import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/** Folder (inside UPLOAD_DIR) that holds activity voice notes. */
const VOICE_DIR = 'activity-voice';
export const MAX_VOICE_BYTES = 5 * 1024 * 1024;

/** Stored file names are always `<uuid>.<ext>` — this is also what the API accepts back. */
export const VOICE_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(m4a|mp4|aac|mp3|wav|3gp|webm|ogg|caf)$/i;

const MIME_BY_EXT: Record<string, string> = {
  m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg',
  wav: 'audio/wav', '3gp': 'audio/3gpp', webm: 'audio/webm', ogg: 'audio/ogg', caf: 'audio/x-caf',
};

@Injectable()
export class ActivityVoiceService {
  private readonly dir: string;

  constructor(config: ConfigService) {
    this.dir = path.resolve(config.get<string>('UPLOAD_DIR') || './uploads', VOICE_DIR);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async save(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('No audio file received');
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!MIME_BY_EXT[ext] || (!file.mimetype.startsWith('audio/') && file.mimetype !== 'video/mp4')) {
      throw new BadRequestException('Unsupported audio format');
    }
    const fileName = `${randomUUID()}.${ext}`;
    await fs.promises.writeFile(path.join(this.dir, fileName), file.buffer);
    return { file: fileName };
  }

  /** Rejects a file name that the client sent back but that was never uploaded. */
  assertExists(fileName: string) {
    if (!VOICE_FILE_PATTERN.test(fileName) || !fs.existsSync(path.join(this.dir, fileName))) {
      throw new BadRequestException('Voice note not found — record it again');
    }
  }

  resolve(fileName: string) {
    if (!VOICE_FILE_PATTERN.test(fileName)) throw new NotFoundException('Voice note not found');
    const fullPath = path.join(this.dir, fileName);
    if (!fs.existsSync(fullPath)) throw new NotFoundException('Voice note not found');
    return { fullPath, mime: MIME_BY_EXT[fileName.split('.').pop()!.toLowerCase()] };
  }
}
