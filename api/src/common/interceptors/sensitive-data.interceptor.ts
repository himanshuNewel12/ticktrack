import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class SensitiveDataInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    // user.role is a string (set by JWT strategy), not an object
    const userRole: string = request.user?.role;

    return next.handle().pipe(
      map(data => this.maskSensitiveFields(data, userRole))
    );
  }

  private maskSensitiveFields(data: any, role: string): any {
    if (!data || data instanceof Date) return data;

    // Allow Admins and HR to see everything
    if (role === 'ADMIN' || role === 'HR') return data;

    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveFields(item, role));
    }

    if (typeof data === 'object') {
      const masked = { ...data };
      
      // Masking logic
      if ('baseCostPerHour' in masked) {
        masked.baseCostPerHour = '***';
      }
      
      if ('password' in masked) {
        delete masked.password;
      }

      // Recursive masking for nested objects
      for (const key in masked) {
        if (masked[key] && typeof masked[key] === 'object' && !(masked[key] instanceof Date)) {
          masked[key] = this.maskSensitiveFields(masked[key], role);
        }
      }
      
      return masked;
    }

    return data;
  }
}
