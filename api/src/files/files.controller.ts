import {
  BadRequestException, Controller, Delete, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, PermissionsGuard } from '../auth/guards/rbac.guard';
import { Permissions } from '../auth/decorators/rbac.decorator';
import { Permission } from '../auth/constants/rbac.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MAX_FILE_BYTES, S3Service } from './s3.service';

@ApiTags('Files')
@ApiBearerAuth()
@Controller({ path: 'files', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FilesController {
  constructor(private readonly s3: S3Service) {}

  @Post('upload')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Upload a file to S3; returns its key to store on the owning record' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() actor: any) {
    return this.s3.upload(file, `users/${actor.userId}`);
  }

  @Get('url')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Temporary download URL for an uploaded file' })
  async url(@Query('key') key: string, @CurrentUser() actor: any) {
    this.assertKey(key);
    return { url: await this.s3.getDownloadUrl(key) };
  }

  @Delete()
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Delete one of your uploaded files' })
  async remove(@Query('key') key: string, @CurrentUser() actor: any) {
    this.assertKey(key);
    if (!key.startsWith(`users/${actor.userId}/`) && actor.role !== 'ADMIN') {
      throw new BadRequestException('You can only delete your own files');
    }
    await this.s3.delete(key);
    return { deleted: true };
  }

  private assertKey(key?: string) {
    if (!key || key.includes('..')) throw new BadRequestException('Invalid file key');
  }
}
