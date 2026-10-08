"""
Export every participant's event connections and follow-up recommendations to CSV.
Logic matches react-graph-viz/src/participantNetwork.js (UI).

Usage:
  python3 scripts/export_participant_connections.py [output.csv]
"""

import csv
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from neo4j import GraphDatabase

NEO4J_URI = "neo4j+s://398ffc2d.databases.neo4j.io"
NEO4J_USER = "398ffc2d"
NEO4J_PASSWORD = "pxYFawIJyzFYV_kd6IkXOc-qjNT5heD-WCGS-EgY6Jg"
NEO4J_DATABASE = "398ffc2d"

VIA_LABEL = {
    "scanned_their_card": "You tapped their card",
    "they_scanned_yours": "They tapped your card",
}

FIELDNAMES = [
    "participant_name",
    "participant_school",
    "participant_role",
    "participant_email",
    "section",
    "entry_type",
    "sort_rank",
    "other_name",
    "other_school",
    "other_role",
    "other_email",
    "other_website",
    "detail",
    "recommendation_score",
    "connected_at_ms",
]

EMPTY_ROW = {k: "" for k in FIELDNAMES}


def blank_participant_fields(row):
    row["participant_name"] = ""
    row["participant_school"] = ""
    row["participant_role"] = ""
    row["participant_email"] = ""
    return row


def via_label(via):
    return VIA_LABEL.get(via, "Connected at the event")


def build_suggestions(me, direct_peers, extended_peers):
    my_school = (me.get("school") or "").strip()
    my_role = (me.get("role") or "").strip()
    direct_names = {p["name"].lower() for p in direct_peers}

    suggestion_map = {}
    for row in extended_peers:
        key = row["name"].lower()
        if key in direct_names:
            continue
        entry = suggestion_map.get(key)
        if not entry:
            entry = {
                "name": row["name"],
                "school": row.get("school") or "",
                "role": row.get("role") or "",
                "email": row.get("email") or "",
                "website": row.get("website") or "",
                "via_people": set(),
                "score": 0,
            }
            suggestion_map[key] = entry
        if row.get("mutual_direct"):
            entry["via_people"].add(row["mutual_direct"])
        if my_school and row.get("school") == my_school:
            entry["score"] += 2
        if my_role and row.get("role") == my_role:
            entry["score"] += 1
        if row.get("school") and any(
            d.get("school") == row["school"] for d in direct_peers if d.get("school")
        ):
            entry["score"] += 1

    out = []
    for entry in suggestion_map.values():
        via_list = sorted(entry["via_people"])
        reasons = []
        if my_school and entry["school"] == my_school:
            reasons.append(f"Same school ({entry['school']})")
        if my_role and entry["role"] == my_role:
            reasons.append(f"Similar role ({entry['role']})")
        if via_list:
            if len(via_list) == 1:
                reasons.append(f"Knows {via_list[0]}")
            else:
                tail = f" +{len(via_list) - 2}" if len(via_list) > 2 else ""
                reasons.append(f"Knows {', '.join(via_list[:2])}{tail}")
        if not reasons:
            reasons.append("In your extended event network")
        out.append(
            {
                **entry,
                "via_people": via_list,
                "score": entry["score"] + len(via_list),
                "reasons": reasons,
            }
        )
    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:12]


def load_graph(session):
    users = {}
    for rec in session.run(
        """
        MATCH (u:User)
        RETURN u.name AS name, u.school AS school, u.role AS role,
               u.email AS email, u.website AS website
        ORDER BY toLower(u.name)
        """
    ):
        users[rec["name"]] = {
            "name": rec["name"],
            "school": rec["school"] or "",
            "role": rec["role"] or "",
            "email": rec["email"] or "",
            "website": rec["website"] or "",
        }

    incoming = defaultdict(list)
    outgoing = defaultdict(list)
    for rec in session.run(
        """
        MATCH (card:User)-[r:CONNECTED_TO]->(owner:User)
        RETURN card.name AS card, owner.name AS owner, r.createdAt AS at
        """
    ):
        card, owner, at = rec["card"], rec["owner"], rec["at"]
        incoming[owner].append((card, at))
        outgoing[card].append((owner, at))

    return users, incoming, outgoing


def is_connected(name_a, name_b, incoming, outgoing):
    for peer, _ in incoming.get(name_a, []):
        if peer == name_b:
            return True
    for peer, _ in outgoing.get(name_a, []):
        if peer == name_b:
            return True
    return False


def neighbors(name, incoming, outgoing):
    seen = set()
    for peer, _ in incoming.get(name, []):
        seen.add(peer)
    for peer, _ in outgoing.get(name, []):
        seen.add(peer)
    return seen


