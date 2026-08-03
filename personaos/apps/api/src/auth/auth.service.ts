import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma.module";
import { createPasswordHash, verifyPassword } from "./password";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  getProviderManifest() {
    return {
      strategy: "better-auth-compatible",
      jwt: true,
      oauth: {
        enabled: true,
        providers: []
      },
      email: {
        enabled: true
      }
    };
  }

  async register(input: { email: string; password: string; name: string }) {
    const email = input.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      throw new ConflictException("A user with this email already exists.");
    }

    const passwordHash = await createPasswordHash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordCredential: {
          create: {
            passwordHash
          }
        }
      }
    });

    return this.createAuthResponse(user);
  }

  async login(input: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { passwordCredential: true }
    });

    if (!user?.passwordCredential) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const passwordIsValid = await verifyPassword(input.password, user.passwordCredential.passwordHash);

    if (!passwordIsValid) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    return this.createAuthResponse(user);
  }

  async getSession(userId: string) {
    const user = await this.prisma.user.findUnique({
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

    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }

    return { user };
  }

  private async createAuthResponse(user: { id: string; email: string; role: "USER" | "ADMIN" }) {
    const token = await this.jwtService.signAsync({
      id: user.id,
      email: user.email,
      role: user.role
    });

    return {
      token,
      user: await this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
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
      })
    };
  }
}
