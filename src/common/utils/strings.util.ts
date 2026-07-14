/**
 * Normalize email to lowercase and trim
 */
export function normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
}

/**
 * Normalize username to lowercase and trim
 */
export function normalizeUsername(username: string): string {
    return username.toLowerCase().trim();
}

/**
 * Generate a random string of specified length using crypto
 */
export function generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return result;
}

/**
 * Mask email for display (e.g., j***@example.com)
 */
export function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***';
    if (local.length <= 1) return `${local}***@${domain}`;
    return `${local[0]}***@${domain}`;
}

/**
 * Generate SHA256 hash of input string
 */
export function sha256(input: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(input).digest('hex');
}