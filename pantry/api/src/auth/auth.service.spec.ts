import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
}));
const bcrypt = require('bcryptjs') as { compare: jest.Mock };

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    jest.clearAllMocks();
    bcrypt.compare.mockResolvedValue(true);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('token') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
  });

  it('logs in with valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user1',
      username: 'admin',
      passwordHash: 'hash',
    });

    await expect(service.login('admin', 'admin')).resolves.toEqual({
      access_token: 'token',
    });
  });

  it('throws Unauthorized on invalid user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login('bad', 'pwd')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws Unauthorized on invalid password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user1',
      username: 'admin',
      passwordHash: 'hash',
    });
    bcrypt.compare.mockResolvedValue(false);

    await expect(service.login('admin', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
