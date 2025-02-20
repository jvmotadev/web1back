import Repository from '@lib/repository';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const repository = new Repository();

export async function subscriptionController(fastify: FastifyInstance) {
  // Criar uma nova assinatura
  fastify.post('/subscriptions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const bodySchema = z.object({
        name: z.string().min(1, "O nome é obrigatório."),
        category: z.string().min(1, "A categoria é obrigatória."),
        day: z.number().int().min(1).max(31, "Dia inválido."),
        month: z.number().int().min(1).max(12).optional(),
        value: z.number().positive("O valor deve ser positivo."),
        frequency: z.enum(["mensal", "anual"]),
      });

      const body = bodySchema.parse(request.body);
      const newSubscription = await repository.createSubscription(body);
      return reply.status(201).send(newSubscription);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Erro de validação', details: error.errors });
      }
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // Buscar todas as assinaturas
  fastify.get('/subscriptions', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const subscriptions = await repository.getAllSubscriptions();
      return reply.status(200).send(subscriptions);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // Atualizar uma assinatura
  fastify.put('/subscriptions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ id: z.string() });
      const bodySchema = z.object({
        name: z.string().optional(),
        category: z.string().optional(),
        day: z.number().int().min(1).max(31).optional(),
        month: z.number().int().min(1).max(12).optional(),
        value: z.number().positive().optional(),
        frequency: z.enum(["mensal", "anual"]).optional(),
      });

      const params = paramsSchema.parse(request.params);
      const body = bodySchema.parse(request.body);
      const updatedSubscription = await repository.updateSubscription(params.id, body);

      if (!updatedSubscription) {
        return reply.status(404).send({ error: 'Assinatura não encontrada' });
      }
      return reply.status(200).send(updatedSubscription);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Erro de validação', details: error.errors });
      }
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });

  // Deletar uma assinatura
  fastify.delete('/subscriptions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsSchema = z.object({ id: z.string() });
      const params = paramsSchema.parse(request.params);
      const deletedSubscription = await repository.deleteSubscription(params.id);

      if (!deletedSubscription) {
        return reply.status(404).send({ error: 'Assinatura não encontrada' });
      }
      return reply.status(200).send(deletedSubscription);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro interno do servidor' });
    }
  });
}
