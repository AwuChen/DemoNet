"""
Import event guests into Neo4j.

CSV columns expected (header names can vary):
  name (required), email, phone_number,
  "What company do you work for?" or company/role,
  "What is your LinkedIn profile?" or website/linkedin

USC Startup Mixer sheet:
  name, first_name, last_name, email, addition info, school, role

Usage:
  python3 scripts/import_guests.py path/to/guests.csv
"""

import csv
import re
import sys
import time
from neo4j import GraphDatabase

LINKEDIN_RE = re.compile(
    r"(https?://(?:www\.)?linkedin\.com/[^\s\"'\]|]+|(?:www\.)?linkedin\.com/in/[^\s\"'\]|]+)",
    re.IGNORECASE,
)
URL_RE = re.compile(
    r"(https?://[^\s\"'\]|]+|(?:www\.)?[a-z0-9][-a-z0-9.]+\.[a-z]{2,}(?:/[^\s\"'\]|]*)?)",
    re.IGNORECASE,
)

NEO4J_URI      = "neo4j+s://398ffc2d.databases.neo4j.io"
NEO4J_USER     = "398ffc2d"
NEO4J_PASSWORD = "pxYFawIJyzFYV_kd6IkXOc-qjNT5heD-WCGS-EgY6Jg"
NEO4J_DATABASE = "398ffc2d"


def normalize_row(row):
    """Strip BOM from Excel-exported headers."""
    return {(k or "").lstrip("\ufeff").strip(): v for k, v in row.items()}


def first(row, *keys):
    for key in keys:
        value = (row.get(key) or "").strip()
        if value:
            return value
    return ""


def normalize_url(raw):
    if not raw:
        return ""
    url = raw.strip().rstrip(".,)")
    if not url.lower().startswith("http"):
        url = "https://" + url.lstrip("/")
    return url


def extract_urls_from_text(text):
    if not text:
        return []
    flat = text.replace("\n", " ")
    found = []
    seen = set()
    for match in URL_RE.finditer(flat):
        url = normalize_url(match.group(1))
        if not url:
            continue
        key = url.lower()
        if key in seen:
            continue
        seen.add(key)
        found.append(url)
    return found


def pick_linkedin(urls):
    for url in urls:
        if "linkedin.com" in url.lower():
            return url
    for url in urls:
        if "linkedin.com" in url.lower().replace("http://", "").replace("https://", ""):
            return url
    return ""


def build_name(row):
    name = first(row, "name")
    if name:
        return name
    first_name = first(row, "first_name")
    last_name = first(row, "last_name")
    if first_name and last_name:
        return f"{first_name} {last_name}"
    return first_name or last_name


def build_role(row):
    company = first(row, "What company do you work for?", "company")
    if company:
        return company
    return first(row, "role")


def load_guests(path):
    guests = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            row = normalize_row(raw)
            name = build_name(row)
            if not name:
                continue
            extra = first(row, "addition info")
            urls = extract_urls_from_text(extra)
            linkedin = pick_linkedin(urls) or normalize_url(
                first(row, "What is your LinkedIn profile?", "linkedin", "website")
            )
            if linkedin and linkedin not in urls:
                urls.insert(0, linkedin)
            extra_links = [u for u in urls if u.lower() != (linkedin or "").lower()]
            guests.append({
                "name":      name,
                "school":    first(row, "school"),
                "role":      build_role(row),
                "website":   linkedin,
                "links":     "|".join(extra_links),
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
    u.school    = g.school,
    u.role      = g.role,
    u.website   = g.website,
    u.links     = g.links,
    u.email     = g.email,
    u.phone     = g.phone,
    u.guestId   = g.guestId,
    u.createdAt = g.createdAt
ON MATCH SET
    u.school    = CASE WHEN g.school <> '' THEN g.school ELSE u.school END,
    u.role      = CASE WHEN g.role <> '' THEN g.role ELSE u.role END,
    u.website   = CASE WHEN g.website <> '' THEN g.website ELSE u.website END,
    u.links     = CASE WHEN g.links <> '' THEN g.links ELSE u.links END,
    u.email     = CASE WHEN g.email <> '' THEN g.email ELSE u.email END,
    u.phone     = CASE WHEN g.phone <> '' THEN g.phone ELSE u.phone END,
    u.guestId   = CASE WHEN g.guestId <> '' THEN g.guestId ELSE u.guestId END
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
