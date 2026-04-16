# Clinks — Meeting Prep
**Date:** 1 de abril de 2026, 11h30
**Format:** Google Meet
**Attendees:** Cristiano (+ Pedro)
**Goal:** Confirm interest → get their Worten API key to run the report

---

## Before the Call

- [ ] Google Meet link received (join 5 min early, check mic + camera)
- [ ] This document open on second screen
- [ ] Pricing memorised: relatório grátis → €1.000 setup → €50/mês
- [ ] Key facts memorised: 17k products, full price rewrite every 2h, external connector ("Weasy/Weezy")

---

## What We Already Know

From the first phone call:

| | |
|---|---|
| **Contact** | Cristiano |
| **Products on Worten** | ~17.000 |
| **External connector** | "Weasy" or "Weezy" (unconfirmed name) — handles Worten API sync |
| **Price sync** | Full rewrite every 2h — cannot be disabled from their side |
| **Main worry** | Structural implications on their existing setup |
| **Reassurance given** | Only need the API key. No structural changes to their system. Price sync is not a problem. |

---

## 1. Opening (2 min)

> "Olá Cristiano, bom dia. Obrigado por marcar. Como combinámos, o objetivo de hoje é mostrar-te como a ferramenta funciona e perceber se faz sentido para o vosso caso específico. Não vai passar de 30 minutos."

---

## 2. Address the Structural Concern Upfront (3 min)

Cristiano already raised this — tackle it head on before anything else.

> "Antes de entrar nos detalhes, quero retomar o ponto que mencionaste na chamada sobre implicações estruturais. Posso confirmar: a ferramenta não toca em nada do vosso sistema atual. Não precisamos de acesso ao vosso conector, não alteramos a vossa plataforma, não interferimos com o fluxo do fornecedor. A única coisa que precisamos é da API key do Worten — é a mesma chave que o vosso conector já usa, só que a nossa ferramenta usa-a em paralelo para ler os preços dos concorrentes e ajustar o vosso."

**On the 2h price sync specifically:**

> "Mencionaste que o vosso sistema faz uma sincronização completa de preços de 2 em 2 horas. Isso não é problema nenhum. A nossa ferramenta corre a cada 5 minutos. Mesmo que a sincronização reponha o preço original, a ferramenta corrige em menos de 5 minutos. Na prática, com 17.000 produtos, o ciclo completo demora segundos."

---

## 3. Discovery Questions (5 min)

Fill in what we don't know yet.

**Q1: O conector ("Weasy/Weezy") — consegues confirmar o nome? Só por curiosidade.**
> Resposta: _______________

**Q2: A sincronização de 2 horas — sincroniza só preços, só stock, ou ambos?**
> Resposta: _______________

**Q3: Os preços que chegam ao Mirakl — vêm calculados da vossa plataforma (margem + comissão já incluída) ou fazem esse cálculo no conector?**
> Resposta: _______________

**Q4: Têm margem mínima definida por produto, ou trabalham com uma margem geral para todo o catálogo?**
> Resposta: _______________

**Q5: Para além do Worten, vendem noutros marketplaces? (Carrefour, PCComponentes, Phone House?)**
> Resposta: _______________

---

## 4. The Pitch (5 min)

> "Com 17.000 produtos ativos, é impossível verificar manualmente quais estão a perder a primeira posição. A nossa experiência é que a maioria dos vendedores está em primeiro lugar numa fração do catálogo — o resto está essencialmente invisível. A ferramenta identifica exatamente quais os produtos onde estão a perder e por quanto. Muitas vezes são diferenças de €0.20 a €1.00."

> "Funciona em duas direções: se há margem para baixar e ganhar o primeiro lugar, ajusta automaticamente. Se já estão em primeiro lugar, pode subir o preço até ao máximo possível — muitos vendedores estão a deixar dinheiro na mesa quando já estão em primeiro."

---

## 5. Objection Handling

**"E se o nosso conector repuser o preço?"**
> "É exatamente o que vai acontecer de 2 em 2 horas — e está tudo bem. A ferramenta corre a cada 5 minutos e corrige em menos de 5 minutos. O impacto é negligenciável."

**"Precisamos de dar acesso ao nosso sistema?"**
> "Não. Só precisamos da API key do Worten. Nada mais. O vosso conector continua a funcionar exatamente como está."

**"Quanto custa?"**
> "O relatório não tem custo — só precisamos da API key para o correr. Se quiserem avançar depois de verem os resultados, o valor é €1.000 de setup e €50/mês. Só pagam se decidirem avançar."

**"Podem mostrar uma demo?"**
> "O que faço é melhor do que uma demo genérica — com a vossa API key corro o relatório com os vossos dados reais. É mais útil porque estão a ver o vosso catálogo, não um exemplo fictício."

---

## 6. The Close (2 min)

> "O próximo passo que proponho é o relatório. Precisas da API key do Worten — pode ser gerada no portal de vendedor do Worten, o vosso técnico saberá onde. Com isso consigo ter o relatório pronto rapidamente. Não tem qualquer custo — só avançamos para a implementação se os números fizerem sentido para vocês."

**API key received?** ☐ Yes ☐ No ☐ They'll send later

**Follow-up agreed?** _______________

---

## 7. Notes

_Space for anything unexpected._

_______________

_______________

---

## After the Call

- [ ] Send follow-up WhatsApp/email confirming what was agreed
- [ ] Update OUTREACH.md with outcome
- [ ] If API key received → run P11 proof-of-concept script
