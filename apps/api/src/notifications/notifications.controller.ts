import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationTypes, Permissions } from '@wb/shared';
import { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { NotificationsService } from './notifications.service.js';

const listQuery = z.object({ unread: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().optional() });
const prefsDto = z.object({ items: z.array(z.object({ type: z.enum(NotificationTypes), inApp: z.boolean(), email: z.boolean() })).min(1) });

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  @Get('notifications') @RequirePermission(Permissions.NOTIFICATIONS_READ) list(@Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.list(q); }
  @Get('notifications/unread-count') @RequirePermission(Permissions.NOTIFICATIONS_READ) async unread() { return { count: await this.svc.unreadCount() }; }
  @Post('notifications/read-all') @RequirePermission(Permissions.NOTIFICATIONS_READ) readAll() { return this.svc.markAllRead(); }
  @Post('notifications/:id/read') @RequirePermission(Permissions.NOTIFICATIONS_READ) read(@Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(id); }
  @Get('notification-preferences') @RequirePermission(Permissions.NOTIFICATIONS_READ) prefs() { return this.svc.preferences(); }
  @Put('notification-preferences') @RequirePermission(Permissions.NOTIFICATIONS_READ) setPrefs(@Body(new ZodValidationPipe(prefsDto)) b: z.infer<typeof prefsDto>) { return this.svc.updatePreferences(b.items); }
}
