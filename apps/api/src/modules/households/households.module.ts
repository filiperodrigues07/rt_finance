import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { HouseholdsController } from "./households.controller";
import { HouseholdsService } from "./households.service";

@Module({
  imports: [MailModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
