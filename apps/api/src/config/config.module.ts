import { Global, Module } from "@nestjs/common";
import { ENV, parseEnv, type Env } from "./env.schema";

const envProvider = {
  provide: ENV,
  useFactory: (): Env => parseEnv(process.env),
};

@Global()
@Module({
  providers: [envProvider],
  exports: [ENV],
})
export class ConfigModule {}
