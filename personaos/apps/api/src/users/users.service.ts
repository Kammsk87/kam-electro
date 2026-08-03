import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.module";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getCurrentUser(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        onboardingDone: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }
}
