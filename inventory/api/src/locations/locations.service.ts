import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLocationDto) {
    try {
      return await this.prisma.location.create({ data: dto });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Location name already exists');
      }
      throw error;
    }
  }

  findAll() {
    return this.prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new NotFoundException(`Location ${id} not found`);
    }
    return location;
  }

  async findByName(name: string) {
    return this.prisma.location.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
      },
    });
  }

  async resolveLocationId(name: string, description?: string) {
    const normalized = name.trim();
    const existing = await this.findByName(normalized);
    if (existing) {
      return existing.id;
    }
    const created = await this.create({
      name: normalized,
      description: description || `Auto created location`,
    });
    return created.id;
  }

  async update(id: string, dto: Partial<CreateLocationDto>) {
    await this.findOne(id);
    try {
      return await this.prisma.location.update({
        where: { id },
        data: dto,
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Location name already exists');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.location.delete({ where: { id } });
  }
}
