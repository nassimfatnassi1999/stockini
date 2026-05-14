import { BadRequestException, Injectable } from '@nestjs/common';
import { CaisseMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CaisseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
  ) {}

  async getBalance() {
    const config = await this.prisma.caisseConfig.findFirst();
    return {
      solde: Number(config?.solde ?? 0),
      allowNegative: config?.allowNegative ?? false,
    };
  }

  async setAllowNegative(allow: boolean) {
    const config = await this.prisma.caisseConfig.findFirst();
    if (config) {
      return this.prisma.caisseConfig.update({
        where: { id: config.id },
        data: { allowNegative: allow },
      });
    }
    return this.prisma.caisseConfig.create({ data: { allowNegative: allow } });
  }

  async retrait(montant: number, motif?: string, userId?: string) {
    return this.prisma.$transaction((tx) =>
      this.recordMovement(tx, {
        type: CaisseMovementType.RETRAIT_MANUEL,
        montant: -montant,
        motif,
        userId,
      }),
    );
  }

  async depot(montant: number, motif?: string, userId?: string) {
    return this.prisma.$transaction((tx) =>
      this.recordMovement(tx, {
        type: CaisseMovementType.DEPOT_MANUEL,
        montant,
        motif,
        userId,
      }),
    );
  }

  historique(type?: CaisseMovementType) {
    return this.prisma.caisseMovement.findMany({
      where: type ? { type } : undefined,
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordMovement(
    client: DbClient,
    input: {
      type: CaisseMovementType;
      montant: number;
      motif?: string;
      referenceDoc?: string;
      userId?: string;
    },
  ) {
    const config = await client.caisseConfig.findFirst();
    const ancienSolde = Number(config?.solde ?? 0);
    const nouveauSolde = ancienSolde + input.montant;

    const allowNegative = config?.allowNegative ?? false;
    if (nouveauSolde < 0 && !allowNegative) {
      throw new BadRequestException(
        `Solde caisse insuffisant. Solde actuel : ${ancienSolde.toFixed(3)} DT`,
      );
    }

    if (config) {
      await client.caisseConfig.update({
        where: { id: config.id },
        data: { solde: nouveauSolde },
      });
    } else {
      await client.caisseConfig.create({ data: { solde: nouveauSolde } });
    }

    return client.caisseMovement.create({
      data: {
        type: input.type,
        montant: Math.abs(input.montant),
        ancienSolde,
        nouveauSolde,
        motif: input.motif,
        referenceDoc: input.referenceDoc,
        userId: input.userId,
      },
    });
  }
}
