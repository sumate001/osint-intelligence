"""Export utilities — PDF (reportlab), GEXF, CSV."""
from __future__ import annotations
import csv
import io
import xml.etree.ElementTree as ET
from datetime import datetime

from .models import Brief


def export_csv(brief: Brief) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["section", "text", "verified", "sources"])
    for section in brief.sections:
        for item in section.get("items", []):
            writer.writerow([
                section.get("title", ""),
                item.get("text", ""),
                item.get("verified", False),
                "; ".join(item.get("sources", [])),
            ])
    return buf.getvalue().encode("utf-8-sig")


def export_gexf(brief: Brief) -> bytes:
    root = ET.Element("gexf", xmlns="http://gexf.net/1.2", version="1.2")
    meta = ET.SubElement(root, "meta", lastmodifieddate=datetime.utcnow().strftime("%Y-%m-%d"))
    ET.SubElement(meta, "creator").text = "OSINT//DESK"
    ET.SubElement(meta, "description").text = brief.title

    graph = ET.SubElement(root, "graph", defaultedgetype="undirected", mode="static")
    nodes_el = ET.SubElement(graph, "nodes")
    edges_el = ET.SubElement(graph, "edges")

    node_id = 0
    edge_id = 0
    brief_node = str(node_id)
    ET.SubElement(nodes_el, "node", id=brief_node, label=brief.title)
    node_id += 1

    for section in brief.sections:
        sec_nid = str(node_id)
        ET.SubElement(nodes_el, "node", id=sec_nid, label=section.get("title", ""))
        ET.SubElement(edges_el, "edge", id=str(edge_id), source=brief_node, target=sec_nid)
        node_id += 1
        edge_id += 1
        for item in section.get("items", []):
            item_nid = str(node_id)
            ET.SubElement(nodes_el, "node", id=item_nid, label=item.get("text", "")[:80])
            ET.SubElement(edges_el, "edge", id=str(edge_id), source=sec_nid, target=item_nid)
            node_id += 1
            edge_id += 1

    tree = ET.ElementTree(root)
    buf = io.BytesIO()
    tree.write(buf, encoding="utf-8", xml_declaration=True)
    return buf.getvalue()


def export_pdf_bytes(brief: Brief, public_only: bool = False) -> bytes:
    """Generate PDF using reportlab. Falls back to plain text if not installed."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.colors import HexColor
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
        from reportlab.lib.units import cm

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=2.5*cm, rightMargin=2.5*cm,
                                topMargin=2.5*cm, bottomMargin=2.5*cm)

        styles = getSampleStyleSheet()
        story = []

        dark = HexColor("#0D0F14")
        accent = HexColor("#4B7BEC")
        green = HexColor("#1E8449")
        yellow = HexColor("#B7860D")
        red = HexColor("#C0392B")
        text_color = HexColor("#C9D1E0")

        h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=16, textColor=accent, spaceAfter=4)
        h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11, textColor=accent, spaceAfter=2, spaceBefore=12)
        body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=15, spaceAfter=4)
        meta_style = ParagraphStyle("meta", parent=styles["Normal"], fontSize=8, textColor=HexColor("#7A869A"))

        mode_label = "PUBLIC REPORT" if public_only else "INTERNAL BRIEF"
        story.append(Paragraph(f"OSINT//DESK — {mode_label}", h1))
        story.append(Paragraph(brief.title, ParagraphStyle("title", parent=styles["Heading1"], fontSize=14, spaceAfter=2)))
        story.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · Status: {brief.status}", meta_style))
        story.append(Spacer(1, 0.4*cm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#232838")))
        story.append(Spacer(1, 0.3*cm))

        if brief.summary:
            story.append(Paragraph("SUMMARY", h2))
            story.append(Paragraph(brief.summary, body))

        if public_only:
            story.append(Paragraph("⚠ Public mode — verified ≥ 3 sources only", ParagraphStyle("warn", parent=body, textColor=yellow)))

        for section in brief.sections:
            stype = section.get("type", "")
            items = section.get("items", [])
            if public_only and stype in ("findings_unverified", "missing_links"):
                continue
            story.append(Paragraph(section.get("title", ""), h2))
            for item in items:
                if public_only and not item.get("verified"):
                    continue
                bullet = "✓" if item.get("verified") else "⚠"
                story.append(Paragraph(f"{bullet}  {item.get('text', '')}", body))

        if brief.methodology:
            story.append(Paragraph("METHODOLOGY", h2))
            story.append(Paragraph(brief.methodology, body))

        if public_only:
            hidden = sum(
                1 for s in brief.sections for it in s.get("items", [])
                if not it.get("verified")
            )
            if hidden:
                story.append(Spacer(1, 0.3*cm))
                story.append(Paragraph(f"{hidden} claim(s) hidden — pending verification", meta_style))

        doc.build(story)
        return buf.getvalue()

    except ImportError:
        # Fallback: plain text as PDF-like bytes
        lines = [f"OSINT//DESK — {'PUBLIC REPORT' if public_only else 'INTERNAL BRIEF'}", brief.title, ""]
        if brief.summary:
            lines += ["SUMMARY", brief.summary, ""]
        for section in brief.sections:
            lines.append(section.get("title", ""))
            for item in section.get("items", []):
                if public_only and not item.get("verified"):
                    continue
                lines.append(f"  {'[V]' if item.get('verified') else '[?]'} {item.get('text', '')}")
            lines.append("")
        return "\n".join(lines).encode("utf-8")
