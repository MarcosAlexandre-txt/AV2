import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma.js";
import { AppError } from "../errors.js";

export class AuthService {
  constructor(private readonly app: FastifyInstance) {}

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (
      !user ||
      !user.active ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new AppError("E-mail ou senha inválidos.", 401);
    }

    const token = this.app.jwt.sign(
      { sub: user.id, role: user.role },
      { expiresIn: "30m" },
    );

    return {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 1800,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
