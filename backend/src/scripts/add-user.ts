import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ROLE_DEFINITIONS } from '../../prisma/role-definitions';
import { hashUserPassword, PASSWORD_MIN_LENGTH } from '../users/password.util';

export { BCRYPT_ROUNDS, PASSWORD_MIN_LENGTH } from '../users/password.util';

export interface AddUserInput {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  roleName: string;
  isActive: boolean;
}

interface UserTransaction {
  role: {
    findUnique(args: {
      where: { name: string };
    }): Promise<{ id: string; name: string } | null>;
  };
  user: {
    findUnique(args: {
      where: { email: string };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        email: string;
        passwordHash: string;
        fullName: string;
        phone?: string;
        roleId: string;
        isActive: boolean;
      };
      select: typeof safeSelect;
    }): Promise<CreatedUser>;
  };
  auditLog: {
    create(args: {
      data: {
        action: string;
        entity: string;
        entityId: string;
        userId: null;
        userName: string;
        metadata: {
          email: string;
          fullName: string;
          roleName: string;
          source: string;
        };
      };
    }): Promise<unknown>;
  };
}

interface AddUserClient {
  $transaction<T>(
    operation: (transaction: UserTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface CreatedUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  role: { id: string; name: string };
}

const safeSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  role: { select: { id: true, name: true } },
} as const;

export class AddUserError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AddUserError';
  }
}

export function normalizeAndValidate(input: AddUserInput): AddUserInput {
  const normalized = {
    ...input,
    fullName: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || undefined,
    roleName: input.roleName.trim(),
  };

  if (!normalized.fullName)
    throw new AddUserError('INVALID_NAME', 'Le nom complet est obligatoire.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw new AddUserError(
      'INVALID_EMAIL',
      "Le format de l'adresse email est invalide.",
    );
  }
  if (normalized.password.length < PASSWORD_MIN_LENGTH) {
    throw new AddUserError(
      'INVALID_PASSWORD',
      `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
    );
  }
  if (!normalized.roleName)
    throw new AddUserError('INVALID_ROLE', 'Le rôle est obligatoire.');

  return normalized;
}

export async function createUser(
  prisma: AddUserClient,
  rawInput: AddUserInput,
  hashPassword: (password: string) => Promise<string> = hashUserPassword,
): Promise<CreatedUser> {
  const input = normalizeAndValidate(rawInput);

  try {
    return await prisma.$transaction(async (transaction) => {
      const role = await transaction.role.findUnique({
        where: { name: input.roleName },
      });
      if (!role) {
        throw new AddUserError(
          'INVALID_ROLE',
          `Le rôle « ${input.roleName} » n'existe pas.`,
        );
      }

      const duplicate = await transaction.user.findUnique({
        where: { email: input.email },
      });
      if (duplicate) {
        throw new AddUserError(
          'DUPLICATE_EMAIL',
          `Un utilisateur utilise déjà l'adresse email ${input.email}.`,
        );
      }

      const passwordHash = await hashPassword(input.password);
      const user = await transaction.user.create({
        data: {
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          ...(input.phone && { phone: input.phone }),
          roleId: role.id,
          isActive: input.isActive,
        },
        select: safeSelect,
      });

      await transaction.auditLog.create({
        data: {
          action: 'USER_CREATED',
          entity: 'User',
          entityId: user.id,
          userId: null,
          userName: 'scripts/add-user.sh',
          metadata: {
            email: user.email,
            fullName: user.fullName,
            roleName: user.role.name,
            source: 'scripts/add-user.sh',
          },
        },
      });

      return user;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('email')
    ) {
      throw new AddUserError(
        'DUPLICATE_EMAIL',
        `Un utilisateur utilise déjà l'adresse email ${input.email}.`,
      );
    }
    throw error;
  }
}

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new AddUserError('CONFIG', 'DATABASE_URL est absent.');
  return value;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

function parseInput(payload: string): AddUserInput {
  const [fullName, email, phone, password, roleName, active] =
    payload.split('\0');
  if (active === undefined)
    throw new AddUserError('INPUT', 'Données de création incomplètes.');
  return {
    fullName,
    email,
    phone: phone || undefined,
    password,
    roleName,
    isActive: active === 'true',
  };
}

async function run(): Promise<void> {
  const command = process.argv[2];
  if (!['health', 'roles', 'create'].includes(command ?? '')) {
    throw new AddUserError('USAGE', 'Commande interne invalide.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
  });

  try {
    if (command === 'health') {
      await prisma.$queryRaw`SELECT 1`;
      process.stdout.write('ok\n');
      return;
    }

    if (command === 'roles') {
      const roles = await prisma.role.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      const definitions = new Map(
        ROLE_DEFINITIONS.map((definition) => [definition.name, definition]),
      );
      const existingNames = new Set(roles.map(({ name }) => name));
      for (const role of roles) {
        const displayName = definitions.get(role.name)?.displayName ?? '';
        process.stdout.write(
          `AVAILABLE\t${role.id}\t${role.name}\t${displayName}\n`,
        );
      }
      for (const definition of ROLE_DEFINITIONS) {
        if (!existingNames.has(definition.name)) {
          process.stdout.write(
            `MISSING\t-\t${definition.name}\t${definition.displayName}\n`,
          );
        }
      }
      return;
    }

    const user = await createUser(prisma, parseInput(await readStdin()));
    process.stdout.write(`${JSON.stringify(user)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  run().catch((error: unknown) => {
    if (error instanceof AddUserError) {
      process.stderr.write(`ADD_USER_ERROR:${error.code}:${error.message}\n`);
    } else {
      const message =
        error instanceof Error ? error.message : 'Erreur inconnue';
      process.stderr.write(`ADD_USER_ERROR:DATABASE:${message}\n`);
    }
    process.exitCode = 1;
  });
}
