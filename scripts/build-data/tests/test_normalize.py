import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import normalize as n  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]


class NormalizeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records, cls.report, cls.cover, cls.periods, cls.types = n.normalize(str(ROOT / "Book6.xlsx"))

    def test_all_rows_loaded_with_unique_ids(self):
        self.assertEqual(len(self.records), 402)
        ids = [r["id"] for r in self.records]
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_record_has_site_and_region(self):
        for r in self.records:
            self.assertTrue(r["site"], r["id"])
        self.assertEqual(self.report.get("no_region"), ["1358-1"])

    def test_ditto_site_reuses_previous_site(self):
        for r in self.records:
            self.assertNotIn("-//-", r["site"])

    def test_known_author_alias_is_merged(self):
        authors = {a for r in self.records for a in r["authors"]}
        self.assertNotIn("Благкевич Н.В.", authors)

    def test_years_range_parsed(self):
        self.assertEqual(n.parse_years("1990-1997, 2004")[:2], (1990, 2004))


if __name__ == "__main__":
    unittest.main()
