import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

// ─── Mock nodemailer ──────────────────────────────────────────────────────────

jest.mock('nodemailer');

const mockedNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

function buildTransporter() {
  return {
    sendMail: jest.fn().mockResolvedValue({ messageId: 'abc' }),
    verify: jest.fn().mockResolvedValue(true),
  };
}

/** Builds a ConfigService stub backed by a plain env map. */
function buildConfig(env: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T): T => {
      return (env[key] as unknown as T) ?? (def as T);
    },
  } as unknown as ConfigService;
}

function defaultEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_REQUIRE_TLS: 'true',
    SMTP_FORCE_IPV4: 'true',
    SMTP_USER: 'user@gmail.com',
    SMTP_PASS: 'app-password',
    SMTP_FROM: 'user@gmail.com',
    ...overrides,
  };
}

describe('EmailService — SMTP configuration validation', () => {
  let transporter: ReturnType<typeof buildTransporter>;

  beforeEach(() => {
    jest.clearAllMocks();
    transporter = buildTransporter();
    mockedNodemailer.createTransport.mockReturnValue(
      transporter as unknown as nodemailer.Transporter,
    );
  });

  it('port 587 + secure=false is valid (no throw)', () => {
    expect(
      () => new EmailService(buildConfig(defaultEnv({ SMTP_PORT: '587', SMTP_SECURE: 'false' }))),
    ).not.toThrow();
  });

  it('port 587 + secure=true is invalid (throws)', () => {
    expect(
      () => new EmailService(buildConfig(defaultEnv({ SMTP_PORT: '587', SMTP_SECURE: 'true' }))),
    ).toThrow(/port 587 requires SMTP_SECURE=false/);
  });

  it('port 465 + secure=true is valid (no throw)', () => {
    expect(
      () => new EmailService(buildConfig(defaultEnv({ SMTP_PORT: '465', SMTP_SECURE: 'true' }))),
    ).not.toThrow();
  });

  it('port 465 + secure=false is invalid (throws)', () => {
    expect(
      () => new EmailService(buildConfig(defaultEnv({ SMTP_PORT: '465', SMTP_SECURE: 'false' }))),
    ).toThrow(/port 465 requires SMTP_SECURE=true/);
  });
});

describe('EmailService — transporter options', () => {
  let transporter: ReturnType<typeof buildTransporter>;

  beforeEach(() => {
    jest.clearAllMocks();
    transporter = buildTransporter();
    mockedNodemailer.createTransport.mockReturnValue(
      transporter as unknown as nodemailer.Transporter,
    );
  });

  it('forces IPv4 (family: 4) when SMTP_FORCE_IPV4=true', () => {
    new EmailService(buildConfig(defaultEnv({ SMTP_FORCE_IPV4: 'true' })));
    const opts = mockedNodemailer.createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.family).toBe(4);
  });

  it('does not set family when SMTP_FORCE_IPV4=false', () => {
    new EmailService(buildConfig(defaultEnv({ SMTP_FORCE_IPV4: 'false' })));
    const opts = mockedNodemailer.createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.family).toBeUndefined();
  });

  it('sets requireTLS and STARTTLS-compatible options for port 587', () => {
    new EmailService(buildConfig(defaultEnv()));
    const opts = mockedNodemailer.createTransport.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.port).toBe(587);
    expect(opts.secure).toBe(false);
    expect(opts.requireTLS).toBe(true);
    expect((opts.tls as { servername: string }).servername).toBe('smtp.gmail.com');
  });
});

describe('EmailService — error mapping', () => {
  let service: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedNodemailer.createTransport.mockReturnValue(
      buildTransporter() as unknown as nodemailer.Transporter,
    );
    service = new EmailService(buildConfig(defaultEnv()));
  });

  it('maps ENETUNREACH to an IPv6/IPv4 message', () => {
    const err = Object.assign(new Error('connect ENETUNREACH 2a00:1450:4001:c21::6d:587'), {
      code: 'ENETUNREACH',
    });
    expect(service.mapSmtpError(err)).toMatch(/IPv6.*IPv4|IPv4 doit être forcé/);
  });

  it('maps "wrong version number" to a TLS/SSL message', () => {
    const err = new Error('140736...:SSL routines:tls_validate_record_header:wrong version number');
    expect(service.mapSmtpError(err)).toMatch(/Configuration TLS\/SSL/);
  });

  it('maps EAUTH to an invalid-credentials message', () => {
    const err = Object.assign(new Error('Invalid login: 535-5.7.8'), { code: 'EAUTH' });
    expect(service.mapSmtpError(err)).toMatch(/Identifiants SMTP invalides/);
  });

  it('maps ETIMEDOUT to a timeout message', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    expect(service.mapSmtpError(err)).toMatch(/Délai de connexion/);
  });
});

describe('EmailService — sending', () => {
  let service: EmailService;
  let transporter: ReturnType<typeof buildTransporter>;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    transporter = buildTransporter();
    mockedNodemailer.createTransport.mockReturnValue(
      transporter as unknown as nodemailer.Transporter,
    );
    service = new EmailService(buildConfig(defaultEnv()));
    // Silence/inspect logger warnings about empty attachments.
    warnSpy = jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
  });

  it('warns when a PDF attachment is missing/empty', async () => {
    await service.send({
      to: 'client@example.com',
      subject: 'Facture',
      body: 'Bonjour',
      attachments: [
        { filename: 'FACTURE.pdf', content: Buffer.alloc(0), contentType: 'application/pdf' },
      ],
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/empty \(0 bytes\)/));
  });

  it('warns when there are no attachments at all', async () => {
    await service.send({
      to: 'client@example.com',
      subject: 'Facture',
      body: 'Bonjour',
      attachments: [],
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/no attachments/));
  });

  it('rethrows a friendly message when sendMail fails', async () => {
    transporter.sendMail.mockRejectedValueOnce(
      Object.assign(new Error('connect ENETUNREACH 2a00:1450::587'), { code: 'ENETUNREACH' }),
    );
    jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.send({
        to: 'client@example.com',
        subject: 'Facture',
        body: 'Bonjour',
        attachments: [
          { filename: 'FACTURE.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
        ],
      }),
    ).rejects.toThrow(/IPv4/);
  });

  it('verifySmtpConnection resolves true when transporter.verify succeeds', async () => {
    await expect(service.verifySmtpConnection()).resolves.toBe(true);
    expect(transporter.verify).toHaveBeenCalled();
  });
});
