import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigFactory } from './env.schema';

@Module({
  imports: [NestConfigModule.forRoot(ConfigFactory())],
  exports: [NestConfigModule],
})
export class ConfigModule { }