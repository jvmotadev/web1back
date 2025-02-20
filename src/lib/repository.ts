import { PrismaClient, Assinatura, LogProcessamento, Transacao } from '@prisma/client';
import { z } from 'zod';

// Define o esquema de validação usando Zod
export const transacaoSchema = z.object({
  value: z.number().positive("O valor deve ser positivo."),
  name: z.string().min(1, "O nome é obrigatório."),
  category: z.string().min(1, "A categoria é obrigatória."),
  description: z.string().optional(),
  type: z.enum(["entrada", "saida"]),
});

const assinaturaBaseSchema = z.object({
  name: z.string().min(1, "O nome é obrigatório."),
  category: z.string().min(1, "A categoria é obrigatória."),
  day: z.number().int().min(1).max(31, "Dia inválido."),
  month: z.number().int().min(1).max(12).optional(), // Para assinaturas anuais
  value: z.number().positive("O valor deve ser positivo."),
  frequency: z.enum(["mensal", "anual"]),
});

export const assinaturaSchema = assinaturaBaseSchema.refine(data => {
  if (data.month) {
    const isValidDate = new Date(new Date().getFullYear(), data.month - 1, data.day).getDate() === data.day;
    return isValidDate;
  }
  return true;
}, {
  message: "Data inválida (dia e mês não correspondem a um dia real no calendário).",
  path: ["day"],
});


class Repository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // Criar uma nova assinatura
  async createSubscription(data: Omit<z.infer<typeof assinaturaSchema>, 'id' | 'createdAt' | 'updatedAt'>): Promise<Assinatura> {
    const parsedData = assinaturaSchema.parse(data);
    return await this.prisma.assinatura.create({
      data: parsedData,
    });
  }

  // Buscar todas as assinaturas
  async getAllSubscriptions(): Promise<Assinatura[]> {
    return await this.prisma.assinatura.findMany();
  }

  // Atualizar uma assinatura
  async updateSubscription(id: string, data: Partial<Omit<z.infer<typeof assinaturaBaseSchema>, 'id'>>): Promise<Assinatura | null> {
    const parsedData = assinaturaBaseSchema.partial().parse(data);
    return await this.prisma.assinatura.update({
      where: { id },
      data: parsedData,
    });
  }
  
    // Deletar uma assinatura
    async deleteSubscription(id: string): Promise<Assinatura | null> {
      return await this.prisma.assinatura.delete({
        where: { id },
      });
    }

  // Criar um pagamento retroativo baseado na assinatura
  async createRetroactivePayment(assinaturaId: string): Promise<Transacao | null> {
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { id: assinaturaId },
      include: { logs: true },
    });

    if (!assinatura) return null;

    // Verifica se já foi processado recentemente
    const lastLog = assinatura.logs.sort((a, b) => b.processadoEm.getTime() - a.processadoEm.getTime())[0];

    const today = new Date();
    const lastProcessedDate = lastLog ? new Date(lastLog.processadoEm) : new Date(0);

    let shouldProcess = false;
    if (assinatura.frequency === "mensal") {
      shouldProcess = today.getMonth() !== lastProcessedDate.getMonth() || today.getFullYear() !== lastProcessedDate.getFullYear();
    } else if (assinatura.frequency === "anual") {
      shouldProcess = today.getFullYear() !== lastProcessedDate.getFullYear();
    }

    if (!shouldProcess) return null;

    // Criando a transação retroativa
    const transaction = await this.prisma.transacao.create({
      data: {
        value: assinatura.value,
        name: assinatura.name,
        category: assinatura.category,
        description: `Pagamento retroativo da assinatura ${assinatura.name}`,
        date: new Date(),
        type: "saida",
      },
    });

    // Criando um log de processamento
    await this.prisma.logProcessamento.create({
      data: {
        assinaturaId: assinatura.id,
        processadoEm: new Date(),
      },
    });

    return transaction;
  }

  // Processa todas as assinaturas que necessitam de pagamentos retroativos
  async processAllRetroactivePayments(): Promise<Transacao[]> {
    const assinaturas = await this.prisma.assinatura.findMany({ include: { logs: true } });
    const transactions: Transacao[] = [];

    for (const assinatura of assinaturas) {
      const transaction = await this.createRetroactivePayment(assinatura.id);
      if (transaction) transactions.push(transaction);
    }

    return transactions;
  }

  // Criar uma transação com validação
  async createTransaction(data: Omit<z.infer<typeof transacaoSchema>, 'id' | 'date'>): Promise<unknown> {
    // Valida os dados antes de criar a transação
    const parsedData = transacaoSchema.parse(data);
    return await this.prisma.transacao.create({
      data: parsedData,
    });
  }

  // Buscar uma transação por ID
  async getTransactionById(id: string): Promise<unknown | null> {
    return await this.prisma.transacao.findUnique({
      where: { id },
    });
  }

  // Buscar todas as transações
  async getAllTransactions(): Promise<Transacao[]> {
    return await this.prisma.transacao.findMany();
  }

  // Atualizar uma transação com validação
  async updateTransaction(id: string, data: Partial<Omit<z.infer<typeof transacaoSchema>, 'id'>>): Promise<unknown | null> {
    // Valida os dados atualizados
    const parsedData = transacaoSchema.partial().parse(data);
    return await this.prisma.transacao.update({
      where: { id },
      data: parsedData,
    });
  }

  // Deletar uma transação
  async deleteTransaction(id: string): Promise<unknown | null> {
    return await this.prisma.transacao.delete({
      where: { id },
    });
  }
}

export default Repository;
