import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis

const READ_OPERATIONS = /^(find|count|aggregate|groupBy)/
const CONNECTION_CLOSED = /Server has closed the connection|Connection terminated unexpectedly|ECONNRESET|EPIPE/i

function isRetryableConnectionError(error) {
    return error?.code === "P1017" || CONNECTION_CLOSED.test(error?.message ?? "")
}

function createClient() {
    const connectionString = new URL(process.env.DATABASE_URL);
    const sslmode = connectionString.searchParams.get("sslmode");

    // pg-connection-string currently treats these modes as verify-full, but
    // will change to libpq semantics in its next major version.
    if (["prefer", "require", "verify-ca"].includes(sslmode)) {
        connectionString.searchParams.set("sslmode", "verify-full");
    }

    // Neon closes idle connections when a compute scales down. Keep the pool
    // small and bounded so the app does not hold dead sockets open.
    const pool = new Pool({
        connectionString: connectionString.toString(),
        max: 5,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
    });
    pool.on("error", (error) => {
        console.error("[prisma] idle client error:", error.message);
    });
    const adapter = new PrismaPg(pool);
    const client = new PrismaClient({ adapter });

    // A pooled Neon connection can be closed while idle. Retry read queries
    // once; writes are never retried to avoid duplicating side effects.
    return client.$extends({
        query: {
            async $allOperations({ operation, args, query }) {
                try {
                    return await query(args);
                } catch (error) {
                    if (!READ_OPERATIONS.test(operation) || !isRetryableConnectionError(error)) throw error;
                    console.warn(`[prisma] retrying ${operation} after a closed connection`);
                    await new Promise((resolve) => setTimeout(resolve, 250));
                    return query(args);
                }
            },
        },
    });
}

export const prisma =globalForPrisma.prisma ??
createClient();
if(process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
