import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

// Fields to strip from request body before logging (security)
const SENSITIVE_FIELDS = ['password', 'token', 'accessToken', 'refreshToken', 'secret'];

function stripSensitive(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    cleaned[key] = SENSITIVE_FIELDS.includes(key) ? '***' : value;
  }
  return cleaned;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly prisma: PrismaService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: (exception as Error).message, statusCode: status };

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      ...(typeof message === 'object' ? message : { message }),
    };

    // Console log (existing behaviour)
    this.logger.error(
      `${request.method} ${request.url} ${status} - Error: ${JSON.stringify(message)}`,
    );

    // --- Write to ErrorLog table ---
    try {
      const errorMessage =
        typeof message === 'string'
          ? message
          : (message as any)?.message
            ? Array.isArray((message as any).message)
              ? (message as any).message.join('; ')
              : String((message as any).message)
            : JSON.stringify(message);

      // Only capture stack trace for 500 errors (5xx)
      const errorStack =
        status >= 500 && exception instanceof Error
          ? exception.stack ?? null
          : null;

      // Derive module from URL: /api/v1/<module>/...
      const urlParts = request.url.split('?')[0].split('/').filter(Boolean);
      const module = urlParts[2] || urlParts[1] || 'GLOBAL';

      const userId = (request as any).user?.userId ?? null;

      await (this.prisma as any).errorLog?.create({
        data: {
          method: request.method,
          url: request.url,
          module: module.toUpperCase(),
          statusCode: status,
          errorMessage,
          errorStack,
          userId,
          ipAddress: request.ip ?? null,
          requestBody:
            request.body && Object.keys(request.body).length > 0
              ? stripSensitive(request.body)
              : undefined,
          requestQuery:
            request.query && Object.keys(request.query).length > 0
              ? request.query
              : undefined,
          requestParams:
            request.params && Object.keys(request.params).length > 0
              ? request.params
              : undefined,
        },
      });
    } catch (logErr) {
      // Never let logging failure crash the response
      this.logger.error('Failed to write ErrorLog entry', logErr);
    }
    // --- End ErrorLog ---

    if (response.headersSent) {
      return;
    }

    response.status(status).json(errorResponse);
  }
}
