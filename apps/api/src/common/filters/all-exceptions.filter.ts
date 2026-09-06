import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiErrorBody } from "@rt-finance/shared";

/** Converte qualquer erro num envelope { statusCode, error, message, requestId, timestamp, path }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = "InternalServerError";
    let message: string | string[] = "Erro interno";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
        error = exception.name;
      } else {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? exception.message;
        error = (b.error as string) ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      status = mapped.status;
      error = mapped.error;
      message = mapped.message;
    } else if (exception instanceof Error) {
      message = process.env.NODE_ENV === "production" ? "Erro interno" : exception.message;
    }

    if (status >= 500) {
      this.logger.error(
        { err: exception, path: req.url, method: req.method },
        "Erro não tratado",
      );
    }

    const payload: ApiErrorBody = {
      statusCode: status,
      error,
      message,
      requestId: (req as unknown as { id?: string }).id,
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    void res.status(status).send(payload);
  }
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
  status: number;
  error: string;
  message: string;
} {
  switch (e.code) {
    case "P2002":
      return {
        status: HttpStatus.CONFLICT,
        error: "Conflict",
        message: `Registro duplicado (${(e.meta?.target as string[] | undefined)?.join(", ") ?? "campo único"})`,
      };
    case "P2025":
      return { status: HttpStatus.NOT_FOUND, error: "NotFound", message: "Registro não encontrado" };
    case "P2003":
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        error: "ForeignKeyViolation",
        message: "Referência inválida ou registro em uso",
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        error: "DatabaseError",
        message: process.env.NODE_ENV === "production" ? "Erro de banco de dados" : e.message,
      };
  }
}
