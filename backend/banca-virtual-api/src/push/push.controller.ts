import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsObject, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { PushService } from './push.service';

class KeysDto {
  @IsString() @MaxLength(200) p256dh: string;
  @IsString() @MaxLength(100) auth: string;
}

class SuscripcionBody {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false }) @MaxLength(1000) endpoint: string;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => KeysDto) keys: KeysDto;
  @IsOptional() @IsString() @MaxLength(200) userAgent?: string;
}

class QuitarBody {
  @IsString() @MaxLength(1000) endpoint: string;
}

@ApiTags('Notificaciones push')
@Controller('push')
@Auth('CLIENTE')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Llave pública VAPID (la web la necesita para suscribirse) y cuántos dispositivos tiene el cliente. */
  @Get('config')
  async config(@CurrentUser() user: AuthUser) {
    return { habilitado: this.push.habilitado, publicKey: this.push.publicKey, dispositivos: this.push.habilitado ? await this.push.dispositivos(user.sub).catch(() => 0) : 0 };
  }

  @Post('suscribir')
  @HttpCode(200)
  suscribir(@CurrentUser() user: AuthUser, @Body() dto: SuscripcionBody) {
    return this.push.suscribir(user.sub, dto);
  }

  @Delete('suscripcion')
  quitar(@CurrentUser() user: AuthUser, @Body() dto: QuitarBody) {
    return this.push.quitar(user.sub, dto.endpoint);
  }

  /** Envía una notificación de prueba a los dispositivos del cliente. */
  @Post('probar')
  @HttpCode(200)
  async probar(@CurrentUser() user: AuthUser) {
    await this.push.enviar(user.sub, 'Notificaciones activadas', 'Así te avisaremos de tus movimientos y gestiones.', '/notificaciones');
    return { ok: true };
  }
}
