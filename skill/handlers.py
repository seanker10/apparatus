"""Intent handlers — kept separate from the Telegram bot so the same
handlers can later be invoked from a CLI, Slack, etc.
"""

from __future__ import annotations

import json
import re

import extractor


URL_RE = re.compile(r"https?://\S+")


def handle_url(message_text: str) -> dict:
    match = URL_RE.search(message_text)
    if not match:
        raise ValueError("no URL found in message")
    return extractor.extract_from_url(match.group(0))


def handle_text(message_text: str) -> dict:
    return extractor.extract_from_text(message_text)


def handle_structured(message_text: str) -> dict:
    """User input like:
        add node: title=USDC, type=technology, domain=economic, ...
    or a JSON block.
    """
    stripped = message_text.strip()
    if stripped.startswith("{"):
        proposed_node = json.loads(stripped)
    else:
        body = re.sub(r"^add\s+node:?\s*", "", stripped, flags=re.IGNORECASE)
        proposed_node = {}
        for part in re.split(r",\s*", body):
            if "=" in part:
                k, v = part.split("=", 1)
                k = k.strip()
                v = v.strip()
                if v.lower() == "null":
                    v = None
                proposed_node[k] = v
    return extractor.validate_and_propose_edges(proposed_node)


def format_proposal_for_telegram(proposal: dict) -> str:
    n = proposal["node"]
    edges = proposal.get("edges", [])

    dims = (
        f"type: {n['type']} · domain: {n.get('domain')} · "
        f"function: {n.get('function')} · phase: {n.get('phase')}"
    )
    tags_line = "tags: " + ", ".join(n.get("tags", []))

    out = [
        f"📍 NODE: {n['title']}",
        f"   {dims}",
        f"   {n['desc']}",
        f"   {tags_line}",
        "",
        "🔗 EDGES:",
    ]
    if not edges:
        out.append("   (none proposed)")
    for e in edges:
        arrow = "→" if e["source"] == n["id"] else "←"
        other = e["target"] if arrow == "→" else e["source"]
        out.append(f"   {arrow} {e['type']} {other}: {e.get('note', '')}")
    return "\n".join(out)
