import { Global, Module } from "@nestjs/common";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

/** Global: NotificationsService é injetável em qualquer módulo sem criar ciclo de imports. */
@Global()
@Module({
  imports: [WhatsappModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
