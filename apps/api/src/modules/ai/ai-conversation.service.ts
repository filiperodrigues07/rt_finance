import { Inject, Injectable } from "@nestjs/common";
import type { AiChannel, AiConversation } from "@prisma/client";
import { PrismaService } from "../../lib/prisma.service";
import { ENV, type Env } from "../../config/env.schema";

export interface PendingAction {
  kind: "expense" | "income" | "installment_purchase";
  summary: string;
  payload: Record<string, unknown>;
  createdAtIso: string;
}

@Injectable()
export class AiConversationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Carrega (ou cria) a conversa. Expira pendências vencidas na leitura (sem job). */
  async load(householdId: string, memberId: string, channel: AiChannel): Promise<AiConversation> {
    let conv = await this.prisma.aiConversation.findUnique({
      where: { memberId_channel: { memberId, channel } },
    });
    if (!conv) {
      conv = await this.prisma.aiConversation.create({
        data: { householdId, memberId, channel, state: "IDLE" },
      });
    }
    if (
      conv.state !== "IDLE" &&
      conv.pendingExpiresAt &&
      conv.pendingExpiresAt.getTime() < Date.now()
    ) {
      conv = await this.prisma.aiConversation.update({
        where: { id: conv.id },
        data: { state: "IDLE", pendingAction: undefined, pendingExpiresAt: null },
      });
    }
    return conv;
  }

  getPending(conv: AiConversation): PendingAction | null {
    if (conv.state === "IDLE" || !conv.pendingAction) return null;
    return conv.pendingAction as unknown as PendingAction;
  }

  async setPending(convId: string, pending: PendingAction, lastIntent: string): Promise<void> {
    const ttlMin = this.env.PENDING_CONFIRMATION_TTL_MINUTES;
    await this.prisma.aiConversation.update({
      where: { id: convId },
      data: {
        state: "AWAITING_CONFIRMATION",
        pendingAction: pending as unknown as object,
        pendingExpiresAt: new Date(Date.now() + ttlMin * 60_000),
        lastIntent,
      },
    });
  }

  async setEditing(convId: string): Promise<void> {
    await this.prisma.aiConversation.update({
      where: { id: convId },
      data: { state: "AWAITING_EDIT" },
    });
  }

  async clear(convId: string, lastIntent?: string): Promise<void> {
    await this.prisma.aiConversation.update({
      where: { id: convId },
      data: {
        state: "IDLE",
        pendingAction: undefined,
        pendingExpiresAt: null,
        ...(lastIntent ? { lastIntent } : {}),
      },
    });
  }

  async recordInteraction(input: {
    conversationId: string;
    messageId?: string | null;
    provider: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    intent?: string;
    confidence?: number;
    raw?: unknown;
  }): Promise<void> {
    await this.prisma.aiInteraction.create({
      data: {
        conversationId: input.conversationId,
        messageId: input.messageId ?? null,
        provider: input.provider,
        model: input.model,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        latencyMs: input.latencyMs ?? null,
        intent: input.intent ?? null,
        confidence: input.confidence ?? null,
        rawResponse:
          input.raw === undefined
            ? undefined
            : (JSON.parse(JSON.stringify({ raw: input.raw })) as object),
      },
    });
  }
}
