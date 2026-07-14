import { Controller, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

@Controller('cockpit/system')
@UseGuards(SessionGuard)
export class SystemBoosterController {
    @Post('boost')
    async boostSystem() {
        // Capture initial memory state
        const initialFreeMem = os.freemem();

        try {
            if (process.platform === 'linux') {
                // Attempt to drop file system caches (requires root/sudo usually)
                // We use 'catch' to ignore permission errors silently
                await execAsync('sync; echo 3 > /proc/sys/vm/drop_caches').catch(() => { });
            }

            // Optional: Trigger GC if available
            if (global.gc) {
                global.gc();
            }
        } catch (e) {
            console.error('Boost error:', e);
        }

        // Allow some time for system stats to update
        await new Promise(resolve => setTimeout(resolve, 500));

        const finalFreeMem = os.freemem();
        // Calculate difference in bytes
        const diffBytes = finalFreeMem - initialFreeMem;
        // Convert to MB
        const freedMB = Math.max(0, Math.round(diffBytes / 1024 / 1024));

        return {
            success: true,
            freedMB: freedMB,
            platform: process.platform
        };
    }
}
