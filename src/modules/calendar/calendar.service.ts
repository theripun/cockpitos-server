import { Injectable, NotFoundException } from '@nestjs/common';
import { DrizzleService } from '../../db/drizzle/drizzle.service';
import { calendarEvents } from '../../db/drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';

@Injectable()
export class CalendarService {
    constructor(private readonly drizzle: DrizzleService) { }

    async findAll(userId: string) {
        return this.drizzle.db
            .select()
            .from(calendarEvents)
            .where(eq(calendarEvents.userId, userId))
            .orderBy(desc(calendarEvents.startTime));
    }

    async create(userId: string, data: any) {
        const [event] = await this.drizzle.db
            .insert(calendarEvents)
            .values({
                userId,
                title: data.title,
                description: data.description,
                startTime: new Date(data.startTime),
                endTime: new Date(data.endTime),
                category: data.category,
                location: data.location,
                color: data.category === 'Work' ? 'blue' : data.category === 'Personal' ? 'red' : 'green',
            })
            .returning();
        return event;
    }

    async update(userId: string, id: string, data: any) {
        const [updated] = await this.drizzle.db
            .update(calendarEvents)
            .set({
                title: data.title,
                description: data.description,
                startTime: new Date(data.startTime),
                endTime: new Date(data.endTime),
                category: data.category,
                location: data.location,
                color: data.category === 'Work' ? 'blue' : data.category === 'Personal' ? 'red' : 'green',
                updatedAt: new Date(),
            })
            .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
            .returning();

        if (!updated) {
            throw new NotFoundException('Event not found');
        }

        return updated;
    }

    async remove(userId: string, id: string) {
        const [deleted] = await this.drizzle.db
            .delete(calendarEvents)
            .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
            .returning();

        if (!deleted) {
            throw new NotFoundException('Event not found');
        }

        return { ok: true };
    }
}
