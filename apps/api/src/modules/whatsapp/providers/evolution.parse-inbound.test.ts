import { describe, it, expect } from "vitest";
import { EvolutionProvider } from "./evolution.provider";
import type { Env } from "../../../config/env.schema";

const env = { EVOLUTION_INSTANCE: "rtfinance" } as Env;
const provider = () => new EvolutionProvider(env);

function upsert(key: Record<string, unknown>, text = "oi") {
  return {
    event: "messages.upsert",
    instance: "rtfinance",
    data: { key, message: { conversation: text }, messageTimestamp: 1788900000, pushName: "Filipe" },
  };
}

describe("EvolutionProvider.parseInbound", () => {
  it("expõe o JID da conversa separado do telefone E.164", () => {
    const [msg] = provider().parseInbound(
      upsert({
        id: "3A75",
        fromMe: false,
        senderPn: "554999648444@s.whatsapp.net",
        remoteJid: "554999648444@s.whatsapp.net",
      }),
    );
    expect(msg!.fromJid).toBe("554999648444@s.whatsapp.net");
    // o telefone canônico ganha o 9º dígito; o JID NÃO pode ser remontado a partir dele
    expect(msg!.fromPhone).toBe("+5549999648444");
  });

  it("preserva o remoteJid @lid como endereço de resposta", () => {
    const [msg] = provider().parseInbound(
      upsert({
        id: "3A76",
        fromMe: false,
        remoteJid: "226417807782125@lid",
        senderPn: "554999648444@s.whatsapp.net",
      }),
    );
    // identidade vem do telefone…
    expect(msg!.fromPhone).toBe("+5549999648444");
    // …mas a resposta tem que voltar para a conversa LID, senão some para o destinatário
    expect(msg!.fromJid).toBe("226417807782125@lid");
  });

  it("ignora grupos e mensagens próprias", () => {
    expect(provider().parseInbound(upsert({ id: "1", fromMe: true, remoteJid: "554999648444@s.whatsapp.net" }))).toHaveLength(0);
    expect(provider().parseInbound(upsert({ id: "2", fromMe: false, remoteJid: "123-456@g.us" }))).toHaveLength(0);
  });
});
