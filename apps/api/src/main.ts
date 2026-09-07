import "reflect-metadata";
import { Logger as NestLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import compress from "@fastify/compress";
import multipart from "@fastify/multipart";

import { AppModule } from "./app.module";
import { ENV, type Env } from "./config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  const env = app.get<Env>(ENV);

  // Casts: os tipos empacotados do fastify no @nestjs/platform-fastify divergem levemente
  // dos tipos dos plugins (augmentation de cookie). O runtime é compatível.
  // API só devolve JSON/arquivos — CSP restritiva + CORP mesmo-site.
  await app.register(helmet as never, {
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
  });
  await app.register(cookie as never);
  await app.register(compress as never, { global: true, threshold: 1024 });
  await app.register(multipart as never, {
    limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 10 },
  });

  app.enableCors({
    origin: env.WEB_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  });

  app.setGlobalPrefix("api", { exclude: ["health"] });
  app.enableShutdownHooks();

  // "::" = dual-stack (IPv4 + IPv6). Necessário na Fly: o DNS .internal (6PN) é IPv6.
  await app.listen(env.API_PORT, "::");
  NestLogger.log(`RT Finance API em http://localhost:${env.API_PORT}/api`, "Bootstrap");
}

void bootstrap();
