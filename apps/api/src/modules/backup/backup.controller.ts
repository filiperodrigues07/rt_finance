import { Body, Controller, Get, Param, Post, Put, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import { backupSettingsSchema, type BackupSettingsBody, type AuthUser } from "@rt-finance/shared";
import { CurrentHousehold, CurrentUser } from "../../common/decorators/current-user.decorator";
import { DomainError } from "../../common/errors/domain-error";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
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

  // ---------------- backup automático ----------------
  @Get("backup/settings")
  settings(@CurrentHousehold() householdId: string) {
    return this.backup.getSettings(householdId);
  }

  @Put("backup/settings")
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(backupSettingsSchema)) body: BackupSettingsBody,
  ) {
    return this.backup.saveSettings(user, body);
  }

  @Get("backup/history")
  history(@CurrentHousehold() householdId: string) {
    return this.backup.listHistory(householdId);
  }

  @Get("backup/history/:id")
  async historyFile(
    @CurrentHousehold() householdId: string,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<Buffer> {
    const json = await this.backup.getHistoryFile(householdId, id);
    const today = new Date().toISOString().slice(0, 10);
    void res.header("content-type", "application/json; charset=utf-8");
    void res.header("content-disposition", `attachment; filename="rt-finance-backup-${today}.json"`);
    return json;
  }
}
