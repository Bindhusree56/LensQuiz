"""
QuizLens FastAPI Backend
Run: uvicorn app:app --reload --port 8000
"""

import io
import hashlib
import os
import re
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import pdfplumber
from docx import Document as DocxDocument
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from analyzer import analyze_paper, sha256_bytes

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="QuizLens NLP API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080").split(",")
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
}
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", "10")) * 1024 * 1024
API_KEY = os.getenv("NLP_API_KEY", "")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
    allow_credentials=True,
)


def sanitize_text(text: str) -> str:
    if not text:
        return ""
    sanitized = str(text)
    sanitized = re.sub(r'<[^>]*>', '', sanitized)
    sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'on\w+=', '', sanitized, flags=re.IGNORECASE)
    sanitized = sanitized.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    return sanitized[:1000]


def sanitize_hash(hash_str: str) -> str:
    if not hash_str:
        return ""
    clean = re.sub(r'[^a-fA-F0-9x]', '', str(hash_str))
    return clean[:66] if len(clean) >= 66 else f"{'0x'}{clean}"


def validate_mime_type(file_bytes: bytes, filename: str) -> str:
    if file_bytes[:4] == b'%PDF':
        return 'application/pdf'
    elif file_bytes[:4] == b'PK\x03\x04':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    elif file_bytes[:5] == b'\xd0\xcf\x11\xe0\xa1\xb1':
        return 'application/msword'
    elif file_bytes.decode('utf-8', errors='ignore').replace('\x00', '').isprintable():
        ext = Path(filename).suffix.lower()
        if ext in ('.txt', '.md'):
            return 'text/plain'
    return ''


def extract_text(file_bytes: bytes, filename: str) -> str:
    detected_mime = validate_mime_type(file_bytes, filename)
    ext = Path(filename).suffix.lower()
    
    allowed_exts = {'.pdf', '.docx', '.doc', '.txt', '.md'}
    if ext not in allowed_exts:
        raise HTTPException(400, f"Unsupported file extension: {ext}. Use PDF, DOCX, or TXT.")
    
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    
    text = ""
    if ext == ".pdf" or detected_mime == "application/pdf":
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text() or ""
                    text += page_text + "\n"
        except Exception as e:
            raise HTTPException(400, f"Failed to parse PDF: {str(e)}")
    elif ext in (".docx", ".doc") or detected_mime in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"):
        try:
            doc = DocxDocument(io.BytesIO(file_bytes))
            text = "\n".join(p.text for p in doc.paragraphs)
        except Exception as e:
            raise HTTPException(400, f"Failed to parse DOCX: {str(e)}")
    elif ext in (".txt", ".md"):
        try:
            text = file_bytes.decode("utf-8", errors="replace")
        except Exception as e:
            raise HTTPException(400, f"Failed to parse text file: {str(e)}")
    else:
        raise HTTPException(400, f"Unsupported file type: {ext}")
    
    return text


