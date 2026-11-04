"""Verify that allowed commit types pass and invalid subjects are rejected."""

import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import checks
from checks import validate_subject


class CommitPolicyTests(unittest.TestCase):
    def test_all_four_types_and_optional_scope(self):
        for subject in (
            "feat: add strategy setup",
            "fix(review): reject outdated results",
            "chore(ci): check commit subjects",
            "docs: explain service boundaries",
            "feat(api)!: require a strategy version",
        ):
            with self.subTest(subject=subject):
                validate_subject(subject)

    def test_invalid_types_and_subjects_are_rejected(self):
        for subject in (
            "feature: add setup",
            "ci: add a workflow",
            "refactor: move validation",
            "test: cover setup",
            "doc: explain setup",
            "Fix: reject a result",
            "fix: Reject a result",
            "fix: ",
            "fix: reject a result.",
            "fix: reject a result ",
            "fix: reject a result\n",
            "fix(API): reject a result",
            "fix(api): " + "x" * 70,
            "Merge branch 'main'",
            "fixup! fix: reject a result",
        ):
            with self.subTest(subject=subject):
                with self.assertRaises(ValueError):
                    validate_subject(subject)


class RepositoryPolicyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name in checks.REQUIRED:
            (self.root / name).write_text("# Foundation\n", encoding="utf-8")

    def check(self, extra=()):
        tracked = "\0".join((*checks.REQUIRED, *extra)) + "\0"
        with patch.object(checks, "ROOT", self.root), patch.object(checks, "git", return_value=tracked):
            with contextlib.redirect_stdout(io.StringIO()):
                checks.check_repository()

    def test_valid_repository_passes(self):
        self.check()

    def test_broken_local_link_is_rejected(self):
        (self.root / "README.md").write_text("[Guide](missing.md)\n")
        with self.assertRaisesRegex(ValueError, "Invalid local link"):
            self.check()

    def test_local_environment_file_is_rejected(self):
        (self.root / ".env").write_text("EXAMPLE=placeholder\n")
        with self.assertRaisesRegex(ValueError, "must not be tracked"):
            self.check((".env",))

    def test_crlf_is_rejected(self):
        (self.root / "README.md").write_bytes(b"# Foundation\r\n")
        with self.assertRaisesRegex(ValueError, "non-LF"):
            self.check()

    def test_private_key_marker_is_rejected(self):
        marker = "-----BEGIN " + "PRIVATE KEY-----\n"
        (self.root / "README.md").write_text(marker)
        with self.assertRaisesRegex(ValueError, "Private-key material"):
            self.check()


if __name__ == "__main__":
    unittest.main()
