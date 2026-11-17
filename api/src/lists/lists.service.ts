import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TaskListDto = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  system?: boolean;
  order: number;
  created_at: string;
};

@Injectable()
export class ListsService {
  private customLists: Map<string, TaskListDto[]> = new Map();
  private deletedListIds: Map<string, Set<string>> = new Map();

  constructor(private prisma: PrismaService) {}

  async findAll(user: { id: string; role: string }): Promise<TaskListDto[]> {
    const userDeleted = this.deletedListIds.get(user.id) ?? new Set();

    const systemLists: TaskListDto[] = [
      { id: 'inbox', name: 'Inbox', emoji: '📥', color: '#3B82F6', system: true, order: 0, created_at: new Date().toISOString() },
      { id: 'personal', name: 'Personal', emoji: '👤', color: '#10B981', system: true, order: 1, created_at: new Date().toISOString() },
      { id: 'work', name: 'Work', emoji: '💼', color: '#8B5CF6', system: true, order: 2, created_at: new Date().toISOString() },
    ];

    const projects = await this.prisma.project.findMany({
      select: { id: true, name: true, createdAt: true },
      orderBy: { name: 'asc' },
    });

    const projectLists: TaskListDto[] = projects.map((p, idx) => ({
      id: p.id,
      name: p.name,
      emoji: '📁',
      color: '#F59E0B',
      system: false,
      order: systemLists.length + idx,
      created_at: p.createdAt.toISOString(),
    }));

    const userCustom = this.customLists.get(user.id) ?? [];

    const all = [...systemLists, ...userCustom, ...projectLists];
    return all.filter((item) => !userDeleted.has(item.id));
  }

  async create(dto: { name: string; emoji?: string; color?: string }, user: { id: string }): Promise<TaskListDto> {
    const list: TaskListDto = {
      id: `list-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: dto.name,
      emoji: dto.emoji || '📁',
      color: dto.color || '#3B82F6',
      system: false,
      order: 100,
      created_at: new Date().toISOString(),
    };

    const current = this.customLists.get(user.id) ?? [];
    this.customLists.set(user.id, [...current, list]);

    const userDeleted = this.deletedListIds.get(user.id);
    if (userDeleted) {
      userDeleted.delete(list.id);
    }

    return list;
  }

  async update(id: string, dto: Partial<TaskListDto>, user: { id: string }): Promise<TaskListDto | null> {
    const current = this.customLists.get(user.id) ?? [];
    const index = current.findIndex((item) => item.id === id);
    if (index !== -1) {
      current[index] = { ...current[index], ...dto };
      this.customLists.set(user.id, current);
      return current[index];
    }
    return null;
  }

  async remove(id: string, user: { id: string }): Promise<{ success: boolean }> {
    // 1. Mark in user's deleted set
    if (!this.deletedListIds.has(user.id)) {
      this.deletedListIds.set(user.id, new Set());
    }
    this.deletedListIds.get(user.id)!.add(id);

    // 2. Remove from custom lists map
    const current = this.customLists.get(user.id) ?? [];
    this.customLists.set(user.id, current.filter((item) => item.id !== id));

    // 3. Clean up DB dependencies and delete Project record if it exists
    try {
      await this.prisma.task.deleteMany({
        where: { projectId: id },
      }).catch(() => {});
      await this.prisma.allocation.deleteMany({
        where: { projectId: id },
      }).catch(() => {});
      await this.prisma.milestone.deleteMany({
        where: { projectId: id },
      }).catch(() => {});
      await this.prisma.risk.deleteMany({
        where: { projectId: id },
      }).catch(() => {});
      await this.prisma.issue.deleteMany({
        where: { projectId: id },
      }).catch(() => {});
      await this.prisma.timesheetEntry.deleteMany({
        where: { projectId: id },
      }).catch(() => {});
      await this.prisma.project.delete({
        where: { id },
      });
    } catch {}

    return { success: true };
  }
}
