export const COOKIE_NAMES = {
    SESSION: 'sid',
    CSRF: 'csrf_token',
} as const;

export type CookieName = (typeof COOKIE_NAMES)[keyof typeof COOKIE_NAMES];
