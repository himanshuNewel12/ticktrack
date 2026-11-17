import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { requestContext } from '../request-context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip, user } = request;
    const now = Date.now();

    // Backfill userId now that the JWT guard has resolved req.user
    const ctx = requestContext.getStore();
    if (ctx && user?.userId) {
      ctx.userId = user.userId;
      ctx.ip = ip ?? null;
    }

    return next.handle().pipe(
      tap(async () => {
        const delay = Date.now() - now;
        this.logger.log(`${method} ${url} ${delay}ms`);

        // HTTP-level audit for mutation requests (complements Prisma middleware data-level audit)
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
          try {
            await this.prisma.auditLog.create({
              data: {
                action: `${method} ${url}`,
                module: url.split('/')[3] || url.split('/')[2] || 'GLOBAL',
                userId: user?.userId || null,
                details: {
                  body: request.body,
                  params: request.params,
                  query: request.query,
                  duration: delay,
                },
                ipAddress: ip,
              },
            });
          } catch (err) {
            this.logger.error('Failed to create HTTP audit log', err);
          }
        }
      }),
    );
  }
}