def build_report_pdf(analysis) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                            leftMargin=50, rightMargin=50, topMargin=60, bottomMargin=50)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle("title", parent=styles["Title"],
                                 fontSize=20, spaceAfter=6, textColor=colors.HexColor("#1E3A5F"))
    h2_style    = ParagraphStyle("h2", parent=styles["Heading2"],
                                 fontSize=13, spaceBefore=14, spaceAfter=4, textColor=colors.HexColor("#2563EB"))
    body_style  = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, spaceAfter=4)
    mono_style  = ParagraphStyle("mono", parent=styles["Normal"], fontSize=8,
                                 fontName="Courier", textColor=colors.HexColor("#0F6E56"))

    story.append(Paragraph(f"QuizLens Analysis Report", title_style))
    story.append(Paragraph(f"Exam: {sanitize_text(analysis.title)}", styles["Heading3"]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Summary", h2_style))
    summary_data = [
        ["Metric", "Value"],
        ["Questions detected",    str(analysis.question_count)],
        ["Flesch reading ease",   f"{analysis.flesch_score} / 100  ({analysis.readability_label})"],
        ["Flesch-Kincaid grade",  f"Grade {analysis.flesch_grade}"],
        ["Avg sentence length",   f"{analysis.avg_sentence_length} words"],
        ["Dominant Bloom level",  analysis.overall_bloom.capitalize()],
        ["Bias flags found",      str(len(analysis.bias_summary))],
        ["Ambiguous questions",   str(len(analysis.ambiguous_questions)) or "None"],
    ]
    t = Table(summary_data, colWidths=[220, 280])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1E3A5F")),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F8FAFC"), colors.white]),
        ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#CBD5E1")),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Per-question analysis", h2_style))
    q_data = [["#", "Bloom level", "Confidence", "Bias flags", "Ambiguous"]]
    for q in analysis.questions:
        q_data.append([
            str(q.index),
            q.bloom_level.capitalize(),
            q.bloom_confidence,
            ", ".join(q.bias_flags) if q.bias_flags else "None",
            "Yes" if q.index in analysis.ambiguous_questions else "No",
        ])
    qt = Table(q_data, colWidths=[25, 90, 75, 180, 65])
    qt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#2563EB")),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 8),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.HexColor("#F0F9FF"), colors.white]),
        ("GRID",       (0,0), (-1,-1), 0.4, colors.HexColor("#BFDBFE")),
        ("TOPPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(qt)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Cryptographic hashes (for blockchain notarization)", h2_style))
    story.append(Paragraph("Paper SHA-256:", body_style))
    story.append(Paragraph(analysis.paper_hash, mono_style))
    story.append(Spacer(1, 6))

    doc.build(story)
    return buf.getvalue()


@app.get("/")
def root():
    return {"message": "QuizLens NLP API running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": str(hashlib.sha256())[:8]}


@app.post("/v1/analyze")
@limiter.limit("30/minute")
async def analyze_v1(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form("Untitled Exam")
):
    return await analyze_endpoint(request, file, title)


@app.post("/analyze")
@limiter.limit("30/minute")
async def analyze_endpoint(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form("Untitled Exam")
):
    if API_KEY:
        auth_header = request.headers.get("Authorization", "")
        api_key = request.headers.get("X-API-Key", "")
        expected_key = API_KEY.replace("Bearer ", "")
        
        if api_key != expected_key and auth_header.replace("Bearer ", "") != expected_key:
            raise HTTPException(401, "Invalid or missing API key")

    file_bytes = await file.read()
    filename = file.filename or "unknown.txt"

    if len(file_bytes) < 10:
        raise HTTPException(400, "File is too small or empty")

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")

    text = extract_text(file_bytes, filename)
    if len(text.strip()) < 20:
        raise HTTPException(400, "Could not extract text from file — ensure it's a readable PDF/DOCX/TXT")

    sanitized_title = sanitize_text(title)
    text = sanitize_text(text)

    analysis = analyze_paper(text, sanitized_title, file_bytes=file_bytes)

    report_pdf = build_report_pdf(analysis)
    report_hash = sha256_bytes(report_pdf)
    analysis.report_hash = report_hash

    return JSONResponse({
        "title":              analysis.title,
        "question_count":     analysis.question_count,
        "flesch_score":       analysis.flesch_score,
        "flesch_grade":       analysis.flesch_grade,
        "readability_label":  analysis.readability_label,
        "avg_sentence_length": analysis.avg_sentence_length,
        "overall_bloom":      analysis.overall_bloom,
        "bias_summary":       analysis.bias_summary,
        "ambiguous_questions": analysis.ambiguous_questions,
        "questions": [
            {
                "index":           q.index,
                "text":            sanitize_text(q.text)[:200],
                "bloom_level":     q.bloom_level,
                "bloom_confidence": q.bloom_confidence,
                "bias_flags":      q.bias_flags,
            }
            for q in analysis.questions
        ],
        "paper_hash":  sanitize_hash(analysis.paper_hash),
        "report_hash": sanitize_hash(report_hash),
        "report_pdf_b64": __import__("base64").b64encode(report_pdf).decode(),
    })


@app.get("/status/{task_id}")
async def get_task_status(task_id: str):
    raise HTTPException(404, "Async processing not implemented in direct mode. Use the proxy server for async jobs.")
