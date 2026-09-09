import { Module } from "@nestjs/common";
import { HouseholdsModule } from "../households/households.module";
import { MailModule } from "../mail/mail.module";
import { BackupController } from "./backup.controller";
import { BackupService } from "./backup.service";

/** Exportar / restaurar / agendar backup de todos os dados financeiros do household. */
@Module({
  imports: [HouseholdsModule, MailModule],
  controllers: [BackupController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
