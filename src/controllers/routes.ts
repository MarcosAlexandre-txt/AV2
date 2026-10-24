import type { FastifyInstance } from "fastify";
import { EquipmentStatus, Role } from "../generated/prisma/client.js";
import { AuthService } from "../services/auth.service.js";
import { GreenService } from "../services/green.service.js";

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

const versionField = { type: "integer", minimum: 0 } as const;

export async function registerRoutes(app: FastifyInstance) {
  const auth = new AuthService(app);
  const service = new GreenService(app);

  app.post<{ Body: { email: string; password: string } }>(
    "/auth/login",
    {
      schema: {
        tags: ["Autenticação"],
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
          },
        },
      },
    },
    async (request) => auth.login(request.body.email, request.body.password),
  );

  app.get(
    "/auth/me",
    {
      preHandler: app.authenticate,
      schema: { tags: ["Autenticação"], security: [{ bearerAuth: [] }] },
    },
    async (request) => ({ id: request.user.sub, role: request.user.role }),
  );

  app.get(
    "/users",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.AUDITOR]),
      schema: { tags: ["Usuários"], security: [{ bearerAuth: [] }] },
    },
    () => service.listUsers(),
  );

  app.post<{
    Body: { name: string; email: string; password: string; role: Role };
  }>(
    "/users",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR]),
      schema: {
        tags: ["Usuários"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "email", "password", "role"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 2 },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 10 },
            role: { type: "string", enum: Object.values(Role) },
          },
        },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await service.createUser(request.body)),
  );

  app.patch<{ Params: { id: string }; Body: { version: number; role: Role } }>(
    "/users/:id/role",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR]),
      schema: {
        tags: ["Usuários"],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: "object",
          required: ["version", "role"],
          additionalProperties: false,
          properties: {
            version: versionField,
            role: { type: "string", enum: Object.values(Role) },
          },
        },
      },
    },
    (request) =>
      service.updateUserRole(
        request.params.id,
        request.body.version,
        request.body.role,
      ),
  );

  app.get(
    "/organizations",
    {
      preHandler: app.authenticate,
      schema: { tags: ["Organizações"], security: [{ bearerAuth: [] }] },
    },
    () => service.listOrganizations(),
  );

  app.post<{
    Body: {
      name: string;
      cnpj: string;
      type: string;
      phone: string;
      email: string;
      address: string;
    };
  }>(
    "/organizations",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.OPERADOR_CADASTRO]),
      schema: {
        tags: ["Organizações"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "cnpj", "type", "phone", "email", "address"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 2 },
            cnpj: { type: "string", minLength: 14, maxLength: 18 },
            type: { type: "string", minLength: 2 },
            phone: { type: "string", minLength: 8 },
            email: { type: "string", format: "email" },
            address: { type: "string", minLength: 3 },
          },
        },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await service.createOrganization(request.body)),
  );

  app.patch<{
    Params: { id: string };
    Body: {
      version: number;
      name?: string;
      type?: string;
      phone?: string;
      email?: string;
      address?: string;
      active?: boolean;
    };
  }>(
    "/organizations/:id",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.OPERADOR_CADASTRO]),
      schema: {
        tags: ["Organizações"],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: "object",
          required: ["version"],
          additionalProperties: false,
          properties: {
            version: versionField,
            name: { type: "string", minLength: 2 },
            type: { type: "string", minLength: 2 },
            phone: { type: "string", minLength: 8 },
            email: { type: "string", format: "email" },
            address: { type: "string", minLength: 3 },
            active: { type: "boolean" },
          },
        },
      },
    },
    (request) => {
      const { version, ...data } = request.body;
      return service.updateOrganization(request.params.id, version, data);
    },
  );

  app.get(
    "/contracts",
    {
      preHandler: app.authenticate,
      schema: { tags: ["Contratos"], security: [{ bearerAuth: [] }] },
    },
    () => service.listContracts(),
  );

  app.post<{
    Body: {
      code: string;
      organizationId: string;
      startDate: string;
      endDate?: string;
      clauses?: object;
    };
  }>(
    "/contracts",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.OPERADOR_CADASTRO]),
      schema: {
        tags: ["Contratos"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["code", "organizationId", "startDate"],
          additionalProperties: false,
          properties: {
            code: { type: "string", minLength: 2 },
            organizationId: { type: "string", format: "uuid" },
            startDate: { type: "string", format: "date-time" },
            endDate: { type: "string", format: "date-time" },
            clauses: { type: "object" },
          },
        },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await service.createContract(request.body)),
  );

  app.patch<{
    Params: { id: string };
    Body: {
      version: number;
      endDate?: string | null;
      clauses?: object;
      active?: boolean;
    };
  }>(
    "/contracts/:id",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.OPERADOR_CADASTRO]),
      schema: {
        tags: ["Contratos"],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: "object",
          required: ["version"],
          additionalProperties: false,
          properties: {
            version: versionField,
            endDate: {
              anyOf: [
                { type: "string", format: "date-time" },
                { type: "null" },
              ],
            },
            clauses: { type: "object" },
            active: { type: "boolean" },
          },
        },
      },
    },
    (request) => {
      const { version, ...data } = request.body;
      return service.updateContract(request.params.id, version, data);
    },
  );

  app.get(
    "/lots",
    {
      preHandler: app.authenticate,
      schema: { tags: ["Lotes"], security: [{ bearerAuth: [] }] },
    },
    () => service.listLots(),
  );

  app.post<{
    Body: {
      code: string;
      organizationId: string;
      origin: string;
      destination: string;
      equipment: { id: string; version: number }[];
    };
  }>(
    "/lots",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.ALMOXARIFE]),
      schema: {
        tags: ["Lotes"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: [
            "code",
            "organizationId",
            "origin",
            "destination",
            "equipment",
          ],
          additionalProperties: false,
          properties: {
            code: { type: "string", minLength: 2 },
            organizationId: { type: "string", format: "uuid" },
            origin: { type: "string", minLength: 2 },
            destination: { type: "string", minLength: 2 },
            equipment: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "version"],
                additionalProperties: false,
                properties: {
                  id: { type: "string", format: "uuid" },
                  version: versionField,
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) =>
      reply.code(201).send(
        await service.createLot({
          ...request.body,
          actorId: request.user.sub,
        }),
      ),
  );

  app.patch<{
    Params: { id: string };
    Body: {
      version: number;
      status: "ABERTO" | "FECHADO";
    };
  }>(
    "/lots/:id",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.ALMOXARIFE]),
      schema: {
        tags: ["Lotes"],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: "object",
          required: ["version", "status"],
          additionalProperties: false,
          properties: {
            version: versionField,
            status: { type: "string", enum: ["ABERTO", "FECHADO"] },
          },
        },
      },
    },
    (request) => {
      const { version, ...data } = request.body;
      return service.updateLot(request.params.id, version, data);
    },
  );

  app.get(
    "/equipment",
    {
      preHandler: app.authenticate,
      schema: { tags: ["Equipamentos"], security: [{ bearerAuth: [] }] },
    },
    () => service.listEquipment(),
  );

  app.post<{
    Body: {
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
    };
  }>(
    "/equipment",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.OPERADOR_CADASTRO]),
      schema: {
        tags: ["Equipamentos"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: [
            "internalBarcode",
            "serial",
            "category",
            "brand",
            "model",
            "condition",
            "location",
            "organizationId",
          ],
          additionalProperties: false,
          properties: {
            internalBarcode: { type: "string", minLength: 3 },
            serial: { type: "string", minLength: 1 },
            category: { type: "string", minLength: 2 },
            brand: { type: "string", minLength: 1 },
            model: { type: "string", minLength: 1 },
            condition: { type: "string", minLength: 2 },
            location: { type: "string", minLength: 2 },
            notes: { type: "string" },
            recoveryValue: { type: "number", minimum: 0 },
            organizationId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) =>
      reply.code(201).send(
        await service.createEquipment({
          ...request.body,
          actorId: request.user.sub,
        }),
      ),
  );

  app.patch<{
    Params: { id: string };
    Body: {
      version: number;
      status: EquipmentStatus;
      location: string;
      note: string;
    };
  }>(
    "/equipment/:id/status",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.ALMOXARIFE]),
      schema: {
        tags: ["Equipamentos"],
        security: [{ bearerAuth: [] }],
        params: idParam,
        body: {
          type: "object",
          required: ["version", "status", "location", "note"],
          additionalProperties: false,
          properties: {
            version: versionField,
            status: { type: "string", enum: Object.values(EquipmentStatus) },
            location: { type: "string", minLength: 2 },
            note: { type: "string", minLength: 2 },
          },
        },
      },
    },
    (request) =>
      service.updateEquipmentStatus(request.params.id, {
        ...request.body,
        actorId: request.user.sub,
      }),
  );

  app.get<{ Params: { id: string } }>(
    "/equipment/:id/movements",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["Equipamentos"],
        security: [{ bearerAuth: [] }],
        params: idParam,
      },
    },
    (request) => service.listMovements(request.params.id),
  );

  app.get(
    "/reports/summary",
    {
      preHandler: app.authorize([Role.ADMINISTRADOR, Role.AUDITOR]),
      schema: { tags: ["Relatórios"], security: [{ bearerAuth: [] }] },
    },
    () => service.summary(),
  );
}
