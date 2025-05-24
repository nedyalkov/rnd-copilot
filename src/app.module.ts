import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { Item, ItemSchema } from './item.schema';
import { ItemService } from './item.service';
import { ItemController } from './item.controller';
import { OAuthToken, OAuthTokenSchema } from './oauth.schema';
import { OauthService } from './oauth.service';
import { OauthController } from './oauth.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      useFactory: () => {
        const config = configuration();
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
  controllers: [AppController, ItemController, OauthController],
  providers: [AppService, ItemService, OauthService],
})
export class AppModule {}
