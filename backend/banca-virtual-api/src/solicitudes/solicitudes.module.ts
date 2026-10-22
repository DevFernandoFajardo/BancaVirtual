import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module';
import { CoreModule } from '../core/core.module';
import { PrestamosModule } from '../prestamos/prestamos.module';
import { TarjetasModule } from '../tarjetas/tarjetas.module';
import { SolicitudesController } from './solicitudes.controller';
import { SolicitudesService } from './solicitudes.service';

@Module({
  imports: [ClientesModule, CoreModule, TarjetasModule, PrestamosModule],
  controllers: [SolicitudesController],
  providers: [SolicitudesService],
  exports: [SolicitudesService],
})
export class SolicitudesModule {}
