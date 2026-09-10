import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createTransactionBody,
  updateTransactionBody,
  listTransactionsQuery,
  transferBody,
  payTransactionBody,
  bulkIdsBody,
  bulkCategorizeBody,
  uploadAttachmentFields,
  createCommentBody,
  updateCommentBody,
  idParam,
  type CreateTransactionBody,
  type UpdateTransactionBody,
  type ListTransactionsQuery,
  type TransferBody,
  type PayTransactionBody,
  type BulkIdsBody,
  type BulkCategorizeBody,
  type CreateCommentBody,
  type AuthUser,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { readUpload } from "../../common/read-upload";
import { TransactionsService } from "./transactions.service";
import { TransactionAttachmentsService } from "./transaction-attachments.service";
import { TransactionCommentsService } from "./transaction-comments.service";

@Controller("transactions")
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly attachments: TransactionAttachmentsService,
    private readonly comments: TransactionCommentsService,
  ) {}

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @Query(new ZodValidationPipe(listTransactionsQuery)) query: ListTransactionsQuery,
  ) {
    return this.transactions.list(householdId, query);
  }

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.transactions.get(householdId, params.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTransactionBody)) body: CreateTransactionBody,
  ) {
    return this.transactions.create(user.householdId, user.memberId, body);
  }

  @Post("transfer")
  transfer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(transferBody)) body: TransferBody,
  ) {
    return this.transactions.transfer(user.householdId, user.memberId, body);
  }

  @Post(":id/pay")
  pay(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(payTransactionBody)) body: PayTransactionBody,
  ) {
    return this.transactions.pay(householdId, params.id, body);
  }

  @Post(":id/cancel-series")
  cancelSeries(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.transactions.cancelSeries(householdId, params.id);
  }

  @Post("bulk/delete")
  bulkDelete(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(bulkIdsBody)) body: BulkIdsBody,
  ) {
    return this.transactions.bulkDelete(householdId, body.ids);
  }

  @Post("bulk/pay")
  bulkPay(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(bulkIdsBody)) body: BulkIdsBody,
  ) {
    return this.transactions.bulkPay(householdId, body.ids);
  }

  @Post("bulk/categorize")
  bulkCategorize(
    @CurrentHousehold() householdId: string,
    @Body(new ZodValidationPipe(bulkCategorizeBody)) body: BulkCategorizeBody,
  ) {
    return this.transactions.bulkUpdate(householdId, body.ids, {
      categoryId: body.categoryId,
      memberId: body.memberId,
    });
  }

  // ---------- anexos (boleto / comprovante) ----------
  @Get(":id/attachments")
  listAttachments(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.attachments.list(householdId, params.id);
  }

  @Post(":id/attachments")
  async uploadAttachment(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const upload = await readUpload(req, { maxBytes: 5 * 1024 * 1024 });
    const parsed = uploadAttachmentFields.safeParse({ kind: upload.fields.kind || undefined });
    if (!parsed.success) {
      throw new BadRequestException({
        message: parsed.error.issues.map((i) => i.message),
        error: "ValidationError",
      });
    }
    return this.attachments.upload(householdId, params.id, upload, parsed.data.kind);
  }

  @Get("attachments/:attId/file")
  async attachmentFile(
    @CurrentHousehold() householdId: string,
    @Param("attId") attId: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Buffer> {
    const file = await this.attachments.getFile(householdId, attId);
    void res.header("content-type", file.mimeType || "application/octet-stream");
    void res.header(
      "content-disposition",
      `inline; filename="${file.fileName.replace(/["\\]/g, "_")}"`,
    );
    return file.data;
  }

  @Post("attachments/:attId/scan")
  scanAttachment(@CurrentHousehold() householdId: string, @Param("attId") attId: string) {
    return this.attachments.scan(householdId, attId);
  }

  @Delete("attachments/:attId")
  removeAttachment(@CurrentHousehold() householdId: string, @Param("attId") attId: string) {
    return this.attachments.remove(householdId, attId);
  }

  // ---------- comentários (conversa do casal) ----------
  @Get(":id/comments")
  listComments(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.comments.list(householdId, params.id);
  }

  @Post(":id/comments")
  addComment(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(createCommentBody)) body: CreateCommentBody,
  ) {
    return this.comments.create(user.householdId, user.memberId, params.id, body.body);
  }

  @Patch("comments/:cid")
  editComment(
    @CurrentUser() user: AuthUser,
    @Param("cid") cid: string,
    @Body(new ZodValidationPipe(updateCommentBody)) body: CreateCommentBody,
  ) {
    return this.comments.update(user.householdId, user.memberId, cid, body.body);
  }

  @Delete("comments/:cid")
  removeComment(@CurrentUser() user: AuthUser, @Param("cid") cid: string) {
    return this.comments.remove(user.householdId, user.memberId, cid);
  }

  @Post(":id/duplicate")
  duplicate(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.transactions.duplicate(user.householdId, user.memberId, params.id);
  }

  @Patch(":id")
  update(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateTransactionBody)) body: UpdateTransactionBody,
  ) {
    return this.transactions.update(householdId, params.id, body);
  }

  @Delete(":id")
  remove(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.transactions.remove(householdId, params.id);
  }
}
