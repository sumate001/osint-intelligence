"""Turning the place names in the news into points.

The data was already there: Horizon extracts a location for four out of five
events and it reached nobody, because the field was missing from the shared
contract. What is tested here is what happens after it arrives — Thai reporting
gives an address rather than a place name, and the same place arrives spelled
three ways.
"""

import pytest

from app.modules.geo.service import candidates

pytestmark = pytest.mark.unit


def test_an_address_is_reduced_to_the_units_inside_it():
    """"สำนักงานเทศบาลตำบลพ่อมิ่ง หมู่ที่ 3 ตำบลพ่อมิ่ง อำเภอปะนาเระ จังหวัดปัตตานี"
    has no Wikidata item; each administrative unit inside it does."""
    got = candidates("สำนักงานเทศบาลตำบลพ่อมิ่ง หมู่ที่ 3 ตำบลพ่อมิ่ง อำเภอปะนาเระ จังหวัดปัตตานี")

    assert "อำเภอปะนาเระ" in got
    assert "จังหวัดปัตตานี" in got


def test_the_tightest_pin_is_tried_first():
    """A district is a far more useful pin than the province containing it.

    Ordering by string length looked like a proxy for specificity and was not:
    it put "เทศบาลตำบลพ่อมิ่ง" ahead of "อำเภอปะนาเระ" purely by spelling, and the
    lookup came back with the province.
    """
    got = candidates("เหตุที่ อำเภอปะนาเระ จังหวัดปัตตานี")

    assert got.index("อำเภอปะนาเระ") < got.index("จังหวัดปัตตานี")


def test_the_abbreviated_forms_thai_reporting_actually_uses_are_found():
    got = candidates("ศูนย์การค้าอยุธยาซิตี้พาร์ค จ.พระนครศรีอยุธยา")

    assert "จ.พระนครศรีอยุธยา" in got


def test_the_name_as_written_is_always_tried_first():
    """A plain place name needs no taking apart, and taking it apart would lose
    whatever precision the reporter gave."""
    assert candidates("จังหวัดนราธิวาส")[0] == "จังหวัดนราธิวาส"


def test_a_name_with_no_administrative_unit_still_gets_asked_about():
    assert candidates("ทำเนียบรัฐบาล") == ["ทำเนียบรัฐบาล"]
