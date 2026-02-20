import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLocationDto) {
    try {
      return await this.prisma.location.create({
        data: dto,
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Location with name "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
    });
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
      description: description || `Ubicación creada automáticamente`,
    });
    return created.id;
  }

  async update(id: string, dto: UpdateLocationDto) {
    await this.ensureExists(id);
    return this.prisma.location.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.location.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.location.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Location ${id} not found`);
    }
  }
}
