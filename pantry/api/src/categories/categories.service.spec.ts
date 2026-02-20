import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

const createMockPrisma = () => ({
  category: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: createMockPrisma() },
      ],
    }).compile();

    service = module.get(CategoriesService);
    prisma = module.get(PrismaService);
  });

  describe('create', () => {
    it('creates a category', async () => {
      const dto = { name: 'Electricidad', description: 'desc' };
      prisma.category.create.mockResolvedValue({ id: '1', ...dto });

      await expect(service.create(dto)).resolves.toEqual({ id: '1', ...dto });
      expect(prisma.category.create).toHaveBeenCalledWith({ data: dto });
    });

    it('throws on duplicate name', async () => {
      prisma.category.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.create({ name: 'dup' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('returns categories ordered by name', async () => {
      prisma.category.findMany.mockResolvedValue([{ id: '1', name: 'A' }]);
      await expect(service.findAll()).resolves.toEqual([{ id: '1', name: 'A' }]);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns category when exists', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: '1' });
      await expect(service.findOne('1')).resolves.toEqual({ id: '1' });
    });

    it('throws NotFound when missing', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates category', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: '1' });
      prisma.category.update.mockResolvedValue({ id: '1', name: 'new' });

      await expect(service.update('1', { name: 'new' })).resolves.toEqual({
        id: '1',
        name: 'new',
      });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'new' },
      });
    });
  });

  describe('remove', () => {
    it('deletes category', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: '1' });
      prisma.category.delete.mockResolvedValue({ id: '1' });

      await expect(service.remove('1')).resolves.toEqual({ id: '1' });
      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });
  });
});
