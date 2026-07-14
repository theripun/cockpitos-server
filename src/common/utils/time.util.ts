/**
 * Convert seconds to milliseconds
 */
export function secondsToMs(seconds: number): number {
    return seconds * 1000;
}

/**
 * Get current timestamp in seconds
 */
export function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

/**
 * Add seconds to a date
 */
export function addSeconds(date: Date, seconds: number): Date {
    return new Date(date.getTime() + seconds * 1000);
}

/**
 * Check if a date is in the past
 */
export function isPast(date: Date): boolean {
    return date.getTime() < Date.now();
}

/**
 * Check if a date is in the future
 */
export function isFuture(date: Date): boolean {
    return date.getTime() > Date.now();
}
