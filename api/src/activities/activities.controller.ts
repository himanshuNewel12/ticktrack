import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, PermissionsGuard } from '../auth/guards/rbac.guard';
import { Permissions } from '../auth/decorators/rbac.decorator';
import { Permission } from '../auth/constants/rbac.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ActivitiesService } from './activities.service';
import { ActivityVoiceService, MAX_VOICE_BYTES } from './activity-voice.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { PostponeActivityDto } from './dto/postpone-activity.dto';
import { ActivityActionDto } from './dto/activity-action.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import {
  CreateRecurringActivityDto, QueryRecurrencesDto, UpdateRecurringActivityDto,
} from './dto/create-recurring-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { UpdateActivityStatusDto } from './dto/update-activity-status.dto';
import { AddActivityRemarkDto } from './dto/add-activity-remark.dto';

@ApiTags('Activities (Todo List)')
@ApiBearerAuth()
@Controller({ path: 'activities', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly voice: ActivityVoiceService,
  ) {}

  // ── Voice notes (static paths, ahead of :id) ─────────────────────────────

  @Post('voice')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Upload a voice note; send the returned file name as a remark / description audio field' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VOICE_BYTES } }))
  uploadVoice(@UploadedFile() file: Express.Multer.File) {
    return this.voice.save(file);
  }

  @Get('voice/:file')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Stream a voice note (supports range requests for seeking)' })
  streamVoice(@Param('file') file: string, @Res() res: Response) {
    const { fullPath, mime } = this.voice.resolve(file);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(fullPath);
  }

  // ── Static routes (must come before :id) ─────────────────────────────────

  @Get('mine')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Activities you created — postpone / complete / cancel allowed' })
  findMine(@CurrentUser() actor: any, @Query() query: QueryActivitiesDto) {
    return this.activitiesService.findMine({ id: actor.userId, role: actor.role }, query);
  }

  @Get('assigned')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Activities assigned to you by someone else — view only' })
  findAssigned(@CurrentUser() actor: any, @Query() query: QueryActivitiesDto) {
    return this.activitiesService.findAssigned({ id: actor.userId, role: actor.role }, query);
  }

  @Get('informed')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Activities you are kept informed about — view only' })
  findInformed(@CurrentUser() actor: any, @Query() query: QueryActivitiesDto) {
    return this.activitiesService.findInformed({ id: actor.userId, role: actor.role }, query);
  }

  @Get('escalations')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Activities you can escalate' })
  findEscalations(@CurrentUser() actor: any, @Query() query: QueryActivitiesDto) {
    return this.activitiesService.findEscalations({ id: actor.userId, role: actor.role }, query);
  }

  // ── Recurring series (static paths, still ahead of :id) ───────────────────

  @Get('recurring')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Recurring activity series you created' })
  findSeries(@CurrentUser() actor: any, @Query() query: QueryRecurrencesDto) {
    return this.activitiesService.findSeries({ id: actor.userId, role: actor.role }, query);
  }

  @Post('recurring')
  @Permissions(Permission.ACTIVITY_CREATE)
  @ApiOperation({ summary: 'Create a daily / weekly / monthly repeating activity' })
  createRecurring(@Body() dto: CreateRecurringActivityDto, @CurrentUser() actor: any) {
    return this.activitiesService.createRecurring(dto, { id: actor.userId, role: actor.role });
  }

  @Patch('recurring/:id')
  @Permissions(Permission.ACTIVITY_MANAGE)
  @ApiOperation({ summary: 'Edit a recurring series and regenerate its upcoming occurrences (creator only)' })
  updateSeries(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringActivityDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.updateSeries(id, dto, { id: actor.userId, role: actor.role });
  }

  @Patch('recurring/:id/cancel')
  @Permissions(Permission.ACTIVITY_MANAGE)
  @ApiOperation({ summary: 'Stop a series and cancel its upcoming occurrences (creator only)' })
  cancelSeries(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivityActionDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.cancelSeries(id, dto, { id: actor.userId, role: actor.role });
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  @Post()
  @Permissions(Permission.ACTIVITY_CREATE)
  @ApiOperation({ summary: 'Create an activity for yourself and/or other members' })
  create(@Body() dto: CreateActivityDto, @CurrentUser() actor: any) {
    return this.activitiesService.create(dto, { id: actor.userId, role: actor.role });
  }

  @Patch(':id')
  @Permissions(Permission.ACTIVITY_MANAGE)
  @ApiOperation({ summary: 'Edit an activity name, description, assignees or schedule (creator only, PENDING only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.update(id, dto, { id: actor.userId, role: actor.role });
  }

  @Patch(':id/postpone')
  @Permissions(Permission.ACTIVITY_MANAGE)
  @ApiOperation({ summary: 'Move an activity to a new window (creator only)' })
  postpone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostponeActivityDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.postpone(id, dto, { id: actor.userId, role: actor.role });
  }

  @Patch(':id/escalate')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Escalate a pending activity (escalators only)' })
  escalate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivityActionDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.escalate(id, dto, { id: actor.userId, role: actor.role });
  }

  @Patch(':id/complete')
  @Permissions(Permission.ACTIVITY_MANAGE)
  @ApiOperation({ summary: 'Mark an activity completed (creator only)' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivityActionDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.complete(id, dto, { id: actor.userId, role: actor.role });
  }

  @Patch(':id/cancel')
  @Permissions(Permission.ACTIVITY_MANAGE)
  @ApiOperation({ summary: 'Cancel an activity (creator only)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActivityActionDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.cancel(id, dto, { id: actor.userId, role: actor.role });
  }

  @Patch(':id/status')
  @Permissions(Permission.ACTIVITY_MANAGE)
  @ApiOperation({ summary: 'Update activity status and record remarks (creator only)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityStatusDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.updateStatus(id, dto, { id: actor.userId, role: actor.role });
  }

  @Patch(':id/remark')
  @Permissions(Permission.ACTIVITY_MANAGE)
  @ApiOperation({ summary: 'Add a remark without changing status (creator or assigned user)' })
  addRemark(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddActivityRemarkDto,
    @CurrentUser() actor: any,
  ) {
    return this.activitiesService.addRemark(id, dto, { id: actor.userId, role: actor.role });
  }

  // ── Parameterised reads ───────────────────────────────────────────────────

  @Get(':id')
  @Permissions(Permission.ACTIVITY_VIEW)
  @ApiOperation({ summary: 'Get a single activity you created or are assigned to' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: any) {
    return this.activitiesService.findOne(id, { id: actor.userId, role: actor.role });
  }
}
