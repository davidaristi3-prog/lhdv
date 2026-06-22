import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { OrderStatus, UserRole } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TransitionOrderDto } from './dto/transition-order.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { UPLOADS_DIR } from '../common/uploads';

// El domiciliario (DELIVERY) no accede a los pedidos del negocio: trabaja con /routes
// (Mi ruta) y /couriers (Mi cuenta). Los métodos de escritura restringen más (OWNER/SALES).
@Roles(UserRole.OWNER, UserRole.SALES, UserRole.KITCHEN)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query('status') status?: OrderStatus, @Query('date') date?: string) {
    return this.orders.list({ status, date });
  }

  @Get('board')
  board() {
    return this.orders.board();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.orders.createManual(dto, user.sub);
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orders.confirmManual(id, {
      byUserId: user.sub,
      reason: 'Enviado a cocina desde el panel',
    });
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateOrderDto) {
    return this.orders.updateDraft(id, dto);
  }

  @Patch(':id/transition')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.applyTransition(id, dto.to, {
      byUserId: user.sub,
      reason: dto.reason,
      actingRole: user.role,
      scrap: dto.scrap,
    });
  }

  /** Dar de baja un producto en producción con evidencia (motivo + foto opcional).
   *  Vuelve a CONFIRMED como merma (no repone insumos). */
  @Post(':id/scrap')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname) || '.jpg'}`),
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  scrap(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('reason') reason: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.applyTransition(id, 'CONFIRMED', {
      byUserId: user.sub,
      actingRole: user.role,
      scrap: true,
      reason: reason || 'Baja de producto',
      photoPath: file ? `/uploads/${file.filename}` : undefined,
    });
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orders.deleteDraft(id);
  }
}
