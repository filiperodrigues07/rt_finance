/**
 * Categorização por palavra-chave — heurística leve compartilhada pelo fast-path da IA
 * (WhatsApp) e pela importação de extrato/fatura. Devolve o NOME de uma categoria do
 * sistema (ver SYSTEM_CATEGORIES em constants.ts) ou null quando não há palpite.
 *
 * Cada regex usa `\b` só no INÍCIO, para casar prefixos ("supermerc" → "supermercado").
 * Termos curtos ambíguos trazem o próprio limite final.
 * Não substitui o resolvedor real de categorias do household — é só um hint de texto.
 */

const RULES: { category: string; re: RegExp }[] = [
  { category: "Mercado", re: /\b(?:mercad|supermerc|atacad|assa[ií]|carrefour|p[aã]o de a[çc]|hortifruti|sacol[aã]o|feira\b|makro|tonin|zaffari|angeloni|condor)/i },
  { category: "Alimentação", re: /\b(?:ifood|rappi|restaurante|lanchonete|lanche|bar\b|pizzaria|hamburgu|padaria|cafeteria|caf[eé]\b|bistr[oô]|churrasc|a[çc]a[íi]|doceria|sorveteria|mcdonald|burger king|subway|habib|outback|spoleto|starbucks)/i },
  { category: "Transporte", re: /\b(?:uber|99app|99\s?pop|99\s?taxi|cabify|indriv|posto\b|ipiranga|shell\b|petrobr|combust[íi]vel|gasolina|etanol|[aá]lcool comum|estacionament|pedagio|ped[aá]gio|sem parar|conectcar|veloe|metr[oô]\b|[oô]nibus|bilhete [úu]nico|passagem\b)/i },
  { category: "Saúde", re: /\b(?:farm[aá]cia|drogaria|droga\s?raia|drogasil|pacheco|panvel|pague menos|nissei|hospital|cl[íi]nic|laborat[oó]ri|exame\b|consulta\b|m[eé]dic|dentist|psic[oó]log|fisioterap|unimed|amil\b|hapvida|plano de sa[úu]de)/i },
  { category: "Contas", re: /\b(?:energia|luz\b|cemig|cpfl|enel\b|light\b|copel|celesc|equatorial|[aá]gua\b|saneament|sabesp|copasa|casan\b|g[aá]s\b|comgas|internet|vivo\b|claro\b|tim\b|telefone|boleto|iptu\b|condom[íi]nio|aluguel)/i },
  { category: "Assinaturas", re: /\b(?:netflix|spotify|amazon prime|prime video|disney|hbo\b|globoplay|youtube premium|deezer|apple\.com|apple\s?music|icloud|google\s?(?:one|storage)|game pass|canva\b|chatgpt|openai|notion|dropbox|adobe)/i },
  { category: "Educação", re: /\b(?:escola|col[eé]gio|faculdade|universidade|curso\b|udemy|alura|coursera|duolingo|mensalidade escolar|material escolar|livraria)/i },
  { category: "Lazer", re: /\b(?:cinema|cinemark|uci\b|teatro|show\b|ingresso|steam\b|nintendo|playstation|academia|smart\s?fit|bio\s?ritmo|crossfit|parque\b|balada|boliche)/i },
  { category: "Roupas", re: /\b(?:renner|riachuelo|c&a\b|c e a\b|marisa\b|zara\b|hering|pernambucanas|centauro|nike\b|adidas|netshoes|dafiti|shein|calçad|calcad|sapataria|loja de roupa)/i },
  { category: "Casa", re: /\b(?:leroy|telhanorte|c&c\b|casas bahia|magazine luiza|magalu|americanas|havan\b|tok\s?stok|mobly|madeira\s?madeira|constru[çc][aã]o|ferragem|marcenari|eletrodom[eé]stic)/i },
  { category: "Viagens", re: /\b(?:latam|gol linhas|azul linhas|smiles|123\s?milhas|decolar|booking|airbnb|hotel\b|pousada|hostel|resort|passagem a[eé]rea|maxmilhas)/i },
];

const INCOME_RULES: { category: string; re: RegExp }[] = [
  { category: "Salário", re: /\b(?:sal[aá]ri|folha de pagament|pagamento de sal|remunera[çc][aã]o|pr[oó]-?labore|proventos)/i },
  { category: "Rendimentos", re: /\b(?:rendiment|juros\b|cdb\b|tesouro\b|dividend|jcp\b|resgate|aplica[çc][aã]o resgatada|cashback)/i },
];

/** Palpite de categoria pelo texto do lançamento. `kind` filtra receita x despesa. */
export function guessCategory(
  text: string,
  kind: "EXPENSE" | "INCOME" = "EXPENSE",
): string | null {
  const t = text.normalize("NFC");
  const rules = kind === "INCOME" ? INCOME_RULES : RULES;
  for (const r of rules) if (r.re.test(t)) return r.category;
  return null;
}
