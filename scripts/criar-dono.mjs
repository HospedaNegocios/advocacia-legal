// Cria (ou reaproveita) o dono da plataforma e gera um link de primeiro acesso de uso único (24 h).
// Uso (pelo workflow criar-dono): AMBIENTE=dev|prod EMAIL=... node scripts/criar-dono.mjs
// O link NUNCA é impresso no log: vai somente para o resumo do job ($GITHUB_STEP_SUMMARY).
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { gerarToken, hashDoToken, montarComandos, montarLink, validarAmbiente, validarEmail } from "./criar-dono-lib.mjs";

function falhar(mensagem) {
  console.error(`Erro: ${mensagem}`);
  process.exit(1);
}

let ambiente;
let email;
try {
  ambiente = validarAmbiente(process.env.AMBIENTE);
  email = validarEmail(process.env.EMAIL);
} catch (erro) {
  falhar(erro.message);
}

const resumo = process.env.GITHUB_STEP_SUMMARY;
const local = process.env.D1_LOCAL === "1"; // só para testar no computador, nunca no workflow
if (!resumo && !local) falhar("GITHUB_STEP_SUMMARY ausente: este script deve rodar no GitHub Actions.");

const token = gerarToken();
// Não usar ::add-mask:: aqui: o GitHub também mascara o resumo do job e o link sairia como "***".
// O token nunca é impresso no log (só no resumo), e a mensagem de erro abaixo o substitui por "***".
const tokenHash = await hashDoToken(token);
const comandos = montarComandos({ email, tokenHash });

// Sem shell: os argumentos vão direto ao processo, então nada do e-mail é interpretado como comando.
const resultado = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "DB", local ? "--local" : "--remote", "--env", ambiente, "--yes", "--command", comandos.join("; ")],
  { encoding: "utf8" },
);
if (resultado.status !== 0) {
  const limpo = `${resultado.stdout}\n${resultado.stderr}`.replaceAll(token, "***").replaceAll(tokenHash, "***");
  console.error(limpo);
  falhar("não foi possível gravar no banco D1. Confira se as migrações já foram aplicadas e os segredos do GitHub.");
}

const link = montarLink(ambiente, token);
if (resumo) {
  appendFileSync(
    resumo,
    [
      `## Link de primeiro acesso (${ambiente})`,
      "",
      `Dono: \`${email}\``,
      "",
      `Abra o link abaixo (vale por 24 horas e só pode ser usado uma vez):`,
      "",
      link,
      "",
      "Depois de abrir, defina a senha e configure o aplicativo autenticador (2FA).",
      "",
    ].join("\n"),
  );
  console.log("Pronto. O link está no resumo deste job (aba Summary). Ele não é exibido no log.");
} else {
  console.log("Modo local: dono gravado no banco local. Link não exibido.");
}
