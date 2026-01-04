import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { load } from 'cheerio';
import slugify from 'slugify';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}
  private encEndpoint =
    process.env.ENC_SEARCH_URL ?? 'https://enc.finalq.xyz/search?q=';

  async create(dto: CreateItemDto) {
    const { initialQuantity, externalCategoryName, ...data } = dto;
    let categoryId = data.categoryId;
    if (!categoryId) {
      if (!externalCategoryName) {
        throw new ConflictException('Category is required');
      }
      categoryId = await this.resolveCategoryId(externalCategoryName);
    }
    try {
      const item = await this.prisma.item.create({
        data: {
          ...data,
          categoryId: categoryId!,
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

  async lookupExternal(barcode: string) {
    const encProduct = await this.fetchEncProduct(barcode);
    if (encProduct) {
      return { source: 'enc', ...encProduct };
    }
    const offProduct = await this.fetchOpenFoodProduct(barcode);
    if (offProduct) {
      return { source: 'openfoodfacts', ...offProduct };
    }
    throw new NotFoundException(`No external data for barcode ${barcode}`);
  }

  private async fetchEncProduct(barcode: string) {
    if (!globalThis.fetch) return null;
    try {
      const res = await fetch(`${this.encEndpoint}${encodeURIComponent(barcode)}`);
      if (!res.ok) return null;
      const html = await res.text();
      const $ = load(html);
      const name = $('.product-name').first().text().trim();
      if (!name) return null;
      const info: Record<string, string> = {};
      $('table.table tr').each((_, el) => {
        const cells = $(el).find('td');
        if (cells.length < 2) return;
        const label = cells.eq(0).text().trim().toLowerCase();
        const value = cells.eq(1).text().trim();
        if (!label || !value) return;
        info[label] = value;
      });
      const image =
        $('.product-image img').first().attr('src') ??
        $('.product-image img').first().attr('data-src');
      return {
        name,
        brand: info['brand'],
        category: info['category'],
        quantity: info['quantity'],
        image,
      };
    } catch {
      return null;
    }
  }

  private async fetchOpenFoodProduct(barcode: string) {
    if (!globalThis.fetch) return null;
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== 1) return null;
      const product = data.product ?? {};
      return {
        name: product.product_name ?? barcode,
        brand: product.brands,
        quantity: product.quantity,
        image: product.image_front_small_url ?? product.image_url,
        category: product.categories,
      };
    } catch {
      return null;
    }
  }

  private async resolveCategoryId(name: string) {
    const normalized = name.trim();
    const existing = await this.prisma.category.findFirst({
      where: {
        name: { equals: normalized, mode: 'insensitive' },
      },
    });
    if (existing) {
      return existing.id;
    }
    const slug = slugify(normalized, { lower: true, strict: true });
    const created = await this.prisma.category.create({
      data: {
        name: normalized,
        description: `Auto creada desde lookup externo (${slug})`,
      },
    });
    return created.id;
  }

  async extractOne(id: string) {
    const item = await this.findOne(id);
    if (item.quantity <= 0) {
      return item;
    }
    await this.prisma.stockMovement.create({
      data: {
        itemId: id,
        delta: -1,
        reason: 'Extraction',
      },
    });
    return this.findOne(id);
  }
}
