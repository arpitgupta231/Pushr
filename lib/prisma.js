import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis

function createClient() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
}

export const prisma =globalForPrisma.prisma ??
createClient();
if(process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;