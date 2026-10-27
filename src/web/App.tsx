import { useEffect, useState } from "react";

type Saude = { ok: boolean; ambiente: string };

export function App() {
  const [saude, setSaude] = useState<Saude | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch("/api/saude")
      .then((r) => (r.ok ? (r.json() as Promise<Saude>) : Promise.reject(new Error("falha"))))
      .then(setSaude)
      .catch(() => setErro(true));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>advocacia.legal — em construção</h1>
      <p>
        {erro
          ? "Não foi possível consultar o servidor."
          : saude
            ? `Ambiente: ${saude.ambiente}`
            : "Consultando o servidor..."}
      </p>
    </main>
  );
}
