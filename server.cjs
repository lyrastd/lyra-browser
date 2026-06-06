var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
var aiClient = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== "MY_GEMINI_API_KEY") {
      aiClient = new import_genai.GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }
  }
  return aiClient;
}
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
});
app.get("/api/proxy", async (req, res) => {
  const targetUrlStr = req.query.url;
  const adblockActive = req.query.adblock === "true";
  if (!targetUrlStr) {
    return res.status(400).send("<h3>Error: URL is required.</h3>");
  }
  let formattedUrl = targetUrlStr.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = "https://" + formattedUrl;
  }
  try {
    const parsedUrl = new URL(formattedUrl);
    const fetchResponse = await fetch(formattedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      redirect: "follow"
    });
    if (!fetchResponse.ok) {
      throw new Error(`Response status was ${fetchResponse.status}`);
    }
    let contentType = fetchResponse.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return res.redirect(formattedUrl);
    }
    let html = await fetchResponse.text();
    let adsBlockedCount = 0;
    const blockedAdsCollected = [];
    if (adblockActive) {
      const adDomainPatterns = [
        /adsbygoogle/gi,
        /doubleclick/gi,
        /googlesyndication/gi,
        /google-analytics/gi,
        /googletagmanager/gi,
        /adnxs/gi,
        /adserver/gi,
        /taboola/gi,
        /outbrain/gi,
        /carbonads/gi,
        /amazon-adsystem/gi,
        /popads/gi,
        /propellerads/gi,
        /adservice/gi,
        /quantserve/gi,
        /adshow/gi,
        /adroll/gi,
        /sponsored/gi,
        /yieldmanager/gi
      ];
      const scriptRegex = /<script[\s\S]*?src="([^"]*)"[\s\S]*?>([\s\S]*?)<\/script>/gi;
      html = html.replace(scriptRegex, (match, src, content) => {
        const matchesAd = adDomainPatterns.some((pattern) => pattern.test(src));
        if (matchesAd) {
          adsBlockedCount++;
          blockedAdsCollected.push({
            id: `blk_${Math.random().toString(36).slice(2, 7)}`,
            domain: new URL(src, formattedUrl).hostname,
            type: "script"
          });
          return "<!-- AdBlocker blocked external ad script -->";
        }
        return match;
      });
      const inlineScriptRegex = /<script[\s\S]*?>([\s\S]*?)<\/script>/gi;
      html = html.replace(inlineScriptRegex, (match, content) => {
        const adKeywords = [
          /\.adsbygoogle/gi,
          /googletag/gi,
          /amznads/gi,
          /window\.ads/gi,
          /Doubleclick/gi,
          /AdBlock/gi,
          /show_ads/gi,
          /ad_slot/gi
        ];
        const isAdCode = adKeywords.some((pattern) => pattern.test(content));
        if (isAdCode) {
          adsBlockedCount++;
          blockedAdsCollected.push({
            id: `blk_${Math.random().toString(36).slice(2, 7)}`,
            domain: parsedUrl.hostname,
            type: "tracker"
          });
          return "<!-- AdBlocker blocked inline ad tracker -->";
        }
        return match;
      });
      const iframeRegex = /<iframe[\s\S]*?src="([^"]*)"[\s\S]*?>([\s\S]*?)<\/iframe>/gi;
      html = html.replace(iframeRegex, (match, src, content) => {
        const isAdIframe = adDomainPatterns.some((p) => p.test(src)) || /ads|adserver|sponsored|banner/i.test(src);
        if (isAdIframe) {
          adsBlockedCount++;
          blockedAdsCollected.push({
            id: `blk_${Math.random().toString(36).slice(2, 7)}`,
            domain: src ? new URL(src, formattedUrl).hostname : "embedded-ad",
            type: "banner"
          });
          return "<div style='display:none !important;'>AdBlocker blocked ad frame</div>";
        }
        return match;
      });
      const customStyles = `
        <style id="adblock-pro-injected-styles">
          .ad, .ads, .adsbygoogle, .banner_ad, .ad-banner, .ad-container, .advertisement, 
          [class*="ad-"], [id*="ad_"], [class*="sponsored-"], [id*="sponsored-"], 
          .sponsored-post, .sponsored-link, .sidebar-ad, #ad_slot, [id*="google_ads"],
          a[href*="click.ad"], a[href*="doubleclick.net"], blockquote.sponsored {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
            height: 0 !important;
            width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            visibility: hidden !important;
          }
        </style>
      `;
      if (html.includes("<head>")) {
        html = html.replace("<head>", `<head>${customStyles}`);
      } else {
        html = customStyles + html;
      }
    }
    const baseTag = `<base href="${formattedUrl}">`;
    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${baseTag}`);
    } else {
      html = baseTag + html;
    }
    const clickInterceptionScript = `
      <script id="adblock-pro-click-interceptor">
        (function() {
          console.log("[DualBrowse Core] Click interceptor active.");
          
          // Override window.alert to be unobtrusive
          window.alert = function(msg) { console.log("[Iframe Alert]:", msg); };
          window.confirm = function(msg) { console.log("[Iframe Confirm]:", msg); return true; };
          window.prompt = function(msg) { console.log("[Iframe Prompt]:", msg); return ""; };

          document.addEventListener('click', function(e) {
            const anchor = e.target.closest('a');
            if (anchor) {
              const url = anchor.getAttribute('href');
              // If it's a valid link and starts with http, https or is relative
              if (url && !url.startsWith('javascript:') && !url.startsWith('#')) {
                e.preventDefault();
                try {
                  // Resolve Relative links using anchor's absolute properties
                  const absoluteUrl = anchor.href;
                  // Notify the parent container directly
                  if (window.parent && typeof window.parent.__handleBrowserNavigation === 'function') {
                    window.parent.__handleBrowserNavigation(window.name, absoluteUrl);
                  } else {
                    window.location.href = '/api/proxy?url=' + encodeURIComponent(absoluteUrl) + '&adblock=${adblockActive}';
                  }
                } catch (err) {
                  console.error("[DualBrowse Intercept Error]", err);
                }
              }
            }
          });

          // Intercept form submissions
          document.addEventListener('submit', function(e) {
            const form = e.target.closest('form');
            if (form) {
              e.preventDefault();
              try {
                const action = form.getAttribute('action') || '';
                const method = (form.getAttribute('method') || 'GET').toUpperCase();
                const absoluteAction = new URL(action, window.location.href).href;
                
                // Collect input fields
                const formData = new FormData(form);
                const params = new URLSearchParams();
                for (const pair of formData.entries()) {
                  params.append(pair[0], pair[1].toString());
                }

                let finalUrl = absoluteAction;
                if (method === 'GET') {
                  const separator = finalUrl.includes('?') ? '&' : '?';
                  finalUrl = finalUrl + separator + params.toString();
                  if (window.parent && typeof window.parent.__handleBrowserNavigation === 'function') {
                    window.parent.__handleBrowserNavigation(window.name, finalUrl);
                  } else {
                    window.location.href = '/api/proxy?url=' + encodeURIComponent(finalUrl) + '&adblock=${adblockActive}';
                  }
                } else {
                  console.warn("[DualBrowse] POST forms not fully serialized in sandbox proxy, redirecting via GET representation.");
                  const separator = finalUrl.includes('?') ? '&' : '?';
                  finalUrl = finalUrl + separator + params.toString();
                  if (window.parent && typeof window.parent.__handleBrowserNavigation === 'function') {
                    window.parent.__handleBrowserNavigation(window.name, finalUrl);
                  }
                }
              } catch (err) {
                console.error("[DualBrowse Form Intercept Error]", err);
              }
            }
          });
        })();
      </script>
    `;
    if (html.includes("</body>")) {
      html = html.replace("</body>", `${clickInterceptionScript}</body>`);
    } else {
      html = html + clickInterceptionScript;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Adblock-Count", adsBlockedCount.toString());
    res.setHeader("X-Adblock-List", JSON.stringify(blockedAdsCollected));
    res.send(html);
  } catch (error) {
    console.error(`[Proxy Error] failed loading ${formattedUrl}:`, error);
    res.status(500).send(`
      <div style="font-family: system-ui, sans-serif; padding: 2rem; background: #FFF5F5; border: 1px solid #FEB2B2; border-radius: 8px; max-width: 600px; margin: 2rem auto;">
        <h2 style="color: #9B2C2C; margin-top: 0;">Falha de Conex\xE3o no Proxy</h2>
        <p style="color: #2D3748; line-height: 1.5;">N\xE3o foi poss\xEDvel carregar o endere\xE7o solicitado: <strong>${formattedUrl}</strong></p>
        <p style="color: #4A5568; font-size: 0.9rem;"><strong>Motivo:</strong> ${error.message || error}</p>
        <div style="margin-top: 1.5rem; border-top: 1px solid #FED7D7; padding-top: 1rem;">
          <p style="font-size: 0.85rem; color: #718096; margin-bottom: 0.5rem;">Dica do DualBrowse Pro:</p>
          <ul style="font-size: 0.85rem; color: #4A5568; padding-left: 1.25rem; margin: 0;">
            <li>Verifique se o site permite solicita\xE7\xF5es ou se o dom\xEDnio digitado est\xE1 correto.</li>
            <li>Use o nosso <strong>Mecanismo de Busca embutido</strong> na barra lateral ou barra de favoritos para navegar em ambientes totalmente interativos e seguros.</li>
          </ul>
        </div>
      </div>
    `);
  }
});
app.post("/api/gemini/chat", async (req, res) => {
  const { prompt, conversationHistory } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided" });
  }
  const client = getGeminiClient();
  if (!client) {
    console.log("[Gemini] API Key missing. Returning sandbox responder.");
    return res.json({
      text: `Ol\xE1! Eu sou o assistente inteligente do **DualBrowse Pro** rodando no modo Sandbox local.

