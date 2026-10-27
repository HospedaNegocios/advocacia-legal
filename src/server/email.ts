// Envio de e-mail. O resto do sistema só conhece a interface `EnviadorEmail`; os testes usam um falso.
// A implementação real usa o binding `send_email` do Cloudflare Email Service (docs/EMAIL.md).

export interface MensagemEmail {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}

export interface EnviadorEmail {
  /** Lança erro se o envio falhar. */
  enviar(mensagem: MensagemEmail): Promise<void>;
}

/** Erro de envio sem o endereço do destinatário nem o texto (só o código da Cloudflare, se houver). */
export class ErroEnvioEmail extends Error {
  constructor(readonly codigo: string) {
    super(`falha no envio de e-mail (${codigo})`);
    this.name = "ErroEnvioEmail";
  }
}

/** Formato: `send({ to, from, subject, text, html })` do Email Service (developers.cloudflare.com/email-service/api/send-emails/workers-api/). */
export function criarEnviadorCloudflare(binding: SendEmail, remetente: string, nomeRemetente = "advocacia.legal"): EnviadorEmail {
  return {
    async enviar(m) {
      try {
        await binding.send({ to: m.para, from: { email: remetente, name: nomeRemetente }, subject: m.assunto, text: m.texto, html: m.html });
      } catch (e) {
        const codigo = e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code.slice(0, 60) : "desconhecido";
        throw new ErroEnvioEmail(codigo);
      }
    },
  };
}
