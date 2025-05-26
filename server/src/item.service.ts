import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Item } from './item.schema';

@Injectable()
export class ItemService {
  constructor(@InjectModel(Item.name) private itemModel: Model<Item>) {}

  async create(name: string, value: string): Promise<Item> {
    const created = new this.itemModel({ name, value });
    return created.save();
  }

  async findAll(): Promise<Item[]> {
    return this.itemModel.find().exec();
  }
}
