import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressEntity } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { ZonesService } from '../zones/zones.service';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(AddressEntity)
    private addresses: Repository<AddressEntity>,
    private zones: ZonesService,
  ) {}

  findAll(accountId: string) {
    return this.addresses.find({
      where: { accountId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  async create(accountId: string, dto: CreateAddressDto) {
    if (dto.latitude != null && dto.longitude != null) {
      const zone = await this.zones.detect(dto.latitude, dto.longitude);
      if (!zone) {
        throw new BadRequestException(
          'La dirección está fuera del área de cobertura',
        );
      }
    }

    if (dto.isDefault) {
      await this.addresses.update({ accountId }, { isDefault: false });
    }
    const address = this.addresses.create({ ...dto, accountId });
    const saved = await this.addresses.save(address);

    return saved;
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
