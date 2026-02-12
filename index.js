import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";

const app = express();

// ====== ENV ======
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!SLACK_BOT_TOKEN) console.warn("Missing env SLACK_BOT_TOKEN");
if (!SLACK_SIGNING_SECRET) console.warn("Missing env SLACK_SIGNING_SECRET");

// ====== JSON endpoints (your existing ones) ======
app.use(
    bodyParser.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf.toString("utf8");
        },
    })
);

// ====== Helpers ======
function verifySlackSignatureRaw(rawBody, headers) {
    const ts = headers["x-slack-request-timestamp"];
    const sig = headers["x-slack-signature"];
    if (!ts || !sig) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 60 * 5) return false;

    const base = `v0:${ts}:${rawBody}`;
    const hmac = crypto.createHmac("sha256", SLACK_SIGNING_SECRET).update(base).digest("hex");
    const expected = `v0=${hmac}`;

    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

async function slackApi(method, payload) {
    const resp = await fetch(`https://slack.com/api/${method}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (!json.ok) {
        const err = new Error(`Slack API error: ${method} => ${json.error || "unknown_error"}`);
        err.slack = json;
        throw err;
    }
    return json;
}

// ====== In-memory Projects (MVP) ======
let projectSeq = 1;
const projectsById = new Map(); // projectId -> { id, name, description, createdBy, createdAt }
function nextProjectId() {
    const id = `PRJ-${String(projectSeq).padStart(3, "0")}`;
    projectSeq += 1;
    return id;
}

// ====== Routes ======
app.get("/health", (_req, res) => res.status(200).send("ok"));

/**
 * Slash commands are x-www-form-urlencoded.
 * We need RAW body for signature verification, so we use bodyParser.raw().
 */
app.post(
    "/slack/commands",
    bodyParser.raw({ type: "application/x-www-form-urlencoded" }),
    async (req, res) => {
        const rawBody = req.body.toString("utf8");

        if (!verifySlackSignatureRaw(rawBody, req.headers)) {
            return res.status(401).send("invalid signature");
        }

        // Parse form body
        const params = new URLSearchParams(rawBody);
        const command = params.get("command");
        const trigger_id = params.get("trigger_id");
        const user_id = params.get("user_id");

        if (command !== "/create-project") {
            return res.status(200).send("ok");
        }

        // Must respond within ~3s to Slack
        res.status(200).send("");

        // Open modal
        await slackApi("views.open", {
            trigger_id,
            view: {
                type: "modal",
                callback_id: "create_project_modal",
                title: { type: "plain_text", text: "Create project" },
                submit: { type: "plain_text", text: "Create" },
                close: { type: "plain_text", text: "Cancel" },
                private_metadata: JSON.stringify({ user_id }),
                blocks: [
                    {
                        type: "input",
                        block_id: "name_block",
                        label: { type: "plain_text", text: "Project name" },
                        element: {
                            type: "plain_text_input",
                            action_id: "name",
                            placeholder: { type: "plain_text", text: "e.g., Huracán Stats MVP" },
                        },
                    },
                    {
                        type: "input",
                        block_id: "desc_block",
                        optional: true,
                        label: { type: "plain_text", text: "Description" },
                        element: {
                            type: "plain_text_input",
                            action_id: "description",
                            multiline: true,
                            placeholder: { type: "plain_text", text: "What is this project about?" },
                        },
                    },
                ],
            },
        }).catch((e) => console.error("views.open failed:", e?.message, e?.slack || e));
    }
);

/**
 * Interactions endpoint (modal submissions, buttons, etc.)
 */
app.post(
    "/slack/interactions",
    bodyParser.raw({ type: "application/x-www-form-urlencoded" }),
    async (req, res) => {
        const rawBody = req.body.toString("utf8");

        if (!verifySlackSignatureRaw(rawBody, req.headers)) {
            return res.status(401).send("invalid signature");
        }

        const params = new URLSearchParams(rawBody);
        const payloadStr = params.get("payload");
        if (!payloadStr) return res.status(200).send("ok");

        const payload = JSON.parse(payloadStr);

        // Only handle our modal
        if (payload.type === "view_submission" && payload.view?.callback_id === "create_project_modal") {
            const userId = payload.user?.id;

            const name =
                payload.view.state.values?.name_block?.name?.value?.trim() ?? "";
            const description =
                payload.view.state.values?.desc_block?.description?.value?.trim() ?? "";

            if (!name) {
                // Field-level error in modal
                return res.json({
                    response_action: "errors",
                    errors: { name_block: "Project name is required." },
                });
            }

            const projectId = nextProjectId();
            projectsById.set(projectId, {
                id: projectId,
                name,
                description,
                createdBy: userId,
                createdAt: new Date().toISOString(),
            });

            // ACK modal submission
            res.json({ response_action: "clear" });

            // Post confirmation to the channel where command was run
            const channelId = payload.view?.private_metadata
                ? null
                : null; // (not available here by default)

            // Slack does provide the channel in payload.view.root_view_id? Not reliably.
            // Easiest: post as DM to the user + also log to a known channel.
            const text = [
                `📁 *Project created*`,
                `*${projectId}* — ${name}`,
                description ? `_${description}_` : "",
                `Created by <@${userId}>`,
            ].filter(Boolean).join("\n");

            // DM user
            try {
                const im = await slackApi("conversations.open", { users: userId });
                await slackApi("chat.postMessage", { channel: im.channel.id, text });
            } catch (e) {
                console.error("DM failed:", e?.message, e?.slack || e);
            }

            // Also announce to a fixed channel if you want (recommended)
            const PROJECTS_CHANNEL = process.env.SLACK_PROJECTS_CHANNEL || "#mvp-log";
            await slackApi("chat.postMessage", { channel: PROJECTS_CHANNEL, text }).catch((e) =>
                console.error("announce failed:", e?.message, e?.slack || e)
            );

            return;
        }

        return res.status(200).send("ok");
    }
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on :${port}`));
