import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { CambiarPasswordDto, CodigoDto, DesactivarDosFactoresDto } from './seguridad.schema';
import { SeguridadService } from './seguridad.service';

@ApiTags('Seguridad')
@Controller('seguridad')
@Auth('CLIENTE')
export class SeguridadController {
  constructor(private readonly seguridad: SeguridadService) {}

  @Get('estado')
  estado(@CurrentUser() user: AuthUser) {
    return this.seguridad.estado(user.sub);
  }

  @Post('password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  password(@CurrentUser() user: AuthUser, @Body() dto: CambiarPasswordDto) {
    return this.seguridad.cambiarPassword(user, dto.passwordActual, dto.passwordNueva);
  }

  @Post('2fa/iniciar')
  @HttpCode(200)
  iniciar(@CurrentUser() user: AuthUser) {
    return this.seguridad.iniciarDosFactores(user.sub);
  }

  @Post('2fa/activar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  activar(@CurrentUser() user: AuthUser, @Body() dto: CodigoDto) {
    return this.seguridad.activarDosFactores(user.sub, dto.codigo);
  }

  @Post('2fa/desactivar')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  desactivar(@CurrentUser() user: AuthUser, @Body() dto: DesactivarDosFactoresDto) {
    return this.seguridad.desactivarDosFactores(user.sub, dto.password, dto.codigo);
  }

  @Get('sesiones')
  sesiones(@CurrentUser() user: AuthUser) {
    return this.seguridad.sesiones(user);
  }

  @Post('sesiones/cerrar-otras')
  @HttpCode(200)
  cerrarOtras(@CurrentUser() user: AuthUser) {
    return this.seguridad.cerrarOtras(user);
  }

  @Delete('sesiones/:id')
  cerrar(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.seguridad.cerrarSesion(user, id);
  }
}
