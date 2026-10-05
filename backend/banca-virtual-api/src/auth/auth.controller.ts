import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, LoginDto, RegisterDto, VerificarDosFactoresDto } from './auth.schema';
import { AuthService, MetaSesion } from './auth.service';
import { Auth, CurrentUser } from './jwt-auth.guard';

const meta = (req: any): MetaSesion => ({ ip: req.ip, userAgent: req.headers?.['user-agent'] });

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.auth.register(dto, meta(req));
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.auth.login(dto, meta(req));
  }

  /** Segundo paso del login cuando el cliente tiene la verificación en dos pasos activada. */
  @Post('2fa/verificar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verificar(@Body() dto: VerificarDosFactoresDto, @Req() req: any) {
    return this.auth.verificarDosFactores(dto.desafio, dto.codigo, meta(req));
  }

  @Post('logout')
  @HttpCode(200)
  @Auth('CLIENTE', 'ADMIN')
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logout(user);
  }
}
