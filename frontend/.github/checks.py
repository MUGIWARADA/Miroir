"""Repository hygiene and commit policy. Uses the Python standard library only."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SUBJECT = re.compile(r"^(feat|fix|chore|docs)(\([a-z0-9][a-z0-9._/-]*\))?!?: [a-z][^\r\n]*$")
REQUIRED = ("README.md", "AGENTS.md", "github-collaboration.md", ".gitignore")
PRIVATE_KEY = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8")


def validate_subject(subject):
    if not SUBJECT.fullmatch(subject):
        raise ValueError("Use feat, fix, chore, or docs with a lowercase description")
    if len(subject) > 72 or subject.endswith((".", " ")):
        raise ValueError("Keep the subject within 72 characters without a trailing period or space")
    if subject != subject.strip() or any(ord(char) < 32 for char in subject):
        raise ValueError("Commit subjects must not contain surrounding whitespace or control characters")


def check_repository():
    errors = []
    for name in REQUIRED:
        if not (ROOT / name).is_file():
            errors.append(f"Missing required file: {name}")
    tracked = [Path(name) for name in git("ls-files", "-z").split("\0") if name]
    for relative in tracked:
        path = ROOT / relative
        if not path.exists():
            errors.append(f"Tracked file is missing: {relative}")
            continue
        if path.is_symlink():
            errors.append(f"Review symlinks explicitly before adding them: {relative}")
            continue
        if (
            (relative.name.startswith(".env") and not relative.name.endswith(".example"))
            or relative.suffix in {".pem", ".key", ".db", ".sqlite", ".sqlite3"}
            or any(part in {"node_modules", ".venv", "__pycache__"} for part in relative.parts)
        ):
            errors.append(f"Local or sensitive artifact must not be tracked: {relative}")
        if relative.suffix not in {".md", ".py", ".yml", ".yaml"} and relative.name != ".gitignore":
            continue
        try:
            text = path.read_bytes().decode("utf-8")
        except UnicodeError:
            errors.append(f"Expected UTF-8 text: {relative}")
            continue
        if not text.endswith("\n"):
            errors.append(f"Missing final newline: {relative}")
        if "\r" in text or any(line.rstrip() != line for line in text.splitlines()):
            errors.append(f"Trailing whitespace or non-LF line endings: {relative}")
        if PRIVATE_KEY.search(text):
            errors.append(f"Private-key material detected: {relative}")
        if relative.suffix == ".md":
            if "\u2014" in text:
                errors.append(f"Use simple punctuation instead of em dashes: {relative}")
            for destination in re.findall(r"\]\(([^)]+)\)", text):
                target = urlsplit(destination)
                if target.scheme or destination.startswith("#"):
                    continue
                local = (path.parent / unquote(target.path)).resolve()
                if destination.startswith("/") or not local.is_relative_to(ROOT) or not local.exists():
                    errors.append(f"Invalid local link in {relative}: {destination}")
    if errors:
        raise ValueError("\n".join(errors))
    print(f"Repository checks passed for {len(tracked)} tracked files. No application tests are defined.")


def check_commits():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    pull_request = event.get("pull_request")
    if pull_request:
        validate_subject(pull_request["title"])
        base, head = pull_request["base"]["sha"], pull_request["head"]["sha"]
    else:
        base, head = event.get("before", ""), os.environ["GITHUB_SHA"]
    if not re.fullmatch(r"[0-9a-f]{40}", head):
        raise ValueError("Invalid head commit")
    if base and base != "0" * 40:
        if not re.fullmatch(r"[0-9a-f]{40}", base):
            raise ValueError("Invalid base commit")
        revision = f"{base}..{head}"
    else:
        revision = head
    commits = git("rev-list", revision).splitlines()
    if not commits:
        raise ValueError("No commits found to validate")
    for sha in commits:
        subject = git("show", "-s", "--format=%s", sha).rstrip("\n")
        try:
            validate_subject(subject)
        except ValueError as error:
            raise ValueError(f"Commit {sha[:12]}: {error}") from error
        if len(git("show", "-s", "--format=%P", sha).split()) > 1:
            raise ValueError(f"Merge commit {sha[:12]} is not allowed")
    print(f"Commit policy passed for {len(commits)} commits.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--commits", action="store_true")
    args = parser.parse_args()
    try:
        check_commits() if args.commits else check_repository()
    except (ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
