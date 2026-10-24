import "dotenv/config";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Role } from "./generated/prisma/client.js";
import { AppError } from "./errors.js";
import { registerRoutes } from "./controllers/routes.js";

export async function buildApp() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET precisa ter pelo menos 32 caracteres. Configure o arquivo .env.",
    );
  }

  const app = Fastify({ logger: true });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "GreenCode API",
        description: "API de logística reversa de equipamentos eletrônicos.",
        version: "1.0.0",
      },
      servers: [{ url: "http://localhost:3000" }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(jwt, { secret });

  app.decorate("authenticate", async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError("Token ausente, inválido ou expirado.", 401);
    }
  });

  app.decorate("authorize", (roles: Role[]) => async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError("Token ausente, inválido ou expirado.", 401);
    }
    if (!roles.includes(request.user.role)) {
      throw new AppError("Seu perfil não permite esta operação.", 403);
    }
  });

  app.get("/health", { schema: { tags: ["Sistema"] } }, async () => ({
    status: "ok",
  }));
  await app.register(registerRoutes, { prefix: "/api" });

  app.setErrorHandler((error, request, reply) => {
    const knownError = error as Error & { validation?: unknown; code?: string };

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    if (knownError.validation) {
      return reply.code(400).send({
        error: "Dados da requisição inválidos.",
        details: knownError.validation,
      });
    }

    if (typeof knownError.code === "string") {
      if (knownError.code === "P2002")
        return reply
          .code(409)
          .send({ error: "Já existe um registro com esses dados únicos." });
      if (knownError.code === "P2003")
        return reply.code(400).send({ error: "Relacionamento inválido." });
      if (knownError.code === "P2025")
        return reply.code(404).send({ error: "Registro não encontrado." });
    }

    request.log.error(error);
    return reply.code(500).send({ error: "Erro interno do servidor." });
  });

  return app;
}
