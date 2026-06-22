import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { UserRole } from '@prisma/client';
import { RoutesService } from './routes.service';
import { AddOrdersDto, CreateRouteDto, DeliveredDto, LocationDto, ReturnOrderDto } from './dto/route.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { UPLOADS_DIR } from '../common/uploads';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Roles(UserRole.OWNER)
  @Get('available')
  available(@Query('upcoming') upcoming?: string) {
    return this.routes.availableOrders(upcoming === 'true');
  }

  @Roles(UserRole.OWNER)
  @Get('suggest')
  suggest(@Query('upcoming') upcoming?: string) {
    return this.routes.suggestAssignments(upcoming === 'true');
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Get('mine')
  mine(@CurrentUser() user: JwtPayload) {
    return this.routes.myRoutes(user.sub);
  }

  @Roles(UserRole.OWNER)
  @Get()
  list() {
    return this.routes.list();
  }

  // Tablero de seguimiento en vivo: lo ve también el rol comercial (SALES).
  @Roles(UserRole.OWNER, UserRole.SALES)
  @Get('live')
  live() {
    return this.routes.liveRoutes();
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.routes.get(id);
  }

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateRouteDto) {
    return this.routes.create(dto);
  }

  @Roles(UserRole.OWNER)
  @Post(':id/reorder')
  reorder(@Param('id') id: string) {
    return this.routes.reorder(id);
  }

  // Juntar dos rutas del mismo domiciliario en una (recalcula el orden).
  @Roles(UserRole.OWNER)
  @Post(':id/merge/:sourceId')
  merge(@Param('id') id: string, @Param('sourceId') sourceId: string) {
    return this.routes.mergeRoutes(id, sourceId);
  }

  @Roles(UserRole.OWNER)
  @Post(':id/finish')
  finish(@Param('id') id: string) {
    return this.routes.finishRoute(id);
  }

  @Roles(UserRole.OWNER)
  @Post(':id/add')
  addToRoute(@Param('id') id: string, @Body() dto: AddOrdersDto) {
    return this.routes.addToRoute(id, dto.orderIds);
  }

  @Roles(UserRole.OWNER)
  @Post(':id/orders/:orderId/remove')
  removeFromRoute(@Param('id') id: string, @Param('orderId') orderId: string) {
    return this.routes.removeFromRoute(id, orderId);
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.routes.start(id, user.sub, user.role);
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post(':id/location')
  location(@Param('id') id: string, @Body() dto: LocationDto) {
    return this.routes.updateLocation(id, dto.lat, dto.lng);
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post('orders/:orderId/delivered')
  delivered(
    @Param('orderId') orderId: string,
    @Body() dto: DeliveredDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routes.markDelivered(orderId, { userId: user.sub, role: user.role, notes: dto.notes });
  }

  /** "No entregado": devuelve el pedido a la planta (al stock o reprogramar). */
  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post('orders/:orderId/return')
  returnOrder(
    @Param('orderId') orderId: string,
    @Body() dto: ReturnOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routes.returnOrder(orderId, dto.mode, {
      userId: user.sub,
      role: user.role,
      notes: dto.notes,
    });
  }

  /** Marca entregado adjuntando la foto de evidencia (multipart, campo "photo"). */
  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post('orders/:orderId/deliver-photo')
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
  deliverWithPhoto(
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: DeliveredDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routes.markDelivered(orderId, {
      userId: user.sub,
      role: user.role,
      notes: dto.notes,
      photoPath: file ? `/uploads/${file.filename}` : undefined,
    });
  }

  /** Agrega la foto de evidencia a un pedido YA entregado (no cambia el estado). */
  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post('orders/:orderId/add-photo')
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
  addPhoto(
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.routes.addDeliveryPhoto(orderId, file ? `/uploads/${file.filename}` : undefined);
  }
}
