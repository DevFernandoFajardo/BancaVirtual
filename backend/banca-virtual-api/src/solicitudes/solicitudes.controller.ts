import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { CrearSolicitudDto, DecisionDto } from './solicitudes.schema';
import { SolicitudesService } from './solicitudes.service';

@ApiTags('Solicitudes de productos')
@Controller('solicitudes')
@Auth('CLIENTE')
export class SolicitudesController {
  constructor(private readonly solicitudes: SolicitudesService) {}

  /** Evalúa en el CORE y devuelve el resultado; el cliente decide con POST :id/decision */
  @Post()
  crear(@CurrentUser() user: AuthUser, @Body() dto: CrearSolicitudDto) {
    return this.solicitudes.crear(user.sub, dto);
  }

  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.solicitudes.listarDeCliente(user.sub);
  }

  @Get(':id')
  ver(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.solicitudes.verDeCliente(user.sub, id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decidir(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.solicitudes.decidir(user.sub, id, dto.aceptar);
  }
}
