import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class OAuthToken extends Document {
  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  accountSlug?: string;

  @Prop()
  accountId: string;

  @Prop()
  accountName: string;

  @Prop()
  integrationId: string;

  @Prop()
  locations: string[];

  @Prop()
  integrationSecret: string;
}

export const OAuthTokenSchema = SchemaFactory.createForClass(OAuthToken);
