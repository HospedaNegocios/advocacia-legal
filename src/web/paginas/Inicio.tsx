import { Building2, ShieldAlert, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { ROTULO_PERFIL, api } from "../api";
import { MODULOS_EM_BREVE } from "../layout/Casca";
import { Link } from "../roteador";
import { useSessao } from "../sessao";
import { Aviso, Cartao, CabecalhoPagina, Indicador, Selo, SeloSituacao } from "../ui";

export function Inicio() {
  const { eu } = useSessao();
  const [equipe, setEquipe] = useState<number | null>(null);
  const socio = eu?.usuario.perfil === "socio";

  useEffect(() => {
    if (!socio) return;
    api<{ usuarios: { ativo: boolean }[] }>("GET", "/api/equipe/usuarios")
      .then((r) => setEquipe(r.usuarios.filter((u) => u.ativo).length))
      .catch(() => setEquipe(null));
  }, [socio]);

  if (!eu) return null;
  const { usuario, escritorio } = eu;
  const primeiroNome = usuario.nome.trim().split(/\s+/)[0] ?? usuario.nome;

  return (
    <>
      <CabecalhoPagina titulo={`Olá, ${primeiroNome}`} descricao={escritorio ? `Resumo do escritório ${escritorio.nome}.` : "Bem-vindo à advocacia.legal."} />

      {!usuario.totp_ativo && (
        <Aviso tipo="atencao">
          A verificação em duas etapas ainda não está ativa na sua conta. <Link para="/seguranca">Ativar agora</Link>
        </Aviso>
      )}

      <section aria-label="Resumo" className="grade grade-kpi">
        {escritorio && (
          <Indicador rotulo="Escritório" valor={escritorio.nome} icone={Building2}>
            <div>
              <SeloSituacao status={escritorio.status} />
            </div>
          </Indicador>
        )}
        <Indicador rotulo="Seu perfil" valor={usuario.perfil ? ROTULO_PERFIL[usuario.perfil] : "—"} icone={UserRound} nota={usuario.email} />
        <Indicador rotulo="Verificação em duas etapas" valor={usuario.totp_ativo ? "Ativa" : "Não ativada"} icone={usuario.totp_ativo ? ShieldCheck : ShieldAlert}>
          <div>
            {usuario.totp_ativo ? (
              <Selo tom="bom" icone={ShieldCheck}>
                Conta protegida
              </Selo>
            ) : (
              <Selo tom="aviso" icone={ShieldAlert}>
                Recomendado ativar
              </Selo>
            )}
          </div>
        </Indicador>
        {socio && equipe !== null && (
          <Indicador rotulo="Equipe" valor={equipe} icone={UsersRound} nota="usuários ativos">
            <Link para="/equipe">Gerenciar a equipe</Link>
          </Indicador>
        )}
      </section>

      <Cartao titulo="Módulos do escritório" subtitulo="Estes módulos estão sendo construídos e ficarão disponíveis aqui.">
        <div className="cartoes-modulos">
          {MODULOS_EM_BREVE.map(({ rotulo, icone: Icone, descricao }) => (
            <div className="modulo" key={rotulo}>
              <Icone size={22} aria-hidden="true" />
              <div>
                <strong>{rotulo}</strong>
                <small>{descricao} · em breve</small>
              </div>
            </div>
          ))}
        </div>
      </Cartao>
    </>
  );
}
