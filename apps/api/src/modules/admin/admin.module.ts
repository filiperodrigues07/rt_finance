import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [MailModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
