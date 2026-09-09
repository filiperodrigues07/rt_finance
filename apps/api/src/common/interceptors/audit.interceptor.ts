import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { tap } from "rxjs";
import { PrismaService } from "../../lib/prisma.service";
import type { AuthUser } from "@rt-finance/shared";

/** Entidades de dinheiro cujas mutações (POST/PATCH/DELETE) geram AuditLog. */
const AUDITED = [
  "transactions",
  "installments",
  "credit-cards",
  "accounts",
  "budgets",
  "goals",
  "invoices",
  "imports",
  "household",
  "admin",
];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Audit");

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const method = req.method;
    const shouldAudit =
      ["POST", "PATCH", "PUT", "DELETE"].includes(method) &&
      AUDITED.some((p) => req.url.includes(`/api/${p}`));

    if (!shouldAudit) return next.handle();

    return next.handle().pipe(
      tap((result: unknown) => {
        const user = req.user;
        if (!user) return;
        const entityId =
          (req.params as { id?: string })?.id ??
          (result && typeof result === "object" && "id" in result
            ? String((result as { id: unknown }).id)
            : "n/a");
        this.prisma.auditLog
          .create({
            data: {
              householdId: user.householdId,
              actorUserId: user.id,
              action: method,
              entity: req.url.replace(/^\/api\//, "").split("/")[0] ?? "unknown",
              entityId,
              after: undefined,
            },
          })
          .catch((err) => this.logger.warn(`falha ao gravar auditoria: ${(err as Error).message}`));
      }),
    );
  }
}
