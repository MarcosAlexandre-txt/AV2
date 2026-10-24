import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  EquipmentStatus,
  MovementType,
  PrismaClient,
  Role,
} from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("Configure DATABASE_URL antes de executar o seed.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const ids = {
  admin: "11111111-1111-4111-8111-111111111111",
  organization: "22222222-2222-4222-8222-222222222222",
  contract: "33333333-3333-4333-8333-333333333333",
  lot: "44444444-4444-4444-8444-444444444444",
  equipment: [
    "55555555-5555-4555-8555-555555555551",
    "55555555-5555-4555-8555-555555555552",
    "55555555-5555-4555-8555-555555555553",
  ],
};

async function main() {
  const passwordHash = await bcrypt.hash("Greencode@123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@greencode.local" },
    update: {},
    create: {
      id: ids.admin,
      name: "Administrador GreenCode",
      email: "admin@greencode.local",
      passwordHash,
      role: Role.ADMINISTRADOR,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { cnpj: "11222333000181" },
    update: {},
    create: {
      id: ids.organization,
      name: "Recicladora Exemplo",
      cnpj: "11222333000181",
      type: "RECICLADOR",
      phone: "11999999999",
      email: "contato@recicladora.local",
      address: "São Paulo - SP",
    },
  });

  await prisma.contract.upsert({
    where: { code: "CTR-2026-001" },
    update: {},
    create: {
      id: ids.contract,
      code: "CTR-2026-001",
      organizationId: organization.id,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2027-01-01T00:00:00.000Z"),
      clauses: { service: "Coleta e destinação de eletrônicos", slaDays: 30 },
    },
  });

  const lot = await prisma.lot.upsert({
    where: { code: "LOTE-EXEMPLO-001" },
    update: {},
    create: {
      id: ids.lot,
      code: "LOTE-EXEMPLO-001",
      organizationId: organization.id,
      createdById: admin.id,
      origin: "Unidade Central",
      destination: "Centro de Triagem",
    },
  });

  const examples = [
    {
      barcode: "GC-0001",
      status: EquipmentStatus.RECEBIDO,
      location: "Recepção",
      value: 120,
    },
    {
      barcode: "GC-0002",
      status: EquipmentStatus.EM_REPARO,
      location: "Oficina",
      value: 280,
    },
    {
      barcode: "GC-0003",
      status: EquipmentStatus.RECONDICIONADO,
      location: "Estoque",
      value: 450,
    },
  ];

  for (const [index, item] of examples.entries()) {
    const equipment = await prisma.equipment.upsert({
      where: { internalBarcode: item.barcode },
      update: {},
      create: {
        id: ids.equipment[index],
        internalBarcode: item.barcode,
        serial: `SERIAL-${item.barcode}`,
        category: "Notebook",
        brand: "Exemplo",
        model: `Modelo ${index + 1}`,
        condition: "Usado",
        status: item.status,
        location: item.location,
        recoveryValue: item.value,
        organizationId: organization.id,
        lotId: lot.id,
      },
    });

    await prisma.movement.upsert({
      where: { id: `66666666-6666-4666-8666-66666666666${index + 1}` },
      update: {},
      create: {
        id: `66666666-6666-4666-8666-66666666666${index + 1}`,
        equipmentId: equipment.id,
        actorId: admin.id,
        type: index === 0 ? MovementType.RECEBIMENTO : MovementType.REPARO,
        toStatus: item.status,
        toLocation: item.location,
        note: "Movimentação de demonstração criada pelo seed",
      },
    });
  }

  console.log("Seed concluído.");
  console.log("Login de demonstração: admin@greencode.local / Greencode@123");
}

main()
  .catch((error) => {
    console.error("Falha ao carregar dados de demonstração:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
