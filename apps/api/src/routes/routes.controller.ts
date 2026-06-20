import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { UserRole } from '@prisma/client';
import { RoutesService } from './routes.service';
import { CreateRouteDto, DeliveredDto, LocationDto } from './dto/route.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { UPLOADS_DIR } from '../common/uploads';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Roles(UserRole.OWNER)
  @Get('available')
  available() {
    return this.routes.availableOrders();
  }

  @Roles(UserRole.OWNER)
  @Get('suggest')
  suggest() {
    return this.routes.suggestAssignments();
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Get('mine')
  mine(@CurrentUser() user: JwtPayload) {
    return this.routes.myActiveRoute(user.sub);
  }

  @Roles(UserRole.OWNER)
  @Get()
  list() {
    return this.routes.list();
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
}
