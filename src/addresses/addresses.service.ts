import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressEntity } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class AddressesService {
  constructor(@InjectRepository(AddressEntity) private addresses: Repository<AddressEntity>) {}

  findAll(accountId: string) {
    return this.addresses.find({ where: { accountId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });
  }

  async create(accountId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.addresses.update({ accountId }, { isDefault: false });
    }
    const address = this.addresses.create({ ...dto, accountId });
    return this.addresses.save(address);
  }

  async update(accountId: string, id: string, dto: Partial<CreateAddressDto>) {
    const address = await this.addresses.findOne({ where: { id, accountId } });
    if (!address) throw new NotFoundException('Dirección no encontrada');
    if (dto.isDefault) {
      await this.addresses.update({ accountId }, { isDefault: false });
    }
    Object.assign(address, dto);
    return this.addresses.save(address);
  }

  async remove(accountId: string, id: string) {
    const address = await this.addresses.findOne({ where: { id, accountId } });
    if (!address) throw new NotFoundException('Dirección no encontrada');
    await this.addresses.remove(address);
  }
}
