import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { CockpitService } from './cockpit.service';
import { SessionGuard } from '../../platform/http/guards/session.guard';
import { CurrentUser } from '../../platform/http/decorators/current-user.decorator';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@ApiTags('Cockpit Notes')
@Controller('cockpit/notes')
@UseGuards(SessionGuard)
@ApiCookieAuth()
export class NotesController {
    constructor(private readonly cockpitService: CockpitService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new note' })
    @ApiResponse({ status: 201, description: 'Note created' })
    async create(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateNoteDto,
    ) {
        return this.cockpitService.createNote(userId, dto);
    }

    @Get()
    @ApiOperation({ summary: 'List all notes for user' })
    @ApiResponse({ status: 200, description: 'List of notes' })
    async findAll(@CurrentUser('id') userId: string) {
        return this.cockpitService.findAllNotes(userId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get note details' })
    @ApiResponse({ status: 200, description: 'Note details' })
    async findOne(
        @CurrentUser('id') userId: string,
        @Param('id') noteId: string,
    ) {
        return this.cockpitService.findOneNote(userId, noteId);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update note' })
    @ApiResponse({ status: 200, description: 'Updated note' })
    async update(
        @CurrentUser('id') userId: string,
        @Param('id') noteId: string,
        @Body() dto: UpdateNoteDto,
    ) {
        return this.cockpitService.updateNote(userId, noteId, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Delete a note' })
    @ApiResponse({ status: 200, description: 'Note deleted' })
    async delete(
        @CurrentUser('id') userId: string,
        @Param('id') noteId: string,
    ) {
        return this.cockpitService.deleteNote(userId, noteId);
    }
}
