import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";
import { ShareCardService } from "./share-card.service";

@Module({
  imports: [ReportsModule, WhatsappModule],
  controllers: [ShareController],
  providers: [ShareService, ShareCardService],
})
export class ShareModule {}
