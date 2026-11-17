import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { NotificationType, Notification } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async send(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    metadata?: any,
    sendEmail: boolean = true,
    // Pre-rendered email to use instead of the plain-text fallback below. Passed
    // in (rather than sent by the caller) so the email preference check stays
    // here and callers cannot bypass it.
    emailContent?: { subject: string; html: string },
  ) {
    try {
      // 1. Check Preferences
      const dbPref = await this.prisma.notificationPreference.findUnique({
        where: { userId_type: { userId, type } },
      });

      // Default if not found
      const pref = dbPref || { inApp: true, email: true };

      // Fetch user once if needed for push or email
      let user: { id: string; email: string | null; expoPushToken: string | null } | null = null;
      if (pref.inApp || (pref.email && sendEmail)) {
        user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, expoPushToken: true },
        });
      }

      let notification: Notification | null = null;

      // 2. Create In-App Notification & Dispatch Mobile Push Notification
      if (pref.inApp) {
        notification = await this.prisma.notification.create({
          data: {
            userId,
            type,
            title,
            body,
            metadata: metadata || {},
          },
        });

        // If the user has an Expo push token, push to mobile device for mobile-app relevant events (task/activity assignments, updates, postpones, cancels)
        const isAppRelevant =
          type.startsWith('ACTIVITY_') ||
          type.startsWith('TASK_');

        if (user?.expoPushToken && isAppRelevant) {
          void this.sendExpoPushNotification(user.expoPushToken, title, body, {
            type,
            notificationId: notification.id,
            ...(metadata || {}),
          });
        }
      }

      // 3. Send Email
      if (pref.email && sendEmail && user?.email) {
        if (emailContent) {
          await this.emailService.send(user.email, emailContent.subject, emailContent.html);
        } else {
          await this.emailService.send(user.email, title, body.replace(/\n/g, '<br>'));
        }
      }

      return notification;
    } catch (error) {
      this.logger.error(`Error sending notification to ${userId}:`, error);
      throw error;
    }
  }

  async markRead(notificationId: string, userId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async getAll(userId: string, limit: number = 50, scope?: string) {
    const where: any = { userId };
    if (scope === 'mobile' || scope === 'app') {
      where.type = {
        in: [
          NotificationType.ACTIVITY_ASSIGNED,
          NotificationType.ACTIVITY_POSTPONED,
          NotificationType.ACTIVITY_COMPLETED,
          NotificationType.ACTIVITY_CANCELLED,
          NotificationType.ACTIVITY_SERIES_ASSIGNED,
          NotificationType.ACTIVITY_SERIES_CANCELLED,
          NotificationType.ACTIVITY_REMARK_ADDED,
          NotificationType.TASK_ASSIGNED,
        ],
      };
      // Read notifications expire 48h after creation; unread ones are kept.
      where.OR = [
        { isRead: false },
        { createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
      ];
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async updatePushToken(userId: string, pushToken: string | null) {
    const cleanToken = pushToken ? pushToken.trim() : null;
    return this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: cleanToken },
      select: { id: true, email: true, expoPushToken: true },
    });
  }

  async sendExpoPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: any,
  ) {
    if (!pushToken || typeof pushToken !== 'string') return;
    const trimmed = pushToken.trim();
    if (!trimmed.startsWith('ExponentPushToken[') && !trimmed.startsWith('ExpoPushToken[')) {
      this.logger.warn(`Invalid Expo push token format: ${trimmed}`);
      return;
    }

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: trimmed,
          sound: 'default',
          title,
          body,
          data: data || {},
          channelId: 'task-reminders',
          priority: 'high',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Expo push API HTTP ${response.status}: ${errText}`);
      } else {
        const resJson = await response.json();
        this.logger.log(`Expo push dispatched to ${trimmed}: ${JSON.stringify(resJson)}`);
      }
    } catch (pushError) {
      this.logger.error(`Failed to send Expo push notification:`, pushError);
    }
  }
}
