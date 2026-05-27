"""GitHub writer for The Apparatus.

All graph mutations go through this module. We read fresh from GitHub on
every operation (last-write-wins; single user means no concurrency issue),
validate, then write back via a single multi-file commit.
"""

from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any

import httpx
from dotenv import load_dotenv
from github import Github, GithubException, InputGitTreeElement

load_dotenv()

GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]
GITHUB_REPO = os.environ.get("GITHUB_REPO", "seanker10/apparatus")
GITHUB_BRANCH = os.environ.get("GITHUB_BRANCH", "main")
VERCEL_DEPLOY_HOOK_URL = os.environ.get("VERCEL_DEPLOY_HOOK_URL", "").strip()

NODES_PATH = "data/nodes.json"
EDGES_PATH = "data/edges.json"

REQUIRED_NODE_FIELDS = {"id", "title", "type", "desc", "tags"}
VALID_TYPES = {"technology", "system", "policy", "action", "event", "concept", "figure"}
VALID_DOMAINS = {
    "identity", "movement", "economic", "synthesis", "narrative", "infrastructure",
    "information", "legal", "electoral", "civic", "coercive", "international",
}
VALID_FUNCTIONS = {"capability", "legitimation", "normalization", "mobilization", "coercion", "resistance"}
VALID_PHASES = {"precondition", "capture", "consolidation", "operation"}
VALID_EDGE_TYPES = {
    "enables", "requires", "accelerates", "legitimizes",
    "precedent", "obscures", "counters", "contradicts",
}

_gh = Github(GITHUB_TOKEN)
_repo = _gh.get_repo(GITHUB_REPO)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get_file(path: str) -> tuple[Any, str]:
    """Return (contents_obj, decoded_text)."""
    f = _repo.get_contents(path, ref=GITHUB_BRANCH)
    return f, base64.b64decode(f.content).decode("utf-8")


def load_nodes() -> list[dict]:
    _, text = _get_file(NODES_PATH)
    return json.loads(text)


def load_edges() -> list[dict]:
    _, text = _get_file(EDGES_PATH)
    return json.loads(text)


def node_exists(node_id: str) -> bool:
    return any(n["id"] == node_id for n in load_nodes())


def find_similar_nodes(title: str, threshold: float = 0.7) -> list[dict]:
    """Return existing nodes whose title is similar to the proposed title."""
    title_lower = title.lower().strip()
    out = []
    for n in load_nodes():
        ratio = SequenceMatcher(None, title_lower, n["title"].lower().strip()).ratio()
        if ratio >= threshold:
            out.append({"id": n["id"], "title": n["title"], "similarity": round(ratio, 2)})
    return sorted(out, key=lambda x: x["similarity"], reverse=True)


def validate_node(node: dict, existing_ids: set[str]) -> None:
    missing = REQUIRED_NODE_FIELDS - node.keys()
    if missing:
        raise ValueError(f"node missing required fields: {missing}")
    if node["type"] not in VALID_TYPES:
        raise ValueError(f"invalid type: {node['type']}")
    if node.get("domain") is not None and node["domain"] not in VALID_DOMAINS:
        raise ValueError(f"invalid domain: {node['domain']}")
    if node.get("function") is not None and node["function"] not in VALID_FUNCTIONS:
        raise ValueError(f"invalid function: {node['function']}")
    if node.get("phase") is not None and node["phase"] not in VALID_PHASES:
        raise ValueError(f"invalid phase: {node['phase']}")
    if len(node["desc"]) > 400:
        raise ValueError(f"desc is {len(node['desc'])} chars; limit is 400")
    if node["id"] in existing_ids:
        raise ValueError(f"node id already exists: {node['id']}")


def validate_edge(edge: dict, node_ids: set[str]) -> None:
    for field in ("source", "target", "type"):
        if field not in edge:
            raise ValueError(f"edge missing field: {field}")
    if edge["type"] not in VALID_EDGE_TYPES:
        raise ValueError(f"invalid edge type: {edge['type']}")
    if edge["source"] not in node_ids:
        raise ValueError(f"edge source not found: {edge['source']}")
    if edge["target"] not in node_ids:
        raise ValueError(f"edge target not found: {edge['target']}")


