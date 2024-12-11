import { FastifyInstance } from "fastify";
import { z } from "zod";
import { pipeDataStreamToResponse, streamText } from "ai";
import { PrismaClient } from "@prisma/client";
import { createOpenAI } from "@ai-sdk/openai";

// Configuração do OpenAI usando a variável de ambiente para a API Key
const openai = createOpenAI({
  apiKey: process.env.OPENAI_KEY, // Puxa a API Key do arquivo .env
  compatibility: "strict", // Modo estrito para maior compatibilidade
});

const prisma = new PrismaClient();

export async function generateAICompletionRoute(app: FastifyInstance) {
  app.post('/ai/complete', async (request, reply) => {
    // Validação do corpo da requisição
    const bodySchema = z.object({
      prompt: z.string(),
    });

    const { prompt } = bodySchema.parse(request.body);

    try {
      // Busca transações do banco de dados usando Prisma
      const transactions = await prisma.transacao.findMany({
        select: {
          id: true,
          value: true,
          name: true,
          category: true,
          type: true,
        },
      });

      // Converte transações para uma string formatada
      const dataString = transactions
        .map((transaction) => `Name: ${transaction.name}, Value: ${transaction.value}, Type: ${transaction.type}`)
        .join("\n");

      // Substitui {dados} no prompt com os dados das transações
      const promptMessage = prompt.replace("{dados}", dataString);

      // Faz o streaming da resposta da OpenAI
      const result = streamText({
        model: openai("gpt-4o-mini"),
        prompt: promptMessage,
      });

      // Stream da resposta para o cliente
      pipeDataStreamToResponse(reply.raw, {
        execute: async (dataStreamWriter) => {
          dataStreamWriter.writeData("Starting AI response streaming...");
          await result.mergeIntoDataStream(dataStreamWriter);
        },
        onError: (error) => {
          console.error("Error during streaming:", error);
          return error instanceof Error ? error.message : String(error);
        },
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Content-Type": "text/plain",
          "Transfer-Encoding": "chunked",
        },
      });
    } catch (error) {
      console.error("Error generating AI completion:", error);
      reply.status(500).send({ error: "An error occurred while processing your request." });
    }
  });
}
