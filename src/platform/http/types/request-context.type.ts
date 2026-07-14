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
    createdAt: Date;
    updatedAt: Date;
}

export interface RequestWithUser extends Request {
    user?: RequestUser;
    sessionId?: string;
    cookies: { [key: string]: string };
}
