import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateItemDto) {
    const { initialQuantity, ...data } = dto;
    try {
      const item = await this.prisma.item.create({
        data: {
          ...data,
          unit: data.unit ?? 'unit',
        },
      });
      if (initialQuantity && initialQuantity !== 0) {
        await this.prisma.stockMovement.create({
          data: {
            itemId: item.id,
            delta: initialQuantity,
            reason: 'Initial stock',
          },
        });
      }
      return this.findOne(item.id);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Barcode already exists');
      }
      throw error;
    }
  }

  async findAll() {
    const [items, totals] = await Promise.all([
      this.prisma.item.findMany({
        include: { category: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['itemId'],
        _sum: { delta: true },
      }),
    ]);

    const map = new Map<string, number>();
    totals.forEach((row) =>
      map.set(row.itemId, row._sum.delta ? row._sum.delta : 0),
    );

    return items.map((item) => ({
      ...item,
      quantity: map.get(item.id) ?? 0,
    }));
  }

  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) {
      throw new NotFoundException(`Item ${id} not found`);
    }
    const aggregate = await this.prisma.stockMovement.aggregate({
      where: { itemId: id },
      _sum: { delta: true },
    });
    return {
      ...item,
      quantity: aggregate._sum.delta ?? 0,
    };
  }

  async findByBarcode(barcode: string) {
    const item = await this.prisma.item.findUnique({
      where: { barcode },
      include: { category: true },
    });
    if (!item) {
      throw new NotFoundException(`Item with barcode ${barcode} not found`);
    }
    const aggregate = await this.prisma.stockMovement.aggregate({
      where: { itemId: item.id },
      _sum: { delta: true },
    });
    return {
      ...item,
      quantity: aggregate._sum.delta ?? 0,
    };
  }

  async update(id: string, dto: UpdateItemDto) {
    await this.ensureExists(id);
    try {
      await this.prisma.item.update({
        where: { id },
        data: {
          ...dto,
          unit: dto.unit ?? undefined,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Barcode already exists');
      }
      throw error;
    }
    return this.findOne(id);
  }

  async adjustStock(id: string, dto: AdjustStockDto) {
    await this.ensureExists(id);
    return this.prisma.stockMovement.create({
      data: {
        itemId: id,
        delta: dto.delta,
        reason: dto.reason,
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.stockMovement.deleteMany({ where: { itemId: id } });
    return this.prisma.item.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.item.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Item ${id} not found`);
    }
  }
}
