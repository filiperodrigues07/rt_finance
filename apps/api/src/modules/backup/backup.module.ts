import { Module } from "@nestjs/common";
import { HouseholdsModule } from "../households/households.module";
import { BackupController } from "./backup.controller";
import { BackupService } from "./backup.service";

/** Exportar / restaurar todos os dados financeiros do household (só o dono). */
@Module({
  imports: [HouseholdsModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
