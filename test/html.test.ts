import { describe, expect, it } from "vitest";
import { htmlParaTexto } from "../src/comum/html";

describe("htmlParaTexto", () => {
  it("remove tags, preserva parágrafos e decodifica entidades", () => {
    expect(htmlParaTexto("<p>Intime-se&nbsp;a parte.</p><p>Art. 5&ordm; &amp; 6</p>")).toBe("Intime-se a parte.\n\nArt. 5º & 6");
  });
  it("remove script e tag cortada no fim", () => {
    expect(htmlParaTexto("Olá<script>alert(1)</script> mundo <b")).toBe("Olá mundo");
  });
  it("texto simples não muda", () => {
    expect(htmlParaTexto("Texto simples")).toBe("Texto simples");
  });
});
