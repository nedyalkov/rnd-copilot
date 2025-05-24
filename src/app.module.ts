import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Item, ItemSchema } from './item.schema';
import { ItemService } from './item.service';
import { ItemController } from './item.controller';
import { OAuthToken, OAuthTokenSchema } from './oauth.schema';
import { OauthService } from './oauth.service';
import { OauthController } from './oauth.controller';
import { HttpModule } from '@nestjs/axios';
import { configurationLoader } from './config/configuration';
import { FrontendController } from './frontend.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configurationLoader] }),
    MongooseModule.forRootAsync({
      useFactory: () => {
        const config = configurationLoader();
        return {
          uri: config.mongoUri,
          dbName: config.mongoDbName,
        };
      },
    }),
    MongooseModule.forFeature([{ name: Item.name, schema: ItemSchema }]),
    HttpModule,
    MongooseModule.forFeature([{ name: OAuthToken.name, schema: OAuthTokenSchema }]),
  ],
  controllers: [ItemController, OauthController, FrontendController],
  providers: [ItemService, OauthService],
})
export class AppModule {}
