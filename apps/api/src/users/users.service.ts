import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: PUBLIC_FIELDS,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          role: dto.role,
          passwordHash: await bcrypt.hash(dto.password, 10),
        },
        select: PUBLIC_FIELDS,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    const willDeactivate = dto.active === false;
    const losesOwner =
      target.role === 'OWNER' && (willDeactivate || (dto.role !== undefined && dto.role !== 'OWNER'));

    if (willDeactivate && id === actingUserId) {
      throw new BadRequestException('No podés desactivarte a vos misma');
    }
    if (losesOwner) {
      const otherActiveOwners = await this.prisma.user.count({
        where: { role: 'OWNER', active: true, id: { not: id } },
      });
      if (otherActiveOwners === 0) {
        throw new BadRequestException('Debe quedar al menos un dueño activo');
      }
    }

    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      role: dto.role,
      active: dto.active,
    };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({ where: { id }, data, select: PUBLIC_FIELDS });
  }
}
