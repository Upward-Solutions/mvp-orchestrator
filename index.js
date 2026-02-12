import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";

const app = express();

// Necesitamos el raw body para validar firma
app.use(bodyParser.json({
    verify: (req, res, buf) => { req.rawBody = buf.toString("utf8"); }
}));

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// Verifica firma Slack
function verifySlackSignature(req) {
    const ts = req.headers["x-slack-request-timestamp"];
    const sig = req.headers["x-slack-signature"];
    if (!ts || !sig) return false;

    // evita replay attacks (5 min)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 60 * 5) return false;

    const base = `v0:${ts}:${req.rawBody}`;
    const hmac = crypto.createHmac("sha256", SLACK_SIGNING_SECRET).update(base).digest("hex");
    const expected = `v0=${hmac}`;

    // timing-safe compare
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

app.get("/health", (req, res) => res.status(200).send("ok"));

app.post("/slack/events", (req, res) => {
    // 1) challenge (verificación inicial)
    if (req.body?.type === "url_verification") {
        return res.json({ challenge: req.body.challenge });
    }

    // 2) firma
    if (!verifySlackSignature(req)) {
        return res.status(401).send("invalid signature");
    }

    // 3) ack rápido (Slack necesita 200 rápido)
    res.status(200).send("ok");

    const event = req.body?.event;
    if (!event) return;

    // --- FLUJO: APPROVE / REJECT ---
    // (A) Reacciones
    if (event.type === "reaction_added") {
        const reaction = event.reaction; // "white_check_mark" o "x"
        const itemTs = event.item?.ts;   // timestamp del mensaje aprobado
        const channel = event.item?.channel;

        // TODO: filtrar solo canal #mvp-approvals (por id)
        // TODO: mapear itemTs -> feature_id (lo guardamos cuando publicamos el approval_request)
        if (reaction === "white_check_mark") {
            console.log("APPROVE", { channel, itemTs });
        }
        if (reaction === "x") {
            console.log("REJECT", { channel, itemTs });
        }
    }

    // (B) Mensajes (si querés comando textual)
    if (event.type === "message" && !event.subtype) {
        const text = (event.text || "").trim();
        // Ej: "APPROVE MVP-012"
        const m = text.match(/^(APPROVE|REJECT)\s+(MVP-\d+)\b/i);
        if (m) {
            const action = m[1].toUpperCase();
            const featureId = m[2].toUpperCase();
            console.log(action, featureId);
        }
    }
});

app.listen(3000, () => console.log("Listening on :3000"));
