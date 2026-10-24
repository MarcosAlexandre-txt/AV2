import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export class GreenRepository {
  constructor(private readonly db: DbClient) {}

  listOrganizations() {
    return this.db.organization.findMany({
      include: { contract: true, _count: { select: { lots: true } } },
      orderBy: { name: "asc" },
    });
  }

  findOrganization(id: string) {
    return this.db.organization.findUnique({ where: { id } });
  }

  createOrganization(data: Prisma.OrganizationCreateInput) {
    return this.db.organization.create({ data });
  }

  async updateOrganization(
    id: string,
    version: number,
    data: Prisma.OrganizationUpdateInput,
  ) {
    const result = await this.db.organization.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count !== 1) return null;
    return this.db.organization.findUnique({ where: { id } });
  }

  listContracts() {
    return this.db.contract.findMany({
      include: {
        organization: { select: { id: true, name: true, cnpj: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findContract(id: string) {
    return this.db.contract.findUnique({ where: { id } });
  }

  createContract(data: Prisma.ContractCreateInput) {
    return this.db.contract.create({ data });
  }

  async updateContract(
    id: string,
    version: number,
    data: Prisma.ContractUpdateInput,
  ) {
    const result = await this.db.contract.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count !== 1) return null;
    return this.db.contract.findUnique({ where: { id } });
  }

  listLots() {
    return this.db.lot.findMany({
      include: {
        organization: { select: { id: true, name: true } },
        equipment: {
          select: { id: true, internalBarcode: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findLot(id: string) {
    return this.db.lot.findUnique({ where: { id } });
  }

  listEquipment() {
    return this.db.equipment.findMany({
      include: {
        organization: { select: { id: true, name: true } },
        lot: { select: { id: true, code: true } },
      },
      orderBy: { receivedAt: "desc" },
    });
  }

  findEquipment(id: string) {
    return this.db.equipment.findUnique({ where: { id } });
  }

  createEquipment(data: Prisma.EquipmentCreateInput) {
    return this.db.equipment.create({ data });
  }

  listMovements(equipmentId: string) {
    return this.db.movement.findMany({
      where: { equipmentId },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  listUsers() {
    return this.db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        version: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
  }
}
