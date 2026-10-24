import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { CelularDto, UpdatePerfilDto } from './clientes.schema';
import { ClientesService } from './clientes.service';

@ApiTags('Perfil')
@Controller('clientes/me')
@Auth('CLIENTE')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  async perfil(@CurrentUser() user: AuthUser) {
    return this.clientes.toPublic(await this.clientes.obtener(user.sub));
  }

  /** Datos financieros declarados (se usan al evaluar solicitudes en el CORE). */
  @Patch()
  async actualizar(@CurrentUser() user: AuthUser, @Body() dto: UpdatePerfilDto) {
    return this.clientes.toPublic(await this.clientes.actualizarPerfil(user.sub, dto));
  }

  /** Celular con el que otros clientes pueden enviarte dinero y la cuenta donde lo recibes. */
  @Get('celular')
  celular(@CurrentUser() user: AuthUser) {
    return this.clientes.obtenerCelular(user.sub);
  }

  @Put('celular')
  guardarCelular(@CurrentUser() user: AuthUser, @Body() dto: CelularDto) {
    return this.clientes.guardarCelular(user.sub, dto.telefono, dto.cuentaId);
  }
}
