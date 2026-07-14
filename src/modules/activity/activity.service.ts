import { Injectable } from '@nestjs/common';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle/drizzle.service';
import { userActivityDaily, userLocationLogs, userIpLogs, users, userSessions, auditLogs } from '../../db/drizzle/schema';
import { format } from 'date-fns';
import { UAParser } from 'ua-parser-js';

let geoip: typeof import('geoip-lite') | undefined;

function lookupGeoIp(ipAddress: string) {
    geoip ??= require('geoip-lite') as typeof import('geoip-lite');
    return geoip.lookup(ipAddress);
}

@Injectable()
export class ActivityService {
    constructor(private readonly drizzle: DrizzleService) { }

    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3; // metres
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // in metres
    }

    async handleHeartbeat(
        userId: string,
        page: string,
        latitude?: number,
        longitude?: number,
        accuracy?: number,
        ipAddress?: string,
        userAgent?: string,
    ) {
        const db = this.drizzle.db;
        const now = new Date();
        const today = format(now, 'yyyy-MM-dd');

        // Parse User Agent
        const parser = new UAParser(userAgent);
        const browser = parser.getBrowser().name;
        const os = parser.getOS().name;
        const device = parser.getDevice().model || parser.getDevice().type || 'Desktop';

        // Geo Lookup
        let city = null;
        let country = null;
        if (ipAddress && ipAddress !== '127.0.0.1' && ipAddress !== '::1') {
            const geo = lookupGeoIp(ipAddress);
            if (geo) {
                city = geo.city;
                country = geo.country;
            }
        }

        // 1. Session Management
        let [session] = await db
            .select()
            .from(userSessions)
            .where(and(
                eq(userSessions.userId, userId),
                eq(userSessions.isActive, 1),
                eq(userSessions.ipAddress, ipAddress || ''),
                eq(userSessions.userAgent, userAgent || '')
            ))
            .limit(1);

        if (session) {
            // Update last seen
            await db
                .update(userSessions)
                .set({ lastSeen: now })
                .where(eq(userSessions.id, session.id));
        } else {
            // Close other active sessions from same user just to be clean (optional)
            // Create new session
            [session] = await db
                .insert(userSessions)
                .values({
                    userId,
                    ipAddress,
                    userAgent,
                    browser,
                    os,
                    device,
                    startedAt: now,
                    lastSeen: now,
                    isActive: 1,
                })
                .returning();
        }

        // 2. Update daily activity (Assume frontend only sends if active)
        const [activity] = await db
            .select()
            .from(userActivityDaily)
            .where(and(eq(userActivityDaily.userId, userId), eq(userActivityDaily.date, today)))
            .limit(1);

        if (activity) {
            await db
                .update(userActivityDaily)
                .set({
                    activeSeconds: activity.activeSeconds + 60,
                    lastSeen: now,
                })
                .where(eq(userActivityDaily.id, activity.id));
        } else {
            await db.insert(userActivityDaily).values({
                userId,
                date: today,
                activeSeconds: 60,
                lastSeen: now,
            });
        }

        // 3. Log location IF moved > 50m
        if (latitude !== undefined && longitude !== undefined) {
            const [lastLoc] = await db
                .select()
                .from(userLocationLogs)
                .where(eq(userLocationLogs.userId, userId))
                .orderBy(desc(userLocationLogs.createdAt))
                .limit(1);

            let shouldLog = !lastLoc;
            if (lastLoc && lastLoc.latitude && lastLoc.longitude) {
                const dist = this.calculateDistance(latitude, longitude, lastLoc.latitude, lastLoc.longitude);
                if (dist > 50) shouldLog = true;
            }

            if (shouldLog) {
                await db.insert(userLocationLogs).values({
                    userId,
                    page,
                    latitude,
                    longitude,
                    accuracy,
                    ipAddress,
                    city,
                    country,
                    browser,
                    os,
                    device,
                    userAgent,
                });
            }
        }

        // 4. Log IP if changed
        if (ipAddress) {
            const [lastIpLog] = await db
                .select()
                .from(userIpLogs)
                .where(eq(userIpLogs.userId, userId))
                .orderBy(desc(userIpLogs.createdAt))
                .limit(1);

            if (!lastIpLog || lastIpLog.ipAddress !== ipAddress) {
                await db.insert(userIpLogs).values({
                    userId,
                    ipAddress,
                    userAgent,
                });
            }
        }

        return { status: 'ok' };
    }

    async logAction(userId: string, action: string, entityType?: string, entityId?: string, metadata?: any, ipAddress?: string, userAgent?: string) {
        await this.drizzle.db.insert(auditLogs).values({
            userId,
            action,
            entityType,
            entityId,
            metadata,
            ipAddress,
            userAgent,
        });
    }

    async getUsersActivity() {
        const db = this.drizzle.db;
        const today = format(new Date(), 'yyyy-MM-dd');

        // Get latest location for each user
        const latestLocations = db
            .selectDistinctOn([userLocationLogs.userId])
            .from(userLocationLogs)
            .orderBy(userLocationLogs.userId, desc(userLocationLogs.createdAt))
            .as('latest_locations');

        const activityData = await db
            .select({
                userId: users.id,
                username: users.username,
                firstName: users.firstName,
                lastName: users.lastName,
                todayActiveSeconds: userActivityDaily.activeSeconds,
                lastSeen: userActivityDaily.lastSeen,
                latitude: latestLocations.latitude,
                longitude: latestLocations.longitude,
                ipAddress: latestLocations.ipAddress,
                city: latestLocations.city,
                country: latestLocations.country,
                os: latestLocations.os,
                browser: latestLocations.browser,
                device: latestLocations.device,
            })
            .from(users)
            .leftJoin(
                userActivityDaily,
                and(eq(users.id, userActivityDaily.userId), eq(userActivityDaily.date, today)),
            )
            .leftJoin(latestLocations, eq(users.id, latestLocations.userId));

        return activityData.map(a => ({
            userId: a.userId,
            username: a.username,
            name: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username,
            todayActiveMinutes: Math.floor((a.todayActiveSeconds || 0) / 60),
            lastSeen: a.lastSeen,
            lat: a.latitude,
            lng: a.longitude,
            ip: a.ipAddress,
            city: a.city,
            country: a.country,
            os: a.os,
            browser: a.browser,
            device: a.device,
            status: a.lastSeen && (new Date().getTime() - new Date(a.lastSeen).getTime() < 120000) ? 'online' : 'offline',
        }));
    }

    async getUserDailyActivity(userId: string) {
        const db = this.drizzle.db;
        return db
            .select()
            .from(userActivityDaily)
            .where(eq(userActivityDaily.userId, userId))
            .orderBy(desc(userActivityDaily.date));
    }

    async getUserIpLogs(userId: string) {
        const db = this.drizzle.db;
        return db
            .select()
            .from(userIpLogs)
            .where(eq(userIpLogs.userId, userId))
            .orderBy(desc(userIpLogs.createdAt));
    }

    async getUserLocations(userId: string) {
        const db = this.drizzle.db;
        return db
            .select()
            .from(userLocationLogs)
            .where(eq(userLocationLogs.userId, userId))
            .orderBy(desc(userLocationLogs.createdAt));
    }

    async getAuditLogs(userId?: string) {
        const db = this.drizzle.db;
        const query = db.select().from(auditLogs);
        if (userId) {
            query.where(eq(auditLogs.userId, userId));
        }
        return query.orderBy(desc(auditLogs.createdAt));
    }
}
