import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import {
  EquipmentStatus,
  MovementType,
  Prisma,
  Role,
} from "../generated/prisma/client.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../errors.js";
import { GreenRepository } from "../repositories/green.repository.js";

const transitions: Record<EquipmentStatus, EquipmentStatus[]> = {
  RECEBIDO: [EquipmentStatus.EM_TRIAGEM],
  EM_TRIAGEM: [
    EquipmentStatus.AGUARDANDO_COMPONENTES,
    EquipmentStatus.EM_REPARO,
    EquipmentStatus.RECONDICIONADO,
    EquipmentStatus.DESCARTADO,
  ],
  AGUARDANDO_COMPONENTES: [
    EquipmentStatus.EM_REPARO,
    EquipmentStatus.DESCARTADO,
  ],
  EM_REPARO: [EquipmentStatus.RECONDICIONADO, EquipmentStatus.DESCARTADO],
  RECONDICIONADO: [
    EquipmentStatus.DOADO,
    EquipmentStatus.VENDIDO,
    EquipmentStatus.DESCARTADO,
  ],
  DESCARTADO: [],
  DOADO: [],
  VENDIDO: [],
};

export class GreenService {
  private readonly repository = new GreenRepository(prisma);

  constructor(private readonly app: FastifyInstance) {}

  async createUser(input: {
    name: string;
    email: string;
    password: string;
    role: Role;
  }) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    return prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: input.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        version: true,
      },
    });
  }

  listUsers() {
    return this.repository.listUsers();
  }

  async updateUserRole(id: string, version: number, role: Role) {
    const result = await prisma.user.updateMany({
      where: { id, version },
      data: { role, version: { increment: 1 } },
    });
    if (!result.count)
      throw new AppError(
        "Usuário não encontrado ou versão desatualizada.",
        409,
      );
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        version: true,
      },
    });
  }

  listOrganizations() {
    return this.repository.listOrganizations();
  }

  async createOrganization(input: {
    name: string;
    cnpj: string;
    type: string;
    phone: string;
    email: string;
    address: string;
  }) {
    const cnpj = input.cnpj.replace(/\D/g, "");
    if (!validCnpj(cnpj)) throw new AppError("CNPJ inválido.");
    return this.repository.createOrganization({ ...input, cnpj });
  }

  async updateOrganization(
    id: string,
    version: number,
    input: {
      name?: string;
      type?: string;
      phone?: string;
      email?: string;
      address?: string;
      active?: boolean;
    },
  ) {
    const updated = await this.repository.updateOrganization(
      id,
      version,
      input,
    );
    if (!updated)
      throw new AppError(
        "Organização não encontrada ou versão desatualizada.",
        409,
      );
    return updated;
  }

  listContracts() {
    return this.repository.listContracts();
  }

  createContract(input: {
    code: string;
    organizationId: string;
    startDate: string;
    endDate?: string;
    clauses?: Prisma.InputJsonValue;
  }) {
    return this.repository.createContract({
      code: input.code,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      clauses: input.clauses,
      organization: { connect: { id: input.organizationId } },
    });
  }

  async updateContract(
    id: string,
    version: number,
    input: {
      endDate?: string | null;
      clauses?: Prisma.InputJsonValue;
      active?: boolean;
    },
  ) {
    const updated = await this.repository.updateContract(id, version, {
      endDate:
        input.endDate === undefined
          ? undefined
          : input.endDate
            ? new Date(input.endDate)
            : null,
      clauses: input.clauses,
      active: input.active,
    });
    if (!updated)
      throw new AppError(
        "Contrato não encontrado ou versão desatualizada.",
        409,
      );
    return updated;
  }

  listLots() {
    return this.repository.listLots();
  }

  async createLot(input: {
    code: string;
    organizationId: string;
    origin: string;
    destination: string;
    equipment: { id: string; version: number }[];
    actorId: string;
  }) {
    if (
      new Set(input.equipment.map((item) => item.id)).size !==
      input.equipment.length
    ) {
      throw new AppError("A lista do lote contém equipamentos repetidos.");
    }

    return prisma.$transaction(async (tx) => {
      const lot = await tx.lot.create({
        data: {
          code: input.code,
          origin: input.origin,
          destination: input.destination,
          organization: { connect: { id: input.organizationId } },
          createdBy: { connect: { id: input.actorId } },
        },
      });

      if (input.equipment.length) {
        const previousData = new Map<
          string,
          { location: string; status: EquipmentStatus }
        >();

        for (const item of input.equipment) {
          const current = await tx.equipment.findUnique({
            where: { id: item.id },
          });
          if (!current || current.version !== item.version) {
            throw new AppError(
              `Equipamento ${item.id} não existe ou tem versão desatualizada.`,
              409,
            );
          }
          previousData.set(item.id, {
            location: current.location,
            status: current.status,
          });

          const moved = await tx.equipment.updateMany({
            where: {
              id: item.id,
              version: item.version,
              organizationId: input.organizationId,
              lotId: null,
              status: {
                notIn: [
                  EquipmentStatus.DESCARTADO,
                  EquipmentStatus.DOADO,
                  EquipmentStatus.VENDIDO,
                ],
              },
            },
            data: {
              lotId: lot.id,
              location: input.destination,
              version: { increment: 1 },
            },
          });

          if (!moved.count) {
            throw new AppError(
              `Equipamento ${item.id} não existe, não pertence à organização, já está em lote ou tem versão desatualizada.`,
              409,
            );
          }
        }

        await tx.movement.createMany({
          data: input.equipment.map((item) => ({
            equipmentId: item.id,
            actorId: input.actorId,
            type: MovementType.TRANSFERENCIA,
            fromStatus: previousData.get(item.id)?.status,
            toStatus: previousData.get(item.id)?.status,
            fromLocation: previousData.get(item.id)?.location,
            toLocation: input.destination,
            note: `Inclusão no lote ${input.code}`,
          })),
        });
      }

      return tx.lot.findUniqueOrThrow({
        where: { id: lot.id },
        include: { equipment: true, organization: true },
      });
    });
  }

  async updateLot(
    id: string,
    version: number,
    input: { status: "ABERTO" | "FECHADO" },
  ) {
    const result = await prisma.lot.updateMany({
      where: { id, version },
      data: {
        status: input.status,
        version: { increment: 1 },
      },
    });
    if (!result.count)
      throw new AppError("Lote não encontrado ou versão desatualizada.", 409);
    return prisma.lot.findUnique({
      where: { id },
      include: { equipment: true },
    });
  }

  listEquipment() {
    return this.repository.listEquipment();
  }

  async createEquipment(input: {
    internalBarcode: string;
    serial: string;
    category: string;
    brand: string;
    model: string;
    condition: string;
    location: string;
    notes?: string;
    recoveryValue?: number;
    organizationId: string;
    actorId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const equipment = await tx.equipment.create({
        data: {
          internalBarcode: input.internalBarcode,
          serial: input.serial,
          category: input.category,
          brand: input.brand,
          model: input.model,
          condition: input.condition,
          location: input.location,
          notes: input.notes ?? "",
          recoveryValue: input.recoveryValue ?? 0,
          organization: { connect: { id: input.organizationId } },
        },
      });

      await tx.movement.create({
        data: {
          equipmentId: equipment.id,
          actorId: input.actorId,
          type: MovementType.RECEBIMENTO,
          toStatus: EquipmentStatus.RECEBIDO,
          toLocation: input.location,
          note: "Recebimento inicial",
        },
      });

      return equipment;
    });
  }

  async updateEquipmentStatus(
    id: string,
    input: {
      version: number;
      status: EquipmentStatus;
      location: string;
      note: string;
      actorId: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.equipment.findUnique({ where: { id } });
      if (!current) throw new AppError("Equipamento não encontrado.", 404);
      if (current.version !== input.version)
        throw new AppError(
          "O equipamento foi alterado por outra requisição. Atualize os dados e tente novamente.",
          409,
        );
      if (!transitions[current.status].includes(input.status)) {
        throw new AppError(
          `Transição inválida: ${current.status} → ${input.status}.`,
        );
      }

      const changed = await tx.equipment.updateMany({
        where: { id, version: input.version },
        data: {
          status: input.status,
          location: input.location,
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new AppError(
          "O equipamento foi alterado por outra requisição. Atualize os dados e tente novamente.",
          409,
        );

      const movementType = movementTypeForStatus(input.status);
      await tx.movement.create({
        data: {
          equipmentId: id,
          actorId: input.actorId,
          type: movementType,
          fromStatus: current.status,
          toStatus: input.status,
          fromLocation: current.location,
          toLocation: input.location,
          note: input.note,
        },
      });

      return tx.equipment.findUniqueOrThrow({ where: { id } });
    });
  }

  listMovements(equipmentId: string) {
    return this.repository.listMovements(equipmentId);
  }

  async summary() {
    const [organizations, contracts, lots, equipment, recovery] =
      await Promise.all([
        prisma.organization.count(),
        prisma.contract.count(),
        prisma.lot.count(),
        prisma.equipment.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.equipment.aggregate({ _sum: { recoveryValue: true } }),
      ]);

    return {
      organizations,
      contracts,
      lots,
      equipmentByStatus: Object.fromEntries(
        equipment.map((row) => [row.status, row._count._all]),
      ),
      totalRecoveryValue: recovery._sum.recoveryValue?.toString() ?? "0.00",
    };
  }
}

function movementTypeForStatus(status: EquipmentStatus): MovementType {
  const mapping: Record<EquipmentStatus, MovementType> = {
    RECEBIDO: MovementType.RECEBIMENTO,
    EM_TRIAGEM: MovementType.TRIAGEM,
    AGUARDANDO_COMPONENTES: MovementType.AJUSTE_ESTOQUE,
    EM_REPARO: MovementType.REPARO,
    RECONDICIONADO: MovementType.RECONDICIONAMENTO,
    DESCARTADO: MovementType.DESCARTE,
    DOADO: MovementType.DOACAO,
    VENDIDO: MovementType.VENDA,
  };
  return mapping[status];
}

function validCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;

  const checkDigit = (base: string, weights: number[]) => {
    const sum = [...base].reduce(
      (total, digit, index) => total + Number(digit) * weights[index],
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = checkDigit(
    value.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const second = checkDigit(
    `${value.slice(0, 12)}${first}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return value.endsWith(`${first}${second}`);
}
