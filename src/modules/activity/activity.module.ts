import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { AdminActivityController } from './admin-activity.controller';
import { ActivityService } from './activity.service';

@Module({
    controllers: [ActivityController, AdminActivityController],
    providers: [ActivityService],
    exports: [ActivityService],
})
export class ActivityModule { }
