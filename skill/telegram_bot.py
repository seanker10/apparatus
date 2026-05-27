"""Telegram bot for The Apparatus.

Webhook mode for production. Use `dev.py` for local long-polling.

Flow:
  1. User sends URL / text / structured input
  2. Bot routes intent, calls extractor, replies with proposal + inline keyboard
  3. Approve  → github_writer commits + replies with vercel URL
  4. Edit     → conversational refinement loop
  5. Reject   → discard
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import github_writer
import handlers as intent_handlers

load_dotenv()

BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED_USER_ID = int(os.environ["TELEGRAM_ALLOWED_USER_ID"])
VERCEL_VIEW_URL = os.environ.get("VERCEL_VIEW_URL", "https://apparatus.vercel.app")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("apparatus.bot")

# In-memory proposal store. Lost on restart; acceptable for single-user bot.
PENDING: dict[str, dict] = {}
# Per-chat edit state: chat_id -> proposal_id currently being refined
EDITING: dict[int, str] = {}


def _allowed(update: Update) -> bool:
    user = update.effective_user
    if user is None or user.id != ALLOWED_USER_ID:
        log.warning("rejecting message from user_id=%s", user.id if user else None)
        return False
    return True


def _proposal_keyboard(proposal_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Approve", callback_data=f"approve:{proposal_id}"),
        InlineKeyboardButton("✏️ Edit", callback_data=f"edit:{proposal_id}"),
        InlineKeyboardButton("❌ Reject", callback_data=f"reject:{proposal_id}"),
    ]])


def _route_intent(text: str) -> str:
    stripped = text.strip()
    lower = stripped.lower()
    if stripped.startswith("http"):
        return "url"
    if lower.startswith("add edge"):
        return "edge"
    if lower.startswith("add node") or len(stripped) > 80:
        return "structured" if lower.startswith("add node") else "text"
    return "text"


async def cmd_start(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    await update.message.reply_text(
        "The Apparatus bot is live. Send a URL, a paragraph, or `add node: ...` to propose an addition."
    )


async def cmd_status(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    try:
        s = github_writer.stats()
        by_type = "\n".join(f"  {k}: {v}" for k, v in s["by_type"].items() if v)
        await update.message.reply_text(
            f"Nodes: {s['nodes']}\nEdges: {s['edges']}\nBy type:\n{by_type}"
        )
    except Exception as exc:
        log.exception("status failed")
        await update.message.reply_text(f"× status failed: {exc}")


async def cmd_recent(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    try:
        recent = github_writer.recent_nodes(5)
        lines = [f"• {r['title']} ({r['id']}) — {r.get('added','')[:10]}" for r in recent]
        await update.message.reply_text("Last 5 nodes added:\n" + "\n".join(lines))
    except Exception as exc:
        log.exception("recent failed")
        await update.message.reply_text(f"× recent failed: {exc}")


async def cmd_cancel(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    chat_id = update.effective_chat.id
    pid = EDITING.pop(chat_id, None)
    if pid:
        PENDING.pop(pid, None)
        await update.message.reply_text("× Edit session cancelled and proposal discarded.")
    else:
        await update.message.reply_text("Nothing to cancel.")


async def on_message(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return

    text = update.message.text or ""
    chat_id = update.effective_chat.id

    # In edit mode? Use the message as a refinement instruction.
    if chat_id in EDITING:
        pid = EDITING[chat_id]
        prior = PENDING.get(pid)
        if prior is None:
            EDITING.pop(chat_id, None)
            await update.message.reply_text("× Edit session expired.")
            return
        if text.strip().lower() == "done":
            EDITING.pop(chat_id, None)
            await _commit_proposal(update, pid)
            return
        if text.strip().lower() == "cancel":
            EDITING.pop(chat_id, None)
            PENDING.pop(pid, None)
            await update.message.reply_text("× Discarded.")
            return
        try:
            import extractor
            new_proposal = extractor.refine_proposal(prior, text)
            PENDING[pid] = new_proposal
            body = intent_handlers.format_proposal_for_telegram(new_proposal)
            await update.message.reply_text(
                body + "\n\nReply with another correction, `done` to commit, or `cancel` to discard.",
                reply_markup=_proposal_keyboard(pid),
            )
        except Exception as exc:
            log.exception("refine failed")
            await update.message.reply_text(f"× refine failed: {exc}")
        return

    intent = _route_intent(text)
    log.info("intent=%s len=%d", intent, len(text))
    try:
        if intent == "url":
            proposal = intent_handlers.handle_url(text)
        elif intent == "structured":
            proposal = intent_handlers.handle_structured(text)
        elif intent == "edge":
            await update.message.reply_text("Direct edge-only adds aren't wired yet — send the node first.")
            return
        else:
            proposal = intent_handlers.handle_text(text)
    except Exception as exc:
        log.exception("proposal generation failed")
        await update.message.reply_text(f"× proposal failed: {exc}")
        return

    pid = str(uuid.uuid4())[:8]
    PENDING[pid] = proposal

    # Duplicate check
    similar = github_writer.find_similar_nodes(proposal["node"]["title"])
    warning = ""
    if similar and similar[0]["similarity"] >= 0.8:
        warning = "\n\n⚠️ Similar node already exists: " + ", ".join(
            f"{s['title']} ({s['id']})" for s in similar[:3]
        )

    body = intent_handlers.format_proposal_for_telegram(proposal)
    await update.message.reply_text(
        body + warning,
        reply_markup=_proposal_keyboard(pid),
    )


async def on_callback(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update):
        return
    query = update.callback_query
    await query.answer()
    action, _, pid = query.data.partition(":")

    if action == "approve":
        await _commit_proposal(update, pid)
    elif action == "edit":
        if pid not in PENDING:
            await query.edit_message_text("× proposal expired.")
            return
        EDITING[update.effective_chat.id] = pid
        await query.message.reply_text(
            "Edit mode. Send a correction (e.g. 'change function to coercion'). "
            "Reply `done` when satisfied, or `cancel` to discard."
        )
    elif action == "reject":
        PENDING.pop(pid, None)
        await query.edit_message_text("× Discarded.")


async def _commit_proposal(update: Update, pid: str) -> None:
    proposal = PENDING.pop(pid, None)
    if proposal is None:
        await update.effective_message.reply_text("× proposal expired.")
        return
    try:
        sha = github_writer.add_node_with_edges(proposal["node"], proposal.get("edges", []))
        title = proposal["node"]["title"]
        await update.effective_message.reply_text(
            f"✓ Added: {title}\nCommit: {sha[:7]}\nView: {VERCEL_VIEW_URL}"
        )
    except Exception as exc:
        log.exception("commit failed")
        # Put it back so user can edit
        PENDING[pid] = proposal
        await update.effective_message.reply_text(
            f"× commit failed: {exc}\nProposal retained — tap Edit to fix, or send `cancel`."
        )


def build_application() -> Application:
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("recent", cmd_recent))
    app.add_handler(CommandHandler("cancel", cmd_cancel))
    app.add_handler(CallbackQueryHandler(on_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_message))
    return app


# === Webhook (production) ===
app = FastAPI()
_application = build_application()


@app.on_event("startup")
async def _startup() -> None:
    await _application.initialize()
    await _application.start()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await _application.stop()
    await _application.shutdown()


@app.post("/webhook")
async def webhook(request: Request) -> dict[str, Any]:
    data = await request.json()
    update = Update.de_json(data, _application.bot)
    await _application.process_update(update)
    return {"ok": True}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
