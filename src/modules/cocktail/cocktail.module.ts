import { Module } from '@nestjs/common';
import { CocktailController } from './cocktail.controller';
import { CocktailDeviceController } from './cocktail.device.controller';
import { CocktailFsController } from './cocktail.fs.controller';
import { CocktailTransfersController } from './cocktail.transfers.controller';
import { CocktailAgentController } from './cocktail.agent.controller';
import { CocktailService } from './cocktail.service';
import { DbModule } from '../../db/db.module';
import { ConfigModule } from '@nestjs/config';
import { CocktailWsHub } from './cocktail-ws-hub.service';
import { CocktailAgentGateway, CocktailUiGateway } from './cocktail.gateway';

import { StorageService } from './storage.service';

import { CocktailUploadsController } from './cocktail.uploads.controller';

@Module({
    imports: [DbModule, ConfigModule],
    controllers: [CocktailFsController, CocktailController, CocktailDeviceController, CocktailTransfersController, CocktailAgentController, CocktailUploadsController],
    providers: [CocktailService, CocktailWsHub, CocktailAgentGateway, CocktailUiGateway, StorageService],
    exports: [CocktailService, StorageService],
})
export class CocktailModule { }
