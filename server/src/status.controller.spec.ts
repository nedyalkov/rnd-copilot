import { Test, TestingModule } from '@nestjs/testing';
import { StatusController } from './status.controller';

describe('StatusController', () => {
  let controller: StatusController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatusController],
    }).compile();
    controller = module.get(StatusController);
  });

  it('should return status ok', () => {
    expect(controller.getStatus()).toEqual({ status: 'ok' });
  });
});
