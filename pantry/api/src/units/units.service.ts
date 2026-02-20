import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUnitDto) {
    try {
      return await this.prisma.unit.create({
        data: dto,
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`Unit with name "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.unit.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
    });
    if (!unit) {
      throw new NotFoundException(`Unit ${id} not found`);
    }
    return unit;
  }

  async findByName(name: string) {
    return this.prisma.unit.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
      },
    });
  }

  async resolveUnitId(name: string, abbreviation?: string) {
    const normalized = name.trim();
    const existing = await this.findByName(normalized);
    if (existing) {
      return existing.id;
    }
    const created = await this.create({
      name: normalized,
      abbreviation: abbreviation || normalized,
    });
    return created.id;
  }

  async update(id: string, dto: UpdateUnitDto) {
    await this.ensureExists(id);
    return this.prisma.unit.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.unit.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.unit.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Unit ${id} not found`);
    }
  }
}
