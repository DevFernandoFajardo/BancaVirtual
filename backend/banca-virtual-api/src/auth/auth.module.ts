import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientesModule } from '../clientes/clientes.module';
import { CuentasModule } from '../cuentas/cuentas.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, RolesGuard } from './jwt-auth.guard';

@Module({
  imports: [
    ClientesModule,
    CuentasModule,
    JwtModule.registerAsync({
      global: true, // los guards de los demás módulos necesitan JwtService
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: Number(config.get('JWT_EXPIRES_SECONDS') ?? 3600) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
