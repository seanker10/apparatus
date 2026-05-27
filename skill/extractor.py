"""Anthropic-powered extractor for The Apparatus.

Reads SKILL.md as the system prompt, injects a compact view of existing
nodes for edge proposal, and returns a {node, edges} dict parsed from
the model's JSON output.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from anthropic import Anthropic
from dotenv import load_dotenv

from github_writer import load_edges, load_nodes

load_dotenv()

client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-7")

JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def load_skill_md() -> str:
    path = os.path.join(os.path.dirname(__file__), "SKILL.md")
    with open(path) as f:
        return f.read()


def format_existing_nodes_compact(nodes: list[dict]) -> str:
    lines = []
    for n in nodes:
        dims = f"{n['type']}/{n.get('domain')}/{n.get('function')}/{n.get('phase')}"
        lines.append(f"- {n['id']}: {n['title']} ({dims})")
    return "\n".join(lines)


def _build_system_prompt(existing_nodes: list[dict]) -> str:
    return (
        load_skill_md()
        + "\n\n## EXISTING NODES (for edge proposals)\n"
        + format_existing_nodes_compact(existing_nodes)
        + "\n\nWhen proposing edges, only reference node IDs from the list above. "
        + 'Output ONLY a fenced JSON block with this exact structure: '
        + '```json\n{"node": {...}, "edges": [{...}, ...]}\n```'
        + "\nDo not add prose around the JSON. The bot will render the proposal for the user."
    )


def parse_proposal_json(response: Any) -> dict:
    """Pull the {node, edges} block out of Claude's response."""
    text_parts = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(block.text)
    full_text = "\n".join(text_parts).strip()

    match = JSON_FENCE_RE.search(full_text)
    if match:
        payload = match.group(1)
    elif full_text.startswith("{"):
        payload = full_text
    else:
        raise ValueError(f"could not find JSON in model output:\n{full_text}")

    data = json.loads(payload)
    if "node" not in data or "edges" not in data:
        raise ValueError(f"missing node/edges in parsed payload: {data}")
    return data


def extract_from_url(url: str) -> dict:
    existing_nodes = load_nodes()
    system = _build_system_prompt(existing_nodes)

    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system,
        messages=[{
            "role": "user",
            "content": f"Read this article and propose a node + edges to existing nodes: {url}",
        }],
        tools=[{"type": "web_fetch_20250910", "name": "web_fetch"}],
    )
    return parse_proposal_json(response)


def extract_from_text(text: str) -> dict:
    existing_nodes = load_nodes()
    system = _build_system_prompt(existing_nodes)

    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system,
        messages=[{
            "role": "user",
            "content": f"Propose a node + edges to existing nodes from this text:\n\n{text}",
        }],
    )
    return parse_proposal_json(response)


def refine_proposal(previous_proposal: dict, correction: str) -> dict:
    """User asked for an edit. Re-prompt with the prior proposal and correction."""
    existing_nodes = load_nodes()
    system = _build_system_prompt(existing_nodes)

    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system,
        messages=[
            {
                "role": "user",
                "content": "Here is the previous proposal:\n```json\n"
                + json.dumps(previous_proposal, indent=2)
                + f"\n```\n\nApply this correction and re-output the JSON:\n{correction}",
            }
        ],
    )
    return parse_proposal_json(response)


def validate_and_propose_edges(
    proposed_node: dict,
    existing_nodes: list[dict] | None = None,
    existing_edges: list[dict] | None = None,
) -> dict:
    """For structured input where the user supplied the node directly.

    Asks the model to propose edges only.
    """
    if existing_nodes is None:
        existing_nodes = load_nodes()
    if existing_edges is None:
        existing_edges = load_edges()
    system = _build_system_prompt(existing_nodes)

    response = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        system=system,
        messages=[{
            "role": "user",
            "content": "Here is a user-supplied node. Validate the dimensions and propose 2-4 edges to existing nodes.\n\n"
            + "```json\n" + json.dumps(proposed_node, indent=2) + "\n```",
        }],
    )
    return parse_proposal_json(response)
