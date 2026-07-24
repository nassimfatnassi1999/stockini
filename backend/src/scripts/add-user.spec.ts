import * as bcrypt from 'bcryptjs';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  AddUserError,
  BCRYPT_ROUNDS,
  createUser,
  normalizeAndValidate,
  type AddUserInput,
  type CreatedUser,
} from './add-user';

const validInput: AddUserInput = {
  fullName: ' Administrateur Stockini ',
  email: ' ADMIN@EXAMPLE.COM ',
  phone: '',
  password: 'mot-de-passe-solide',
  roleName: 'ADMIN',
  isActive: true,
};

function mockClient(
  options: {
    duplicate?: boolean;
    role?: boolean;
    createError?: Error;
    auditError?: Error;
  } = {},
) {
  let createdData: Record<string, unknown> | undefined;
  let transactionCommitted = false;
  const transaction = {
    role: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.role === false ? null : { id: 'role-1', name: 'ADMIN' },
        ),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.duplicate ? { id: 'existing' } : null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          if (options.createError) throw options.createError;
          createdData = data;
          return Promise.resolve({
            id: 'user-1',
            email: data.email,
            fullName: data.fullName,
            phone: data.phone ?? null,
            isActive: data.isActive,
            role: { id: 'role-1', name: 'ADMIN' },
          } as CreatedUser);
        }),
    },
    auditLog: {
      create: jest.fn().mockImplementation(() => {
        if (options.auditError) throw options.auditError;
        return Promise.resolve({});
      }),
    },
  };
  const client = {
    $transaction: jest.fn(
      async (operation: (tx: typeof transaction) => Promise<CreatedUser>) => {
        const result = await operation(transaction);
        transactionCommitted = true;
        return result;
      },
    ),
  };
  return {
    client,
    transaction,
    getCreatedData: () => createdData,
    committed: () => transactionCommitted,
  };
}

describe('script add-user', () => {
  it('crée un utilisateur valide et normalise son email', async () => {
    const mock = mockClient();
    const result = await createUser(mock.client, validInput);
    expect(result.email).toBe('admin@example.com');
    expect(mock.getCreatedData()).toEqual(
      expect.objectContaining({ email: 'admin@example.com', roleId: 'role-1' }),
    );
    expect(mock.transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'USER_CREATED',
        entity: 'User',
        entityId: 'user-1',
        userId: null,
        userName: 'scripts/add-user.sh',
        metadata: {
          email: 'admin@example.com',
          fullName: 'Administrateur Stockini',
          roleName: 'ADMIN',
          source: 'scripts/add-user.sh',
        },
      },
    });
    expect(mock.committed()).toBe(true);
  });

  it('refuse un email invalide', () => {
    expect(() =>
      normalizeAndValidate({ ...validInput, email: 'invalide' }),
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_EMAIL' }) as AddUserError,
    );
  });

  it('refuse un email déjà utilisé avant toute création', async () => {
    const mock = mockClient({ duplicate: true });
    await expect(createUser(mock.client, validInput)).rejects.toMatchObject({
      code: 'DUPLICATE_EMAIL',
    });
    expect(mock.transaction.user.create).not.toHaveBeenCalled();
  });

  it('refuse un mot de passe trop court', () => {
    expect(() =>
      normalizeAndValidate({ ...validInput, password: 'court' }),
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_PASSWORD' }) as AddUserError,
    );
  });

  it('refuse un rôle vide', () => {
    expect(() =>
      normalizeAndValidate({ ...validInput, roleName: ' ' }),
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_ROLE' }) as AddUserError,
    );
  });

  it('refuse une relation Role inexistante', async () => {
    const mock = mockClient({ role: false });
    await expect(createUser(mock.client, validInput)).rejects.toMatchObject({
      code: 'INVALID_ROLE',
    });
    expect(mock.transaction.user.create).not.toHaveBeenCalled();
  });

  it('propage une erreur de connexion PostgreSQL', async () => {
    const client = {
      $transaction: jest
        .fn()
        .mockRejectedValue(new Error('connection refused')),
    };
    await expect(createUser(client, validInput)).rejects.toThrow(
      'connection refused',
    );
  });

  it('utilise bcrypt avec le même coût que le backend et ne stocke pas le mot de passe en clair', async () => {
    const mock = mockClient();
    const hash = jest.fn().mockResolvedValue('$2b$10$hash');
    await createUser(mock.client, validInput, hash);
    expect(hash).toHaveBeenCalledWith(validInput.password);
    expect(mock.getCreatedData()).toEqual(
      expect.objectContaining({ passwordHash: '$2b$10$hash' }),
    );
    expect(JSON.stringify(mock.getCreatedData())).not.toContain(
      validInput.password,
    );
    const realHashMock = mockClient();
    await createUser(realHashMock.client, validInput);
    const storedHash = realHashMock.getCreatedData()?.passwordHash;
    expect(typeof storedHash).toBe('string');
    expect(await bcrypt.compare(validInput.password, String(storedHash))).toBe(
      true,
    );
    expect(String(storedHash)).toMatch(
      new RegExp(`^\\$2[aby]\\$${BCRYPT_ROUNDS}\\$`),
    );
  });

  it('ne valide pas la transaction lorsque la création échoue', async () => {
    const mock = mockClient({ createError: new Error('write failed') });
    await expect(createUser(mock.client, validInput)).rejects.toThrow(
      'write failed',
    );
    expect(mock.committed()).toBe(false);
  });

  it("annule aussi l'utilisateur lorsque l'écriture de l'audit échoue", async () => {
    const mock = mockClient({ auditError: new Error('audit failed') });
    await expect(createUser(mock.client, validInput)).rejects.toThrow(
      'audit failed',
    );
    expect(mock.transaction.user.create).toHaveBeenCalled();
    expect(mock.committed()).toBe(false);
  });

  it('redemande des mots de passe différents puis annule sans appeler la création', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'stockini-add-user-'));
    const calls = resolve(directory, 'calls');
    const helper = resolve(directory, 'helper.sh');
    writeFileSync(
      helper,
      `#!/usr/bin/env bash
printf '%s\\n' "$1" >>"${calls}"
case "$1" in
  roles) printf 'role-1\\tADMIN\\n' ;;
  create) printf '{"id":"unexpected"}\\n' ;;
esac
`,
      { mode: 0o700 },
    );
    chmodSync(helper, 0o700);

    const script = resolve(process.cwd(), '..', 'scripts', 'add-user.sh');
    const input = [
      'Administrateur',
      'admin@example.com',
      '',
      '1',
      '',
      'motdepasse-1',
      'motdepasse-2',
      'motdepasse-1',
      'motdepasse-1',
      'n',
      '',
    ].join('\n');
    const result = spawnSync('bash', [script], {
      input,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test', ADD_USER_TEST_HELPER: helper },
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Les mots de passe ne correspondent pas.',
    );
    expect(result.stdout).toContain('Création annulée.');
    expect(readFileSync(calls, 'utf8')).toBe('roles\n');
  });
});
