// Script de prueba local — NO incluir en deploy
import { SignJWT } from "jose";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const match = env.match(/^SESSION_SECRET=(.+)$/m);
if (!match) { console.error("SESSION_SECRET no encontrado"); process.exit(1); }

const secret = new TextEncoder().encode(match[1].trim());
const token = await new SignJWT({
  userId: "test-local",
  nombre: "Test Local",
  email: "test@local.dev",
  rol: "admin",
  appsPermitidas: ["tecnicos"],
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("8h")
  .sign(secret);

console.log(token);