Sua chave da API do Gemini n\xE3o est\xE1 configurada no painel de segredos (Settings > Secrets). No entanto, estou pronto para ajudar voc\xEA! 

**O que voc\xEA gostaria de explorar hoje?**
- Ativar o Bloqueador de An\xFAncios na barra de ferramentas.
- Experimentar a navega\xE7\xE3o dividida ajustando a divis\xF3ria central.
- Visitar o site de demonstra\xE7\xE3o de an\xFAncios na barra lateral para ver o filtro em a\xE7\xE3o!`,
      sandboxActive: true
    });
  }
  try {
    const formattedContents = [];
    if (Array.isArray(conversationHistory)) {
      conversationHistory.forEach((msg) => {
        formattedContents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }]
        });
      });
    }
    formattedContents.push({
      role: "user",
      parts: [{ text: prompt }]
    });
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction: "Voc\xEA \xE9 o Copiloto de Intelig\xEAncia Artificial do DualBrowse Pro, um navegador avan\xE7ado. Responda de forma \xE1gil, emp\xE1tica e prestativa em Portugu\xEAs. Explique termos t\xE9cnicos da internet se o usu\xE1rio perguntar e forne\xE7a dicas ricas de navega\xE7\xE3o."
      }
    });
    res.json({
      text: response.text || "Sem resposta gerada pelo modelo.",
      sandboxActive: false
    });
  } catch (error) {
    console.error("[Gemini AI Error]", error);
    res.status(500).json({
      error: error.message || error,
      text: "Houve um erro ao processar sua pergunta com IA. Por favor, verifique se seu Segredo GEMINI_API_KEY do Google AI Studio est\xE1 devidamente configurado."
    });
  }
});
app.post("/api/gemini/summarize", async (req, res) => {
  const { url, title } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  const client = getGeminiClient();
  if (!client) {
    return res.json({
      summary: `### Resumo da P\xE1gina (Modo Manual)

