// Aplica o tema salvo antes da tela aparecer (evita piscar). Arquivo externo por causa da CSP.
try {
  var t = localStorage.getItem("tema");
  if (t === "claro" || t === "escuro") document.documentElement.setAttribute("data-tema", t);
} catch (e) {
  /* sem armazenamento: segue o tema do sistema */
}
