import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module';
import { TarjetasController } from './tarjetas.controller';
import { TarjetasService } from './tarjetas.service';

@Module({ imports: [ClientesModule], controllers: [TarjetasController], providers: [TarjetasService], exports: [TarjetasService] })
export class TarjetasModule {}
