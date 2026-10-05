import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.schema';
import { Auth, CurrentUser } from '../auth/jwt-auth.guard';
import { AbrirCuentaDto, DepositoDemoDto, FiltroMovimientosDto, LiquidarPlazoDto, PeriodoDto, PlazoFijoDto } from './cuentas.schema';
import { CuentasService } from './cuentas.service';

@ApiTags('Cuentas')
@Controller('cuentas')
@Auth('CLIENTE')
export class CuentasController {
  constructor(private readonly cuentas: CuentasService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.cuentas.listar(user.sub);
  }

  @Post()
  abrir(@CurrentUser() user: AuthUser, @Body() dto: AbrirCuentaDto) {
    return this.cuentas.abrir(user.sub, dto.tipo, dto.alias);
  }

  @Post('plazo-fijo')
  plazoFijo(@CurrentUser() user: AuthUser, @Body() dto: PlazoFijoDto) {
    return this.cuentas.constituirPlazoFijo(user.sub, dto.cuentaOrigenId, dto.monto, dto.plazoMeses);
  }

  // Debe ir antes de ':id' para que "validar" no se interprete como un id
  @Get('validar/:numero')
  validar(@Param('numero') numero: string) {
    return this.cuentas.validarNumero(numero);
  }

  @Get(':id')
  obtener(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cuentas.obtener(user.sub, id);
  }

  @Get(':id/movimientos')
  movimientos(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: FiltroMovimientosDto) {
    return this.cuentas.listarMovimientos(user.sub, id, q);
  }

  @Get(':id/estado-cuenta')
  estadoDeCuenta(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() p: PeriodoDto) {
    return this.cuentas.estadoDeCuenta(user.sub, id, p);
  }

  @Post(':id/liquidar')
  liquidar(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LiquidarPlazoDto) {
    return this.cuentas.liquidarPlazoFijo(user.sub, id, dto.cuentaDestinoId);
  }

  @Post(':id/deposito-demo')
  depositoDemo(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DepositoDemoDto) {
    return this.cuentas.depositoDemo(user.sub, id, dto.monto);
  }
}
