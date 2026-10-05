import { Module } from '@nestjs/common';
import { CoreClient } from './core.client';

@Module({
  providers: [CoreClient],
  exports: [CoreClient],
})
export class CoreModule {}