def _commit_multifile(files: dict[str, str], message: str) -> str:
    """Single commit touching multiple files via the git data API."""
    ref = _repo.get_git_ref(f"heads/{GITHUB_BRANCH}")
    base_commit = _repo.get_git_commit(ref.object.sha)
    base_tree = base_commit.tree

    tree_elements = [
        InputGitTreeElement(path=path, mode="100644", type="blob", content=content)
        for path, content in files.items()
    ]
    new_tree = _repo.create_git_tree(tree_elements, base_tree)
    new_commit = _repo.create_git_commit(message, new_tree, [base_commit])
    ref.edit(new_commit.sha)
    _ping_vercel()
    return new_commit.sha


def _ping_vercel() -> None:
    if not VERCEL_DEPLOY_HOOK_URL:
        return
    try:
        httpx.post(VERCEL_DEPLOY_HOOK_URL, timeout=10)
    except Exception:
        # Deploy hook is best-effort; data is already committed.
        pass


def add_node(node: dict) -> str:
    nodes = load_nodes()
    existing_ids = {n["id"] for n in nodes}
    validate_node(node, existing_ids)

    now = _now_iso()
    node = {**node, "added": now, "updated": now}
    if "sources" not in node:
        node["sources"] = []
    if "date" not in node:
        node["date"] = None

    nodes.append(node)
    files = {NODES_PATH: json.dumps(nodes, indent=2, ensure_ascii=False) + "\n"}
    msg = f"add node: {node['title']} ({node['type']} / {node.get('domain')} / {node.get('function')} / {node.get('phase')})"
    return _commit_multifile(files, msg)


def add_edges(edges: list[dict]) -> str:
    if not edges:
        raise ValueError("no edges to add")
    existing_edges = load_edges()
    node_ids = {n["id"] for n in load_nodes()}
    now = _now_iso()
    new_edges = []
    for e in edges:
        validate_edge(e, node_ids)
        new_edges.append({**e, "added": now})
    all_edges = existing_edges + new_edges
    files = {EDGES_PATH: json.dumps(all_edges, indent=2, ensure_ascii=False) + "\n"}
    titles = ", ".join(f"{e['source']}→{e['target']}" for e in new_edges)
    msg = f"add edges: {titles}"
    return _commit_multifile(files, msg)


def add_node_with_edges(node: dict, edges: list[dict]) -> str:
    """Atomic: one commit adds the node and its edges together."""
    nodes = load_nodes()
    existing_edges = load_edges()
    existing_ids = {n["id"] for n in nodes}
    validate_node(node, existing_ids)

    now = _now_iso()
    node = {**node, "added": now, "updated": now}
    if "sources" not in node:
        node["sources"] = []
    if "date" not in node:
        node["date"] = None
    nodes.append(node)

    new_ids = existing_ids | {node["id"]}
    new_edges = []
    for e in edges:
        validate_edge(e, new_ids)
        new_edges.append({**e, "added": now})
    all_edges = existing_edges + new_edges

    files = {
        NODES_PATH: json.dumps(nodes, indent=2, ensure_ascii=False) + "\n",
        EDGES_PATH: json.dumps(all_edges, indent=2, ensure_ascii=False) + "\n",
    }
    msg = f"add: {node['title']} (+{len(new_edges)} edges)"
    return _commit_multifile(files, msg)


def update_node(node_id: str, updates: dict) -> str:
    nodes = load_nodes()
    found = None
    for n in nodes:
        if n["id"] == node_id:
            found = n
            break
    if not found:
        raise ValueError(f"node not found: {node_id}")
    # Cannot rename id via update — ids are immutable.
    updates.pop("id", None)
    updates.pop("added", None)
    found.update(updates)
    found["updated"] = _now_iso()
    files = {NODES_PATH: json.dumps(nodes, indent=2, ensure_ascii=False) + "\n"}
    msg = f"update node: {node_id} ({', '.join(updates.keys())})"
    return _commit_multifile(files, msg)


def stats() -> dict:
    nodes = load_nodes()
    edges = load_edges()
    return {
        "nodes": len(nodes),
        "edges": len(edges),
        "by_type": {t: sum(1 for n in nodes if n["type"] == t) for t in VALID_TYPES},
    }


def recent_nodes(n: int = 5) -> list[dict]:
    nodes = load_nodes()
    nodes.sort(key=lambda x: x.get("added", ""), reverse=True)
    return [{"id": x["id"], "title": x["title"], "added": x.get("added")} for x in nodes[:n]]
