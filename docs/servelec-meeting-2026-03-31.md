# Servelec — Meeting Prep
**Date:** 31 de março de 2026, 11h00
**Format:** Microsoft Teams
**Attendees:** Rui Ventura, Fernando, João Castro (+ Pedro)
**Goal:** Confirm the pain is real → get their Worten API key to run the report

---

## Before the Call

- [ ] Teams link received and tested (join 5 min early, check mic + camera)
- [ ] Browser tab with a Worten product page open (to screenshare if needed)
- [ ] This document open on second screen
- [ ] Pricing memorised: relatório grátis → €1.000 setup → €50/mês (6 meses) → €100/mês

---

## 1. Opening (2 min)

> "Bom dia a todos. Obrigado pela disponibilidade. Vou ser directo e objetivo — a reunião não vai passar dos 30 minutos. O meu objetivo hoje é perceber se o que desenvolvi faz sentido para o vosso negócio no Worten. Se fizer, falamos de próximos passos. Se não fizer, também não há problema."

**Then ask:**
> "Antes de começar — para perceber melhor com quem estou a falar, qual é a função de cada um de vocês ligada ao Worten?"

| Nome | Função |
|------|--------|
| Rui Ventura | CEO (co-owner with brother) |
| Fernando | Did not attend |
| João Castro | Did not attend |

**Who is the decision maker?** Rui Ventura (CEO) + brother (co-owner — was supposed to attend, couldn't)

---

## 2. Discovery Questions (8 min)

Ask these in order. Write the answers — they'll be useful for the report.

**Q1: Quantos produtos têm activos no Worten?**
> Resposta: 70k

**Q2: Como gerem os preços actualmente? Têm alguém dedicado a isso ou é um processo manual?**
> Resposta: margem pelo fornecedor

**Q3: Com que frequência verificam se estão em primeiro lugar nos produtos mais importantes?**
> Resposta: Manual

**Q4: Já alguma vez perderam uma venda porque estavam em segundo lugar por uma diferença pequena — €0.20, €0.50?**
> Resposta: Não sabia

**Q5: Para além do Worten, vendem noutros marketplaces? (Carrefour, PCComponentes, Phone House?)**
> Resposta: _______________

**Q6: Têm algum sistema que sincroniza automaticamente os vossos produtos com o Worten? Com que frequência e o que sincroniza — preços, stock, ou ambos?**
> Resposta: _______________

> ⚠️ Se sincronizarem preços: a ferramenta precisa de ser a única a tocar nos preços. O sync deles mantém-se mas só para stock/quantidade. Acordar isto antes de avançar.

---

## 3. The Pitch (5 min)

Only pitch after they've answered the discovery questions. Adapt based on their answers.

**Dormant catalog angle:**
> "Com base no que me disseram — têm [X] produtos no Worten. A nossa experiência é que a maioria dos vendedores está em primeiro lugar em apenas uma fração do catálogo. O resto está essencialmente invisível. A ferramenta que desenvolvi identifica exactamente quais os produtos onde estão a perder a primeira posição — e por quanto. Muitas vezes são diferenças de €0.20 a €1.00."

**How it works (keep it simple):**
> "A cada 15-30 minutos, a ferramenta verifica os preços dos concorrentes para cada produto. Se há margem para descer e ganhar o primeiro lugar, ajusta automaticamente. Nunca desce abaixo da margem mínima que definirem. E quando já estão em primeiro lugar, pode subir o preço até ao máximo possível — o que muitos vendedores estão a deixar escapar."

**If they sell on other marketplaces:**
> "Funciona em qualquer marketplace que use Mirakl — Carrefour, PCComponentes, Phone House. É exactamente o mesmo sistema, só muda a configuração. Se vendem em [marketplace X], podemos cobrir isso também."

---

## 4. Objection Handling

**"Já temos alguém a fazer isso manualmente"**
> "Quantos produtos conseguem verificar por dia? Com [X] produtos é impossível fazer isto manualmente com a frequência necessária. A ferramenta faz isto para todos os produtos, a cada 30 minutos, sem intervenção humana."

**"Temos medo de descer os preços demasiado"**
> "É exactamente para isso que existe o limite de margem. Definem a margem mínima — a ferramenta nunca desce abaixo disso. Não há risco de race to the bottom."

**"Quanto custa?"**
> "O relatório não tem custo — só vos peço a API key para o correr. Se quiserem avançar para a implementação após verem os resultados, o valor é €1.000 de setup e €50/mês durante os primeiros 6 meses, depois €100/mês. Só pagam se decidirem avançar."

**"Precisamos de pensar"**
> "Claro. O próximo passo que proponho não vos compromete a nada — é um relatório gratuito com os vossos dados reais. Assim podem ver exactamente quantos produtos estão a perder e por quanto, antes de qualquer decisão."

**"Podem mostrar uma demo?"**
> "Ainda não tenho uma demo genérica — o que faço é melhor do que isso. Com a vossa API key corro o relatório com os vossos dados reais. É mais útil do que qualquer demo porque estão a ver o vosso catálogo, não um exemplo fictício."

**"Como funciona tecnicamente? O que precisam de nós?"**
> "Precisamos da vossa API key do Worten — é o mesmo tipo de acesso que ferramentas como o Boardfy usam. Com isso consigo correr o relatório e mostrar-vos os resultados reais do vosso catálogo. É só leitura da nossa parte."

**"E a segurança da chave?"**
> "A chave fica armazenada de forma segura. Se em algum momento quiserem revogar o acesso, contactam o suporte do Worten e a chave deixa de funcionar imediatamente."

---

## 5. The Close (2 min)

If interest is confirmed:
> "O próximo passo que proponho é o relatório. Preciso da vossa API key do Worten — podem gerá-la no vosso portal de vendedor, em Conta → API. Com isso consigo ter o relatório pronto em [X dias]. O relatório não tem qualquer custo — só avançamos para a implementação se os números fizerem sentido para vocês."

**API key received?** ☐ Yes ☐ No ☒ They'll send later — Rui will speak to the technical person responsible; aim to receive before follow-up call

**Follow-up agreed?** Yes — start of next week (week of April 6)

---

## 6. Notes

- Call lasted ~10 min. Only Rui attended — brother (co-owner) couldn't join.
- Rui didn't have full technical knowledge to answer all discovery questions — that's why a follow-up is needed with the right person.
- Pricing: mentioned €1,000 + €50/month. Rui did NOT push back on price. €100/month escalation was NOT mentioned — 70k products at €50/month feels fair and justified.
- Rui's closing words: "this makes total sense for them" — strong buying signal from the CEO.
- ~70,000 active products on Worten.

---

## After the Call

- [x] Send follow-up email same day confirming what was agreed
- [x] Update OUTREACH.md with outcome
- [ ] Receive API key from Servelec technical contact → run P11 proof-of-concept script
- [ ] Follow-up call — start of week of April 6 (have report ready if API key arrives in time)
