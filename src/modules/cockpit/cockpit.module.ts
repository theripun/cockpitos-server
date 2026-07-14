import { Module } from '@nestjs/common';
import { CockpitController } from './cockpit.controller';
import { CockpitService } from './cockpit.service';
import { CockpitTerminalService } from './terminal/cockpit-terminal.service';
import { CockpitTerminalController } from './terminal/cockpit-terminal.controller';
import { CockpitTerminalGateway } from './terminal/cockpit-terminal.gateway';
import { NotesController } from './notes.controller';
import { SpeedtestController } from './speedtest.controller';
import { SystemBoosterController } from './system-booster.controller';
import { WallpaperController } from './wallpaper.controller';

@Module({
    controllers: [
        CockpitController,
        CockpitTerminalController,
        NotesController,
        SpeedtestController,
        SystemBoosterController,
        WallpaperController
    ],
    providers: [CockpitService, CockpitTerminalService, CockpitTerminalGateway],
    exports: [CockpitService],
})
export class CockpitModule { }
