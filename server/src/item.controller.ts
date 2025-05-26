import { Controller, Get, Post, Body } from '@nestjs/common';
import { ItemService } from './item.service';

@Controller('items')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Post()
  async create(@Body() body: { name: string; value: string }) {
    return this.itemService.create(body.name, body.value);
  }

  @Get()
  async findAll() {
    return this.itemService.findAll();
  }
}
