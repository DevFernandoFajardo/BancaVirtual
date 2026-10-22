import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BeneficiariosModule } from './beneficiarios/beneficiarios.module';
import { ClientesModule } from './clientes/clientes.module';
import { CuentasModule } from './cuentas/cuentas.module';
import { CpModule } from './cp/cp.module';
import { DatabaseModule } from './database/database.module';
import { ExtrasModule } from './extras/extras.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { PrestamosModule } from './prestamos/prestamos.module';
import { PushModule } from './push/push.module';
import { SeguridadModule } from './seguridad/seguridad.module';
import { ServiciosModule } from './servicios/servicios.module';
import { SolicitudesModule } from './solicitudes/solicitudes.module';
import { TarjetasModule } from './tarjetas/tarjetas.module';
import { TransferenciasModule } from './transferencias/transferencias.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    CpModule,
    PushModule,
    NotificacionesModule,
    AuthModule,
    ClientesModule,
    CuentasModule,
    TransferenciasModule,
    BeneficiariosModule,
    ServiciosModule,
    TarjetasModule,
    SeguridadModule,
    ExtrasModule,
    PrestamosModule,
    SolicitudesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
