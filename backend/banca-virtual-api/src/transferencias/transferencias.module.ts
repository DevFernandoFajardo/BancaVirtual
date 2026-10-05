import { Module } from '@nestjs/common';
import { CuentasModule } from '../cuentas/cuentas.module';
import { ProgramadasController } from './programadas.controller';
import { ProgramadasService } from './programadas.service';
import { TransferenciasController } from './transferencias.controller';
import { TransferenciasService } from './transferencias.service';

@Module({
  imports: [CuentasModule],
  controllers: [TransferenciasController, ProgramadasController],
  providers: [TransferenciasService, ProgramadasService],
})
export class TransferenciasModule {}
