"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ItemsService = class ItemsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto) {
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
        }
        catch (error) {
            if (error?.code === 'P2002') {
                throw new common_1.ConflictException('Barcode already exists');
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
        const map = new Map();
        totals.forEach((row) => map.set(row.itemId, row._sum.delta ? row._sum.delta : 0));
        return items.map((item) => ({
            ...item,
            quantity: map.get(item.id) ?? 0,
        }));
    }
    async findOne(id) {
        const item = await this.prisma.item.findUnique({
            where: { id },
            include: { category: true },
        });
        if (!item) {
            throw new common_1.NotFoundException(`Item ${id} not found`);
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
    async findByBarcode(barcode) {
        const item = await this.prisma.item.findUnique({
            where: { barcode },
            include: { category: true },
        });
        if (!item) {
            throw new common_1.NotFoundException(`Item with barcode ${barcode} not found`);
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
    async update(id, dto) {
        await this.ensureExists(id);
        try {
            await this.prisma.item.update({
                where: { id },
                data: {
                    ...dto,
                    unit: dto.unit ?? undefined,
                },
            });
        }
        catch (error) {
            if (error?.code === 'P2002') {
                throw new common_1.ConflictException('Barcode already exists');
            }
            throw error;
        }
        return this.findOne(id);
    }
    async adjustStock(id, dto) {
        await this.ensureExists(id);
        return this.prisma.stockMovement.create({
            data: {
                itemId: id,
                delta: dto.delta,
                reason: dto.reason,
            },
        });
    }
    async remove(id) {
        await this.ensureExists(id);
        await this.prisma.stockMovement.deleteMany({ where: { itemId: id } });
        return this.prisma.item.delete({ where: { id } });
    }
    async ensureExists(id) {
        const exists = await this.prisma.item.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!exists) {
            throw new common_1.NotFoundException(`Item ${id} not found`);
        }
    }
};
exports.ItemsService = ItemsService;
exports.ItemsService = ItemsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ItemsService);
//# sourceMappingURL=items.service.js.map