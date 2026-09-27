export function renderCompletedEmail(input: { processingRequestId: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: `Seu video foi processado (${input.processingRequestId})`,
    text:
      `O video que voce enviou (pedido ${input.processingRequestId}) foi processado com sucesso.\n` +
      `Acesse a API para baixar o arquivo com os frames extraidos.`,
  };
}

export function renderFailedEmail(input: {
  processingRequestId: string;
  failureReason: string;
}): { subject: string; text: string } {
  return {
    subject: `Nao foi possivel processar seu video (${input.processingRequestId})`,
    text:
      `O video que voce enviou (pedido ${input.processingRequestId}) nao pode ser processado.\n` +
      `${input.failureReason}`,
  };
}
