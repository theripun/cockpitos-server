import {
    Controller,
    Post,
    Param,
    UseGuards,
    Req,
    BadRequestException,
} from '@nestjs/common';
import { CockpitTerminalService } from './cockpit-terminal.service';
import { SessionGuard } from '../../../platform/http/guards/session.guard';
import { RequestWithUser } from '../../../platform/http/types/request-context.type';

@Controller('cockpit/vps/:vpsId/terminal')
@UseGuards(SessionGuard)
export class CockpitTerminalController {
    constructor(
        private readonly terminalService: CockpitTerminalService,
    ) { }

    @Post('sessions')
    async createSession(
        @Req() req: RequestWithUser,
        @Param('vpsId') vpsId: string,
    ) {
        const user = req.user;
        if (!user) {
            throw new BadRequestException('User not authenticated');
        }

        const userId = user.id;

        return this.terminalService.createSession(userId, vpsId);
    }

    @Post('sessions/:sessionId/close')
    async closeSession(
        @Req() req: RequestWithUser,
        @Param('vpsId') vpsId: string,
        @Param('sessionId') sessionId: string,
    ) {
        const user = req.user;
        if (!user) {
            throw new BadRequestException('User not authenticated');
        }

        const userId = user.id;

        // (optional) you can use userId later for ownership checks
        await this.terminalService.markClosed(sessionId);

        return { ok: true };
    }
}