def direct_peers_for(me_name, users, incoming, outgoing):
    by_name = {}
    for card, at in incoming.get(me_name, []):
        if card not in users:
            continue
        by_name[card] = {
            **users[card],
            "connected_at": at,
            "via": "scanned_their_card",
        }
    for owner, at in outgoing.get(me_name, []):
        if owner in by_name or owner not in users:
            continue
        by_name[owner] = {
            **users[owner],
            "connected_at": at,
            "via": "they_scanned_yours",
        }
    peers = list(by_name.values())
    peers.sort(key=lambda p: p.get("connected_at") or 0, reverse=True)
    return peers


def extended_peers_for(me_name, direct_peers, users, incoming, outgoing):
    direct_names = {p["name"] for p in direct_peers}
    rows = []
    seen = set()
    for dname in direct_names:
        for ext in neighbors(dname, incoming, outgoing):
            if ext == me_name or ext in direct_names:
                continue
            if is_connected(me_name, ext, incoming, outgoing):
                continue
            key = (ext, dname)
            if key in seen:
                continue
            seen.add(key)
            if ext not in users:
                continue
            rows.append(
                {
                    **users[ext],
                    "mutual_direct": dname,
                }
            )
    return rows


def rows_for_participant(me_name, users, incoming, outgoing):
    """One block per participant: profile row, sections, entries (participant cols only on profile)."""
    me = users.get(me_name)
    if not me:
        return []

    direct = direct_peers_for(me_name, users, incoming, outgoing)
    extended = extended_peers_for(me_name, direct, users, incoming, outgoing)
    suggestions = build_suggestions(me, direct, extended)

    rows = []

    summary = (
        f"{len(direct)} connection(s) at the event · "
        f"{len(suggestions)} recommended reach-out(s)"
        if direct or suggestions
        else "No NFC connections recorded"
    )
    rows.append(
        {
            "participant_name": me["name"],
            "participant_school": me["school"],
            "participant_role": me["role"],
            "participant_email": me["email"],
            "section": "",
            "entry_type": "Participant profile",
            "sort_rank": "",
            "other_name": "",
            "other_school": "",
            "other_role": "",
            "other_email": "",
            "other_website": "",
            "detail": summary,
            "recommendation_score": "",
            "connected_at_ms": "",
        }
    )

    if direct:
        rows.append(
            blank_participant_fields(
                {
                    **EMPTY_ROW,
                    "section": "Connections made",
                    "entry_type": "Section header",
                }
            )
        )
        for rank, p in enumerate(direct, start=1):
            rows.append(
                blank_participant_fields(
                    {
                        **EMPTY_ROW,
                        "section": "",
                        "entry_type": "Met",
                        "sort_rank": rank,
                        "other_name": p["name"],
                        "other_school": p["school"],
                        "other_role": p["role"],
                        "other_email": p["email"],
                        "other_website": p["website"],
                        "detail": via_label(p["via"]),
                        "recommendation_score": "",
                        "connected_at_ms": int(p["connected_at"])
                        if p.get("connected_at")
                        else "",
                    }
                )
            )

    if suggestions:
        rows.append(
            blank_participant_fields(
                {
                    **EMPTY_ROW,
                    "section": "Recommended reach-outs",
                    "entry_type": "Section header",
                }
            )
        )
        for rank, s in enumerate(suggestions, start=1):
            rows.append(
                blank_participant_fields(
                    {
                        **EMPTY_ROW,
                        "section": "",
                        "entry_type": "Follow-up",
                        "sort_rank": rank,
                        "other_name": s["name"],
                        "other_school": s["school"],
                        "other_role": s["role"],
                        "other_email": s["email"],
                        "other_website": s["website"],
                        "detail": " · ".join(s["reasons"]),
                        "recommendation_score": s["score"],
                        "connected_at_ms": "",
                    }
                )
            )

    rows.append(dict(EMPTY_ROW))
    return rows


def main():
    default_out = (
        Path(__file__).resolve().parent.parent
        / "Excel"
        / f"participant_connections_and_recommendations_{datetime.now():%Y-%m-%d_%H%M}.csv"
    )
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    all_rows = []
    try:
        with driver.session(database=NEO4J_DATABASE) as session:
            users, incoming, outgoing = load_graph(session)
            for name in sorted(users.keys(), key=str.lower):
                all_rows.extend(rows_for_participant(name, users, incoming, outgoing))
    finally:
        driver.close()

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)

    met = sum(1 for r in all_rows if r["entry_type"] == "Met")
    follow = sum(1 for r in all_rows if r["entry_type"] == "Follow-up")
    participants = sum(1 for r in all_rows if r["entry_type"] == "Participant profile")
    print(f"Wrote {len(all_rows)} rows ({participants} participants)")
    print(f"  Met: {met}, Follow-up: {follow}")
    print(f"Output: {out_path}")


if __name__ == "__main__":
    main()
