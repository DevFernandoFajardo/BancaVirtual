import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { CrearProgramadaDto } from './programadas.schema';
import { ProgramadasService } from './programadas.service';

@ApiTags('Transferencias programadas')
@Controller('programadas')
@Auth('CLIENTE')
export class ProgramadasController {
  constructor(private readonly programadas: ProgramadasService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.programadas.listar(user.sub);
  }

  @Post()
  crear(@CurrentUser() user: AuthUser, @Body() dto: CrearProgramadaDto) {
    return this.programadas.crear(user.sub, dto);
  }

  @Post(':id/pausar')
  @HttpCode(200)
  pausar(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.programadas.cambiarEstado(user.sub, id, 'PAUSADA');
  }

  @Post(':id/reanudar')
  @HttpCode(200)
  reanudar(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.programadas.cambiarEstado(user.sub, id, 'ACTIVA');
  }

  @Delete(':id')
  cancelar(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.programadas.cambiarEstado(user.sub, id, 'CANCELADA');
  }
}
