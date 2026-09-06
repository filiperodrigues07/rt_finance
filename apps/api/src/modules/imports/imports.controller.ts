import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import {
  commitImportBody,
  createImportFields,
  idParam,
  patchImportRowBody,
  type AuthUser,
  type CommitImportBody,
  type PatchImportRowBody,
} from "@rt-finance/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { readUpload } from "../../common/read-upload";
import { ImportsService } from "./imports.service";

@Controller("imports")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(@CurrentHousehold() householdId: string) {
    return this.imports.list(householdId);
  }

  @Get(":id")
  get(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.imports.get(householdId, params.id);
  }

  @Post()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async create(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const upload = await readUpload(req, { maxBytes: 15 * 1024 * 1024 });

    const ALLOWED = [
      "application/pdf",
      "application/x-ofx",
      "application/octet-stream",
      "text/plain",
      "image/png",
      "image/jpeg",
      "",
    ];
    const okExt = /\.(ofx|pdf|png|jpe?g)$/i.test(upload.filename);
    if (!ALLOWED.includes(upload.mimetype) && !okExt) {
      throw new BadRequestException({
        message: [`Tipo de arquivo não aceito (${upload.mimetype || "desconhecido"}). Envie .ofx, .pdf, .png ou .jpg.`],
        error: "UnsupportedMediaType",
      });
    }

    const parsed = createImportFields.safeParse({
      kind: upload.fields.kind,
      accountId: upload.fields.accountId || undefined,
      creditCardId: upload.fields.creditCardId || undefined,
    });
    if (!parsed.success) {
      throw new BadRequestException({
        message: parsed.error.issues.map((i) => i.message),
        error: "ValidationError",
      });
    }
    return this.imports.create(user.householdId, user.memberId, upload, parsed.data);
  }

  @Patch(":id/rows/:rowId")
  patchRow(
    @CurrentHousehold() householdId: string,
    @Param("id") id: string,
    @Param("rowId") rowId: string,
    @Body(new ZodValidationPipe(patchImportRowBody)) body: PatchImportRowBody,
  ) {
    return this.imports.patchRow(householdId, id, rowId, body);
  }

  @Post(":id/commit")
  commit(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(commitImportBody)) body: CommitImportBody,
  ) {
    return this.imports.commit(user.householdId, user.memberId, id, body);
  }

  @Delete(":id")
  discard(
    @CurrentHousehold() householdId: string,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ) {
    return this.imports.discard(householdId, params.id);
  }
}
