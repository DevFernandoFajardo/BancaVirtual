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
import { DatabaseModule } from './database/database.module';
import { ExtrasModule } from './extras/extras.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
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
    SolicitudesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
