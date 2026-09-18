"""
Import event guests into Neo4j.

CSV columns expected (header names can vary):
  name (required), email, phone_number,
  "What company do you work for?" or company/role,
  "What is your LinkedIn profile?" or website/linkedin

Usage:
  python3 scripts/import_guests.py path/to/guests.csv
"""

import csv
import sys
import time
from neo4j import GraphDatabase

NEO4J_URI      = "neo4j+s://c6db593c.databases.neo4j.io"
NEO4J_USER     = "c6db593c"
NEO4J_PASSWORD = "VynT7VQHzGDIrq4rToYsndHyu22qXkpfAsXQ81tPw8c"
NEO4J_DATABASE = "c6db593c"


def first(row, *keys):
    for key in keys:
        value = (row.get(key) or "").strip()
        if value:
            return value
    return ""


def load_guests(path):
    guests = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = first(row, "name")
            if not name:
                continue
            guests.append({
                "name":      name,
                "role":      first(row, "What company do you work for?", "company", "role"),
                "location":  first(row, "location"),
                "website":   first(row, "What is your LinkedIn profile?", "linkedin", "website"),
                "email":     first(row, "email"),
                "phone":     first(row, "phone_number", "phone"),
                "guestId":   first(row, "guest_id"),
                "createdAt": int(time.time() * 1000),
            })
    return guests

MERGE_QUERY = """
UNWIND $guests AS g
MERGE (u:User {name: g.name})
ON CREATE SET
    u.role      = g.role,
    u.location  = g.location,
    u.website   = g.website,
    u.email     = g.email,
    u.phone     = g.phone,
    u.guestId   = g.guestId,
    u.createdAt = g.createdAt
ON MATCH SET
    u.role      = CASE WHEN u.role IS NULL OR u.role = '' THEN g.role ELSE u.role END,
    u.website   = CASE WHEN u.website IS NULL OR u.website = '' THEN g.website ELSE u.website END,
    u.email     = CASE WHEN u.email IS NULL OR u.email = '' THEN g.email ELSE u.email END,
    u.phone     = CASE WHEN u.phone IS NULL OR u.phone = '' THEN g.phone ELSE u.phone END,
    u.guestId   = CASE WHEN u.guestId IS NULL OR u.guestId = '' THEN g.guestId ELSE u.guestId END
RETURN count(u) AS total
"""


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/import_guests.py path/to/guests.csv", file=sys.stderr)
        sys.exit(1)

    guests = load_guests(sys.argv[1])
    print(f"Loaded {len(guests)} guests from CSV.")

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    try:
        with driver.session(database=NEO4J_DATABASE) as session:
            result = session.run(MERGE_QUERY, guests=guests)
            record = result.single()
            print(f"Done. {record['total']} nodes merged into Neo4j.")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        driver.close()


if __name__ == "__main__":
    main()
