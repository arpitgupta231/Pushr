import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis

function createClient() {
    const connectionString = new URL(process.env.DATABASE_URL);
    const sslmode = connectionString.searchParams.get("sslmode");

    // pg-connection-string currently treats these modes as verify-full, but
    // will change to libpq semantics in its next major version.
    if (["prefer", "require", "verify-ca"].includes(sslmode)) {
        connectionString.searchParams.set("sslmode", "verify-full");
    }

    const pool = new Pool({
        connectionString: connectionString.toString(),
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
}

export const prisma =globalForPrisma.prisma ??
createClient();
if(process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
