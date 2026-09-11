import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { from, switchMap, tap } from "rxjs";
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

    // Nome exato do método do controller (ex.: "create", "pay", "remove", "duplicate",
    // "bulkPay") — identifica a ação sem ambiguidade, ao contrário de tentar adivinhar
    // pela URL (que mistura sub-rotas como /transactions/:id/pay e /transactions/:id).
    const action = ctx.getHandler().name;
    const entity = req.url.replace(/^\/api\//, "").split(/[/?]/)[0] ?? "unknown";
    const params = req.params as { id?: string };

    // Snapshot de "antes" só pro caso que o feed de Atividade precisa: excluir um
    // lançamento. Depois de apagado não dá mais pra saber o que era. Lido ANTES do
    // handler rodar (por isso o switchMap encadeado, não um .then solto).
    const needsBefore =
      ctx.getClass().name === "TransactionsController" && action === "remove" && !!params?.id;
    const before$ = from(
      needsBefore
        ? this.prisma.transaction
            .findUnique({
              where: { id: params.id! },
              select: { type: true, amountCents: true, description: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
    );

    return before$.pipe(
      switchMap((before) =>
        next.handle().pipe(
          tap((result: unknown) => {
            const user = req.user;
            if (!user) return;
            const entityId =
              params?.id ??
              (result && typeof result === "object" && "id" in result
                ? String((result as { id: unknown }).id)
                : "n/a");
            this.prisma.auditLog
              .create({
                data: {
                  householdId: user.householdId,
                  actorUserId: user.id,
                  action,
                  entity,
                  entityId,
                  before: (before ?? undefined) as Prisma.InputJsonObject | undefined,
                },
              })
              .catch((err) => this.logger.warn(`falha ao gravar auditoria: ${(err as Error).message}`));
          }),
        ),
      ),
    );
  }
}
