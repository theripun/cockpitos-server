import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../db/drizzle/drizzle.service';
import { users, User, cocktailDevices } from '@/db/drizzle/schema';
import { ErrorCodes } from '../../common/constants/error-codes';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class UsersService {
    constructor(private readonly drizzle: DrizzleService) { }

    async getUserById(id: string): Promise<User | null> {
        const db = this.drizzle.db;
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);
        return user || null;
    }

    async updateUser(userId: string, dto: UpdateMeDto): Promise<User> {
        const db = this.drizzle.db;

        const updateData: Partial<{
            firstName: string;
            lastName: string;
            marketingOptIn: boolean;
            wallpaperId: number;
            updatedAt: Date;
        }> = {
            updatedAt: new Date(),
        };

        if (dto.firstName !== undefined) {
            updateData.firstName = dto.firstName;
        }
        if (dto.lastName !== undefined) {
            updateData.lastName = dto.lastName;
        }
        if (dto.marketingOptIn !== undefined) {
            updateData.marketingOptIn = dto.marketingOptIn;
        }
        if (dto.wallpaperId !== undefined) {
            updateData.wallpaperId = dto.wallpaperId;
        }

        const [updated] = await db
            .update(users)
            .set(updateData)
            .where(eq(users.id, userId))
            .returning();

        if (!updated) {
            throw new NotFoundException({
                code: ErrorCodes.USER_NOT_FOUND,
                message: 'User not found',
            });
        }

        return updated;
    }

    async getAllUsers(): Promise<User[]> {
        const db = this.drizzle.db;
        return db.select().from(users);
    }

    async getAllUsersWithDevices(): Promise<any[]> {
        const db = this.drizzle.db;
        const allUsers = await db.select().from(users);
        const allDevices = await db.select().from(cocktailDevices);

        return allUsers.map(u => {
            const userDevices = allDevices.filter(d => d.userId === u.id);
            return {
                ...u,
                devices: userDevices,
                passwordHash: undefined,
                otp: undefined
            };
        });
    }

    async updateUserRole(userId: string, role: string): Promise<User> {
        const db = this.drizzle.db;

        const [updated] = await db
            .update(users)
            .set({ role, updatedAt: new Date() })
            .where(eq(users.id, userId))
            .returning();

        if (!updated) {
            throw new NotFoundException({
                code: ErrorCodes.USER_NOT_FOUND,
                message: 'User not found',
            });
        }

        return updated;
    }
}
