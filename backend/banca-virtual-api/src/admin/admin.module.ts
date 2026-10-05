import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module';
import { CuentasModule } from '../cuentas/cuentas.module';
import { SolicitudesModule } from '../solicitudes/solicitudes.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [SolicitudesModule, ClientesModule, CuentasModule],
  controllers: [AdminController],
})
export class AdminModule {}
