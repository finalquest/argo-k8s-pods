import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { load } from 'cheerio';
import slugify from 'slugify';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from '../locations/locations.service';
import { UnitsService } from '../units/units.service';
import { CreatePantryItemDto } from './dto/create-pantry-item.dto';
import { UpdatePantryItemDto } from './dto/update-pantry-item.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class PantryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationsService: LocationsService,
    private readonly unitsService: UnitsService,
  ) {}

  private encEndpoint =
    process.env.ENC_SEARCH_URL ?? 'https://enc.finalq.xyz/search?q=';

  async create(dto: CreatePantryItemDto) {
    const {
      initialQuantity,
      externalCategoryName,
      externalLocationName,
      externalUnitName,
      expirationDate,
      ...data
    } = dto;

    let categoryId = data.categoryId;
    let locationId = data.locationId;
    let unitId = data.unitId;

    // Resolve category
    if (!categoryId) {
      if (!externalCategoryName) {
        throw new ConflictException('Category is required');
      }
      categoryId = await this.resolveCategoryId(externalCategoryName);
    }

    // Resolve location
    if (!locationId) {
      if (!externalLocationName) {
        throw new ConflictException('Location is required');
      }
      locationId = await this.locationsService.resolveLocationId(
        externalLocationName,
      );
    }

    // Resolve unit
    if (!unitId) {
      if (!externalUnitName) {
        // Default to first unit (unidad) if not specified
        const defaultUnit = await this.prisma.unit.findFirst({
          orderBy: { name: 'asc' },
        });
        unitId = defaultUnit?.id;
      } else {
        unitId = await this.unitsService.resolveUnitId(externalUnitName);
      }
    }

    try {
      const item = await this.prisma.pantryItem.create({
        data: {
          ...data,
          categoryId: categoryId!,
          locationId: locationId!,
          unitId: unitId!,
          expirationDate: expirationDate ? new Date(expirationDate) : undefined,
        },
        include: {
          category: true,
          location: true,
          unit: true,
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

  async findAll(locationId?: string, categoryId?: string) {
    const where: any = {};
    if (locationId) where.locationId = locationId;
    if (categoryId) where.categoryId = categoryId;

    const [items, totals] = await Promise.all([
      this.prisma.pantryItem.findMany({
        where,
        include: {
          category: true,
          location: true,
          unit: true,
        },
        orderBy: { updatedAt: 'desc' },
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
    const item = await this.prisma.pantryItem.findUnique({
      where: { id },
      include: {
        category: true,
        location: true,
        unit: true,
      },
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
    const item = await this.prisma.pantryItem.findUnique({
      where: { barcode },
      include: {
        category: true,
        location: true,
        unit: true,
      },
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

  async update(id: string, dto: UpdatePantryItemDto) {
    await this.ensureExists(id);

    const {
      initialQuantity,
      externalCategoryName,
      externalLocationName,
      externalUnitName,
      expirationDate,
      ...data
    } = dto;

    let categoryId = data.categoryId;
    let locationId = data.locationId;
    let unitId = data.unitId;

    // Resolve category if provided as external name
    if (externalCategoryName && !categoryId) {
      categoryId = await this.resolveCategoryId(externalCategoryName);
    }

    // Resolve location if provided as external name
    if (externalLocationName && !locationId) {
      locationId = await this.locationsService.resolveLocationId(
        externalLocationName,
      );
    }

    // Resolve unit if provided as external name
    if (externalUnitName && !unitId) {
      unitId = await this.unitsService.resolveUnitId(externalUnitName);
    }

    try {
      await this.prisma.pantryItem.update({
        where: { id },
        data: {
          ...data,
          categoryId: categoryId || undefined,
          locationId: locationId || undefined,
          unitId: unitId || undefined,
          expirationDate: expirationDate ? new Date(expirationDate) : undefined,
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
    return this.prisma.pantryItem.delete({ where: { id } });
  }

  // Kitchen-specific features

  async freeze(id: string) {
    const item = await this.findOne(id);
    if (item.frozenAt) {
      return item; // Already frozen
    }
    await this.prisma.pantryItem.update({
      where: { id },
      data: { frozenAt: new Date() },
    });
    return this.findOne(id);
  }

  async thaw(id: string) {
    const item = await this.findOne(id);
    if (!item.frozenAt) {
      return item; // Not frozen
    }
    await this.prisma.pantryItem.update({
      where: { id },
      data: { frozenAt: null },
    });
    return this.findOne(id);
  }

  async findExpiringSoon(days: number = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const [items, totals] = await Promise.all([
      this.prisma.pantryItem.findMany({
        where: {
          expirationDate: {
            lte: cutoff,
            not: null,
          },
        },
        include: {
          category: true,
          location: true,
          unit: true,
        },
        orderBy: { expirationDate: 'asc' },
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

    return items
      .map((item) => ({
        ...item,
        quantity: map.get(item.id) ?? 0,
      }))
      .filter((item) => item.quantity > 0);
  }

  async findLowStock() {
    const [items, totals] = await Promise.all([
      this.prisma.pantryItem.findMany({
        where: {
          minQuantity: {
            gt: 0,
          },
        },
        include: {
          category: true,
          location: true,
          unit: true,
        },
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

    return items
      .map((item) => ({
        ...item,
        quantity: map.get(item.id) ?? 0,
      }))
      .filter((item) => item.quantity <= item.minQuantity);
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

  // External lookup (Open Food Facts + custom endpoint)

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
      const res = await fetch(
        `${this.encEndpoint}${encodeURIComponent(barcode)}`,
      );
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

  private async ensureExists(id: string) {
    const exists = await this.prisma.pantryItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Item ${id} not found`);
    }
  }
}
