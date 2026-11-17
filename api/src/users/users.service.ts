import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Active users assignable to tasks — workforce roles (PM/TL/USER/HR).
  // Only minimal identifying fields; no PII beyond name.
  findAssignableUsers() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        employmentStatus: 'ACTIVE',
        role: { name: { in: ['ADMIN', 'PM', 'TL', 'USER', 'HR'] } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }
}
