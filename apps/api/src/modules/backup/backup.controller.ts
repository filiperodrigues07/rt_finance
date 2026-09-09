import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser } from "@rt-finance/shared";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { DomainError } from "../../common/errors/domain-error";
import { readUpload } from "../../common/read-upload";
import { BackupService } from "./backup.service";

@Controller("household")
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get("backup")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async download(
    @CurrentHousehold() householdId: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const data = await this.backup.export(householdId);
    const today = new Date().toISOString().slice(0, 10);
    void res.header("content-type", "application/json; charset=utf-8");
    void res.header("content-disposition", `attachment; filename="rt-finance-backup-${today}.json"`);
    return data;
  }

  @Post("restore")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async restore(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const upload = await readUpload(req, { maxBytes: 15 * 1024 * 1024 });
    let json: unknown;
    try {
      json = JSON.parse(upload.buffer.toString("utf8"));
    } catch {
      throw new DomainError("O arquivo enviado não é um JSON válido");
    }
    return this.backup.restore(
      user,
      json,
      upload.fields.password ?? "",
      upload.fields.confirm ?? "",
    );
  }
}
