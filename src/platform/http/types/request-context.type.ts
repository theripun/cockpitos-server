import { Request } from 'express';

export interface RequestUser {
    id: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    marketingOptIn: boolean;
    wallpaperId?: number;
    plan?: string;
    planName?: string;
    subscriptionPlan?: string;
    subscriptionStatus?: string;
    planStatus?: string;
    subscriptionEndsAt?: Date | null;
    subscriptionSource?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface RequestWithUser extends Request {
    user?: RequestUser;
    sessionId?: string;
    cookies: { [key: string]: string };
}
