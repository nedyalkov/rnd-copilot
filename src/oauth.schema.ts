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
  orgSlug?: string;

  @Prop()
  integrationId?: string;

  @Prop()
  integrationSecret?: string;

  @Prop({ type: [String] })
  locations?: string[];
}

export const OAuthTokenSchema = SchemaFactory.createForClass(OAuthToken);
