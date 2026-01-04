import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
export declare class ItemsController {
    private readonly itemsService;
    constructor(itemsService: ItemsService);
    create(dto: CreateItemDto): Promise<{
        quantity: number;
        category: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            description: string | null;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        barcode: string;
        notes: string | null;
        unit: string;
        photoPath: string | null;
        categoryId: string;
    }>;
    findAll(): Promise<{
        quantity: number;
        category: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            description: string | null;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        barcode: string;
        notes: string | null;
        unit: string;
        photoPath: string | null;
        categoryId: string;
    }[]>;
    findOne(id: string): Promise<{
        quantity: number;
        category: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            description: string | null;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        barcode: string;
        notes: string | null;
        unit: string;
        photoPath: string | null;
        categoryId: string;
    }>;
    findByBarcode(barcode: string): Promise<{
        quantity: number;
        category: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            description: string | null;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        barcode: string;
        notes: string | null;
        unit: string;
        photoPath: string | null;
        categoryId: string;
    }>;
    update(id: string, dto: UpdateItemDto): Promise<{
        quantity: number;
        category: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            description: string | null;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        barcode: string;
        notes: string | null;
        unit: string;
        photoPath: string | null;
        categoryId: string;
    }>;
    adjust(id: string, dto: AdjustStockDto): Promise<{
        id: string;
        createdAt: Date;
        delta: number;
        reason: string | null;
        itemId: string;
    }>;
    remove(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        barcode: string;
        notes: string | null;
        unit: string;
        photoPath: string | null;
        categoryId: string;
    }>;
}
