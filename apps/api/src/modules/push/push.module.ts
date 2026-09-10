import { Global, Module } from "@nestjs/common";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";

/** Global: PushService é usado pelo NotificationsService (que também é global). */
@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
