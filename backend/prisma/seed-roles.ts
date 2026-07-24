import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ROLE_DEFINITIONS } from './role-definitions';

interface RoleSeedClient {
  role: {
    upsert(args: Prisma.RoleUpsertArgs): Promise<{ id: string; name: string }>;
  };
}

export async function seedRoles(
  prisma: RoleSeedClient,
): Promise<Map<string, string>> {
  const roleByName = new Map<string, string>();
  for (const { name, permissions } of ROLE_DEFINITIONS) {
    const saved = await prisma.role.upsert({
      where: { name },
      update: { permissions },
      create: { name, permissions },
    });
    roleByName.set(saved.name, saved.id);
  }
  return roleByName;
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const roles = await seedRoles(prisma);
    process.stdout.write(`${roles.size} rôle(s) synchronisé(s).\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    process.stderr.write(`Erreur lors du seed des rôles : ${message}\n`);
    process.exitCode = 1;
  });
}
