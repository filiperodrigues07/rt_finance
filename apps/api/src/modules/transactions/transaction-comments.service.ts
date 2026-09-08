import { Injectable } from "@nestjs/common";
import type { TransactionCommentDTO } from "@rt-finance/shared";
import { PrismaService } from "../../lib/prisma.service";
import { ForbiddenException } from "@nestjs/common";
import { NotFoundError } from "../../common/errors/domain-error";
import { NotificationsService } from "../notifications/notifications.service";

const AUTHOR_SELECT = {
  id: true,
  displayName: true,
  color: true,
  user: { select: { avatarUrl: true } },
} as const;

type Row = {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; displayName: string; color: string; user: { avatarUrl: string | null } };
};

function toDto(c: Row): TransactionCommentDTO {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    author: {
      id: c.author.id,
      displayName: c.author.displayName,
      color: c.author.color,
      avatarUrl: c.author.user.avatarUrl ?? null,
    },
  };
}

/** Conversa do casal em cima de um lançamento. Notifica o outro membro (sino + WhatsApp). */
@Injectable()
export class TransactionCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertTransaction(householdId: string, transactionId: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: transactionId, householdId },
      select: { id: true, description: true },
    });
    if (!tx) throw new NotFoundError("Transação");
    return tx;
  }

  async list(householdId: string, transactionId: string): Promise<TransactionCommentDTO[]> {
    await this.assertTransaction(householdId, transactionId);
    const rows = await this.prisma.transactionComment.findMany({
      where: { transactionId },
      select: { id: true, body: true, createdAt: true, editedAt: true, author: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDto);
  }

  async create(
    householdId: string,
    authorMemberId: string,
    transactionId: string,
    body: string,
  ): Promise<TransactionCommentDTO> {
    const tx = await this.assertTransaction(householdId, transactionId);
    const created = await this.prisma.transactionComment.create({
      data: { transactionId, authorMemberId, body },
      select: { id: true, body: true, createdAt: true, editedAt: true, author: { select: AUTHOR_SELECT } },
    });

    // notifica os OUTROS membros do household
    const others = await this.prisma.householdMember.findMany({
      where: { householdId, id: { not: authorMemberId } },
      select: { id: true, userId: true },
    });
    for (const other of others) {
      await this.notifications
        .push({
          householdId,
          type: "TRANSACTION_COMMENT",
          title: `${created.author.displayName} comentou`,
          body: `"${tx.description}" — ${body.length > 140 ? `${body.slice(0, 140)}…` : body}`,
          data: { transactionId, commentId: created.id },
          targetUserId: other.userId,
          excludeMemberId: authorMemberId,
        })
        .catch(() => undefined);
    }

    return toDto(created);
  }

  async update(
    householdId: string,
    authorMemberId: string,
    commentId: string,
    body: string,
  ): Promise<TransactionCommentDTO> {
    const c = await this.prisma.transactionComment.findFirst({
      where: { id: commentId, transaction: { householdId } },
      select: { id: true, authorMemberId: true },
    });
    if (!c) throw new NotFoundError("Comentário");
    if (c.authorMemberId !== authorMemberId) {
      throw new ForbiddenException("Só o autor edita o comentário");
    }
    const updated = await this.prisma.transactionComment.update({
      where: { id: c.id },
      data: { body, editedAt: new Date() },
      select: { id: true, body: true, createdAt: true, editedAt: true, author: { select: AUTHOR_SELECT } },
    });
    return toDto(updated);
  }

  async remove(householdId: string, authorMemberId: string, commentId: string) {
    const c = await this.prisma.transactionComment.findFirst({
      where: { id: commentId, transaction: { householdId } },
      select: { id: true, authorMemberId: true },
    });
    if (!c) throw new NotFoundError("Comentário");
    if (c.authorMemberId !== authorMemberId) {
      throw new ForbiddenException("Só o autor apaga o comentário");
    }
    await this.prisma.transactionComment.delete({ where: { id: c.id } });
    return { deleted: true };
  }
}
