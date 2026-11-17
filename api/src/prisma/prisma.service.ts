import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { requestContext } from '../common/request-context';

const MODELS_TO_AUDIT = [
  'User', 'Project', 'Freelancer', 'Vendor', 'Allocation',
  'Leave', 'Timesheet', 'Invoice', 'ChangeRequest', 'Demand',
  'Milestone', 'Risk', 'Issue',
  'EmployeeMaturity', 'EmployeeMaturityHistory',
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this._registerAuditMiddleware();
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private _registerAuditMiddleware() {
    this.$use(async (params, next) => {
      if (!params.model || !MODELS_TO_AUDIT.includes(params.model)) {
        return next(params);
      }

      const model = params.model;
      const ctx = requestContext.getStore();
      const userId = ctx?.userId ?? null;
      const entityId: string | null = params.args?.where?.id ?? null;

      // Camel-case accessor: 'ChangeRequest' → 'changeRequest'
      const delegate = (this as any)[
        model.charAt(0).toLowerCase() + model.slice(1)
      ];

      if (params.action === 'update') {
        let before: unknown = null;
        try {
          before = await delegate.findUnique({ where: params.args.where });
        } catch {
          // non-fatal: proceed without before state
        }
        const result = await next(params);
        this._writeAuditLog({
          action: 'UPDATE',
          module: model.toUpperCase(),
          entityId: entityId ?? (result as any)?.id ?? null,
          userId,
          before,
          after: result,
        });
        return result;
      }

      if (params.action === 'delete') {
        let before: unknown = null;
        try {
          before = await delegate.findUnique({ where: params.args.where });
        } catch {
          // non-fatal
        }
        const result = await next(params);
        this._writeAuditLog({
          action: 'DELETE',
          module: model.toUpperCase(),
          entityId,
          userId,
          before,
          after: null,
        });
        return result;
      }

      if (params.action === 'create') {
        const result = await next(params);
        this._writeAuditLog({
          action: 'CREATE',
          module: model.toUpperCase(),
          entityId: (result as any)?.id ?? null,
          userId,
          before: null,
          after: result,
        });
        return result;
      }

      return next(params);
    });
  }

  private _writeAuditLog(entry: {
    action: string;
    module: string;
    entityId: string | null;
    userId: string | null;
    before: unknown;
    after: unknown;
  }) {
    // Fire-and-forget — audit failures must never break the primary operation
    this.auditLog
      .create({
        data: {
          action: entry.action,
          module: entry.module,
          entityId: entry.entityId,
          userId: entry.userId,
          before: entry.before as any,
          after: entry.after as any,
          details: { before: entry.before, after: entry.after } as any,
        },
      })
      .catch((err) => this.logger.error('Audit log write failed', err));
  }
}
