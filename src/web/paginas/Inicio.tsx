import { ROTULO_PERFIL, ROTULO_STATUS } from "../api";
import { Link } from "../roteador";
import { useSessao } from "../sessao";

export function Inicio() {
  const { eu } = useSessao();
  if (!eu) return null;
  const { usuario, escritorio } = eu;
  return (
    <section className="cartao">
      <h2>Olá, {usuario.nome}</h2>
      <dl className="dados">
        <dt>E-mail</dt>
        <dd>{usuario.email}</dd>
        {usuario.dono_plataforma ? (
          <>
            <dt>Acesso</dt>
            <dd>Dono da plataforma</dd>
          </>
        ) : (
          <>
            <dt>Escritório</dt>
            <dd>
              {escritorio?.nome} ({escritorio ? ROTULO_STATUS[escritorio.status] : ""})
            </dd>
            <dt>Perfil</dt>
            <dd>{usuario.perfil ? ROTULO_PERFIL[usuario.perfil] : "—"}</dd>
          </>
        )}
        <dt>Verificação em duas etapas</dt>
        <dd>{usuario.totp_ativo ? "Ativa" : "Não ativada"}</dd>
      </dl>
      {!usuario.totp_ativo && (
        <p>
          <Link para="/seguranca">Ativar a verificação em duas etapas</Link>
        </p>
      )}
      {usuario.dono_plataforma && (
        <p>
          <Link para="/plataforma">Abrir o painel do dono</Link>
        </p>
      )}
      {usuario.perfil === "socio" && (
        <p>
          <Link para="/equipe">Gerenciar a equipe</Link>
        </p>
      )}
    </section>
  );
}
