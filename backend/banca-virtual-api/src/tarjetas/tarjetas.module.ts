import { Module } from '@nestjs/common';
import { TarjetasController } from './tarjetas.controller';
import { TarjetasService } from './tarjetas.service';

@Module({ controllers: [TarjetasController], providers: [TarjetasService], exports: [TarjetasService] })
export class TarjetasModule {}
