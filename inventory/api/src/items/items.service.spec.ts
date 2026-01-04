import { Test, TestingModule } from '@nestjs/testing';
import { ItemsService } from './items.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

const createMockPrisma = () => ({
  item: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  stockMovement: {
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
});

describe('ItemsService', () => {
  let service: ItemsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: PrismaService, useValue: createMockPrisma() },
      ],
    }).compile();

    service = module.get(ItemsService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates item and initial stock movement', async () => {
      const dto = {
        name: 'Taladro',
        barcode: '123',
        categoryId: 'cat1',
        initialQuantity: 5,
      };
      const created = { id: 'item1', ...dto };
      prisma.item.create.mockResolvedValue(created);
      prisma.stockMovement.create.mockResolvedValue({
        id: 'mov1',
        itemId: 'item1',
        delta: 5,
      });
      prisma.item.findUnique.mockResolvedValueOnce({
        ...created,
        category: { id: 'cat1', name: 'Cat' },
      });
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { delta: 5 },
      });

      await expect(service.create(dto)).resolves.toMatchObject({
        id: 'item1',
        quantity: 5,
      });
      expect(prisma.item.create).toHaveBeenCalled();
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: { itemId: 'item1', delta: 5, reason: 'Initial stock' },
      });
    });

    it('throws on duplicate barcode', async () => {
      prisma.item.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.create({ name: 'Dup', barcode: '123', categoryId: 'cat' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns items with quantity sums', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 'a', name: 'A', category: { id: 'c', name: 'Cat' } },
      ]);
      prisma.stockMovement.groupBy.mockResolvedValue([
        { itemId: 'a', _sum: { delta: 7 } },
      ]);

      await expect(service.findAll()).resolves.toEqual([
        { id: 'a', name: 'A', category: { id: 'c', name: 'Cat' }, quantity: 7 },
      ]);
    });
  });

  describe('findOne', () => {
    it('returns item with quantity', async () => {
      prisma.item.findUnique.mockResolvedValue({
        id: 'item1',
        name: 'Item',
        category: { id: 'c', name: 'Cat' },
      });
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { delta: 2 },
      });

      await expect(service.findOne('item1')).resolves.toEqual({
        id: 'item1',
        name: 'Item',
        category: { id: 'c', name: 'Cat' },
        quantity: 2,
      });
    });

    it('throws NotFound when missing', async () => {
      prisma.item.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('adjustStock', () => {
    it('creates stock movement after ensuring item exists', async () => {
      prisma.item.findUnique.mockResolvedValue({ id: 'item1' });
      prisma.stockMovement.create.mockResolvedValue({ id: 'mov', delta: 3 });

      await service.adjustStock('item1', { delta: 3 });
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: { itemId: 'item1', delta: 3, reason: undefined },
      });
    });
  });

  describe('remove', () => {
    it('deletes movements and item', async () => {
      prisma.item.findUnique.mockResolvedValue({ id: 'item1' });
      prisma.item.delete.mockResolvedValue({ id: 'item1' });

      await service.remove('item1');
      expect(prisma.stockMovement.deleteMany).toHaveBeenCalledWith({
        where: { itemId: 'item1' },
      });
      expect(prisma.item.delete).toHaveBeenCalledWith({
        where: { id: 'item1' },
      });
    });
  });
});
