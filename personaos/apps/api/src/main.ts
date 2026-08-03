import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const config = app.get(ConfigService);
  const trustedOrigin = config.get<string>("AUTH_TRUSTED_ORIGIN") ?? "http://localhost:3000";

  app.enableCors({
    origin: trustedOrigin,
    credentials: true
  });

  app.setGlobalPrefix("api");

  const port = config.get<number>("API_PORT") ?? 4000;
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
