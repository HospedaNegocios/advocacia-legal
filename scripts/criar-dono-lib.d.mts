export const HOSTS: { dev: string; prod: string };
export const VALIDADE_TOKEN_MS: number;
export function validarEmail(bruto: unknown): string;
export function validarAmbiente(bruto: unknown): "dev" | "prod";
export function gerarToken(): string;
export function hashDoToken(token: string): Promise<string>;
export function montarComandos(dados: { email: string; tokenHash: string; agora?: Date; idNovoUsuario?: string }): string[];
export function montarLink(ambiente: "dev" | "prod", token: string): string;
