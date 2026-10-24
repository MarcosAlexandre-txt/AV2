import "dotenv/config";
import { buildApp } from "./app.js";
import { prisma } from "./database/prisma.js";

const app = await buildApp();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}

let isClosing = false;
const closeGracefully = async (signal: string) => {
  if (isClosing) return;
  isClosing = true;
  app.log.info(`Recebido ${signal}; encerrando conexões...`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.once("SIGINT", () => void closeGracefully("SIGINT"));
process.once("SIGTERM", () => void closeGracefully("SIGTERM"));
