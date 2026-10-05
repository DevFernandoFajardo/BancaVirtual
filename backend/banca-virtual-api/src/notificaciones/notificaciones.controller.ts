import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { NotificacionesService } from './notificaciones.service';

@ApiTags('Notificaciones')
@Controller('notificaciones')
@Auth('CLIENTE')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser, @Query('soloNoLeidas') soloNoLeidas?: string) {
    return this.notificaciones.listar(user.sub, soloNoLeidas === 'true');
  }

  @Get('resumen')
  async resumen(@CurrentUser() user: AuthUser) {
    return { noLeidas: await this.notificaciones.contarNoLeidas(user.sub) };
  }

  @Post('leer-todas')
  @HttpCode(200)
  leerTodas(@CurrentUser() user: AuthUser) {
    return this.notificaciones.marcarTodasLeidas(user.sub);
  }

  @Post(':id/leer')
  @HttpCode(200)
  leer(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificaciones.marcarLeida(user.sub, id);
  }
}
