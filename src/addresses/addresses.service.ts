import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressEntity } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class AddressesService {
  constructor(@InjectRepository(AddressEntity) private addresses: Repository<AddressEntity>) {}

  findAll(userId: string) {
    return this.addresses.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });
  }

  async create(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.addresses.update({ userId }, { isDefault: false });
    }
    const address = this.addresses.create({ ...dto, userId });
    return this.addresses.save(address);
  }

  async update(userId: string, id: string, dto: Partial<CreateAddressDto>) {
    const address = await this.addresses.findOne({ where: { id, userId } });
    if (!address) throw new NotFoundException('Dirección no encontrada');
    if (dto.isDefault) {
      await this.addresses.update({ userId }, { isDefault: false });
    }
    Object.assign(address, dto);
    return this.addresses.save(address);
  }

  async remove(userId: string, id: string) {
    const address = await this.addresses.findOne({ where: { id, userId } });
    if (!address) throw new NotFoundException('Dirección no encontrada');
    await this.addresses.remove(address);
  }
}
