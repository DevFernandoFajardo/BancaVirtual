import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/jwt-auth.guard';
import { ClientesService } from '../clientes/clientes.service';
import { PaginacionDto } from '../common/pagination.schema';
import { AbonoExternoDto, CuentaDesdeCpDto } from '../cuentas/cuentas.schema';
import { CuentasService } from '../cuentas/cuentas.service';
import { CambiarEstadoDto, FiltroSolicitudesDto } from '../solicitudes/solicitudes.schema';
import { SolicitudesService } from '../solicitudes/solicitudes.service';

export class EliminarClienteDto {
  @IsOptional()
  @Matches(/^\d{13}$/, { message: 'El DPI debe tener 13 dígitos' })
  dpi?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  correo?: string;
}

export class MensajeBancoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  titulo: string;

  @IsString()
  @MinLength(1)
  @MaxLength(400)
  mensaje: string;

  /** Si se omite, el mensaje llega a todos los clientes */
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

/**
 * API para la app administrativa. Se autentica con el header `X-Service-Key`
 * (o con un JWT de un usuario con rol ADMIN).
 */
@ApiTags('Administración')
@Controller('admin')
@Auth('ADMIN')
export class AdminController {
  constructor(
    private readonly solicitudes: SolicitudesService,
    private readonly clientes: ClientesService,
    private readonly cuentas: CuentasService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Get('solicitudes')
  listarSolicitudes(@Query() filtro: FiltroSolicitudesDto) {
    return this.solicitudes.listarAdmin(filtro);
  }

  @Get('solicitudes/:id')
  verSolicitud(@Param('id', ParseUUIDPipe) id: string) {
    return this.solicitudes.verAdmin(id);
  }

  /** Consulta de nuevo la evaluación original en el CORE (auditoría). */
  @Get('solicitudes/:id/core')
  evaluacionEnCore(@Param('id', ParseUUIDPipe) id: string) {
    return this.solicitudes.consultarEnCore(id);
  }

  @Patch('solicitudes/:id/estado')
  cambiarEstado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarEstadoDto) {
    return this.solicitudes.cambiarEstado(id, dto);
  }

  /** Mensaje del banco que aparece en la campanita del cliente (o de todos). */
  @Post('notificaciones')
  enviarMensaje(@Body() dto: MensajeBancoDto) {
    return this.notificaciones.enviarDelBanco(dto.titulo, dto.mensaje, dto.clienteId);
  }

  /**
   * Abono desde un sistema externo (p. ej. CP Gestiones al pagar una planilla). Header `X-Service-Key`.
   * Idempotente por `referencia`: si CP reenvía el mismo pago, no se acredita dos veces.
   */
  @Post('abonos')
  @HttpCode(200)
  abonar(@Body() dto: AbonoExternoDto) {
    return this.cuentas.abonoExterno(dto);
  }

  /** CP Gestiones eliminó al cliente: se borra aquí su ficha y todo lo que depende de ella. Header `X-Service-Key`. */
  @Post('clientes/eliminar')
  @HttpCode(200)
  eliminarCliente(@Body() dto: EliminarClienteDto) {
    return this.clientes.eliminarDesdeCp(dto.dpi, dto.correo);
  }

  /** CP Gestiones abrió una cuenta (ahorro o monetaria): se registra aquí enlazada al cliente por DPI. Idempotente. */
  @Post('cuentas')
  @HttpCode(200)
  registrarCuenta(@Body() dto: CuentaDesdeCpDto) {
    return this.cuentas.registrarDesdeCp(dto);
  }

  @Get('clientes')
  listarClientes(@Query() q: PaginacionDto) {
    return this.clientes.listarClientes(q.page, q.limit);
  }

  @Get('clientes/:id')
  async verCliente(@Param('id', ParseUUIDPipe) id: string) {
    const cliente = await this.clientes.obtener(id);
    return { ...this.clientes.toPublic(cliente), cuentas: await this.cuentas.listar(id) };
  }
}
