import {
    Controller,
    Get,
    Post,
    Body,
    Put,
    Param,
    Delete,
    UseGuards,
    Req,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { RequestWithUser } from '../../platform/http/types/request-context.type';

@Controller('calendar')
@UseGuards(SessionGuard)
export class CalendarController {
    constructor(private readonly calendarService: CalendarService) { }

    @Get('events')
    async findAll(@Req() req: RequestWithUser) {
        return this.calendarService.findAll(req.user!.id);
    }

    @Post('events')
    async create(@Req() req: RequestWithUser, @Body() body: any) {
        return this.calendarService.create(req.user!.id, body);
    }

    @Put('events/:id')
    async update(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
        @Body() body: any,
    ) {
        return this.calendarService.update(req.user!.id, id, body);
    }

    @Delete('events/:id')
    async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.calendarService.remove(req.user!.id, id);
    }
}
