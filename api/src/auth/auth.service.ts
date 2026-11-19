import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CookieOptions, Response } from 'express';

/**
 * Mobile app auth: login + profile only. Password reset, refresh and logout stay
 * in the main backend. Tokens are signed with the same secrets as the backend.
 */
/** "jane.doe@newel.com" -> "ja***@newel.com", so logs identify the account without the full address. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = String(email ?? '').split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: { select: { name: true } } },
            },
          },
        },
      },
    });

    // The client always gets the same "Invalid credentials" (no account enumeration); the server log
    // records the real reason so a wrong database can be told apart from a wrong password.
    if (!user) {
      this.logger.warn(`Login failed for ${maskEmail(email)}: no user with this email in the database`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      this.logger.warn(`Login refused for ${maskEmail(email)}: account is deactivated`);
      throw new ForbiddenException('Account is deactivated. Please contact your administrator.');
    }

    if (user.failedAttempts >= 5) {
      this.logger.warn(`Login refused for ${maskEmail(email)}: account is locked`);
      throw new ForbiddenException('Account is locked due to multiple failed attempts');
    }

    const isMatch = await bcrypt.compare(pass, user.password);

    if (!isMatch) {
      await this.handleFailedLogin(user);
      this.logger.warn(
        `Login failed for ${maskEmail(email)}: wrong password (attempt ${user.failedAttempts + 1}/5)`,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedAttempts > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: 0 },
      });
    }

    const { password, ...result } = user;
    return result;
  }

  private async handleFailedLogin(user: any) {
    const newFailedAttempts = user.failedAttempts + 1;
    const updateData: any = { failedAttempts: newFailedAttempts };

    if (newFailedAttempts >= 5) {
      updateData.isActive = false;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });
  }

  async login(user: any, response: Response) {
    const permissions: string[] = (user.role?.permissions ?? []).map(
      (rp: any) => rp.permission.name,
    );

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role.name,
      permissions,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.REFRESH_TOKEN_SECRET,
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN as any,
    });

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    this.setCookies(response, accessToken, refreshToken);

    // A user is a Reporting Authority if at least one active user reports to them.
    const subordinateCount = await this.prisma.user.count({
      where: { reportingAuthorityId: user.id, isActive: true },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        permissions,
        isReportingAuthority: subordinateCount > 0,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const permissions: string[] = (user.role?.permissions ?? []).map(
      (rp: any) => rp.permission.name,
    );

    const subordinateCount = await this.prisma.user.count({
      where: { reportingAuthorityId: user.id, isActive: true },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      permissions,
      isReportingAuthority: subordinateCount > 0,
    };
  }

  private setCookies(response: Response, accessToken: string, refreshToken: string) {
    response.cookie('access_token', accessToken, {
      ...this.getBaseCookieOptions(),
      maxAge: 24 * 60 * 60 * 1000,
    });

    response.cookie('refresh_token', refreshToken, {
      ...this.getBaseCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private getBaseCookieOptions(): CookieOptions {
    const sameSite = this.getCookieSameSite();
    const domain = process.env.COOKIE_DOMAIN?.trim();

    return {
      httpOnly: true,
      secure: this.getCookieSecure(sameSite),
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }

  private getCookieSameSite(): CookieOptions['sameSite'] {
    const configured = process.env.COOKIE_SAME_SITE?.trim().toLowerCase();

    if (configured === 'strict' || configured === 'lax' || configured === 'none') {
      return configured;
    }

    return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
  }

  private getCookieSecure(sameSite: CookieOptions['sameSite']): boolean {
    if (sameSite === 'none') {
      return true;
    }

    const configured = process.env.COOKIE_SECURE?.trim().toLowerCase();

    if (configured === 'true') {
      return true;
    }

    if (configured === 'false') {
      return false;
    }

    return process.env.NODE_ENV === 'production';
  }
}