**URL:** ${url}
**T\xEDtulo:** ${title || "Navega\xE7\xE3o Ativa"}

*Nota: Para um resumo inteligente com intelig\xEAncia artificial generativa profunda em tempo real, conecte sua chave de segredo \`GEMINI_API_KEY\` no menu superior do Google AI Studio.*

Este \xE9 o navegador DualBrowse Pro focado em alta velocidade e seguran\xE7a de rede com bloqueador de an\xFAncios profissional.`
    });
  }
  try {
    let pageText = `URL: ${url}
Title: ${title || ""}
`;
    try {
      const fetchResponse = await fetch(url, { signal: AbortSignal.timeout(4e3) });
      if (fetchResponse.ok) {
        const fullHtml = await fetchResponse.text();
        const bodyContentMatch = fullHtml.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
        let extractedText = bodyContentMatch ? bodyContentMatch[1] : fullHtml;
        extractedText = extractedText.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").substring(0, 3e3);
        pageText += extractedText;
      }
    } catch (e) {
      pageText += " (N\xE3o foi poss\xEDvel baixar os dados crus da p\xE1gina, fa\xE7a o resumo baseado unicamente na URL e no T\xEDtulo)";
    }
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Fa\xE7a um resumo executivo inteligente e anal\xEDtico em Portugu\xEAs da seguinte p\xE1gina que o usu\xE1rio est\xE1 lendo no navegador. Seja pr\xE1tico e direto, usando bullet points refinados.

CONTE\xDADO:
${pageText}`,
      config: {
        systemInstruction: "Voc\xEA \xE9 o Analista de P\xE1ginas Web do DualBrowse Pro. Escreva resumos ricos, f\xE1ceis de ler no formato Markdown."
      }
    });
    res.json({
      summary: response.text || "N\xE3o foi poss\xEDvel gerar o resumo."
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[DualBrowse] Server listening at http://localhost:${PORT}`);
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=server.cjs.map
