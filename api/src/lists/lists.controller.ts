import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ListsService } from './lists.service';

@ApiTags('Lists')
@ApiBearerAuth()
@Controller({ path: 'lists', version: '1' })
@UseGuards(JwtAuthGuard)
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all task lists for the user including system and project lists' })
  findAll(@CurrentUser() user: any) {
    return this.listsService.findAll({ id: user.userId, role: user.role });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user custom task list' })
  create(@Body() dto: { name: string; emoji?: string; color?: string }, @CurrentUser() user: any) {
    return this.listsService.create(dto, { id: user.userId });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task list' })
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.listsService.update(id, dto, { id: user.userId });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task list' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.listsService.remove(id, { id: user.userId });
  }
}
