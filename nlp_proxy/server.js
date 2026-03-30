import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import { createClient } from "./cacheClient.js";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
];

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024;

const NLP_API_URL = process.env.NLP_API_URL || "http://localhost:8000";
const NLP_API_KEY = process.env.NLP_API_KEY || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

const cache = createClient();

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(express.json({ limit: "1mb" }));

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  credentials: true,
};

app.use(cors(corsOptions));

const apiKeyMiddleware = (req, res, next) => {
  if (process.env.NODE_ENV === "development") {
    return next();
  }

  const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  if (apiKey !== NLP_API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  next();
};

const rateLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW) || 60) * 1000,
  max: parseInt(process.env.RATE_LIMIT_REQUESTS) || 30,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/v1", rateLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/v1/analyze", apiKeyMiddleware, async (req, res) => {
  try {
    if (!req.body || !req.body.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const fileBuffer = Buffer.from(req.body.file.data || req.body.file);
    const filename = req.body.filename || "unknown.txt";
    const title = req.body.title || "Untitled";

    if (fileBuffer.length > MAX_FILE_SIZE) {
      return res.status(413).json({ 
        error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 10}MB` 
      });
    }

    const fileTypeResult = await fileTypeFromBuffer(fileBuffer);
    
    if (!fileTypeResult) {
      const ext = filename.split(".").pop()?.toLowerCase();
      const allowedExts = ["txt", "pdf", "docx", "doc"];
      if (!ext || !allowedExts.includes(ext)) {
        return res.status(400).json({ error: "Unsupported file type" });
      }
    } else {
      const isAllowedMime = ALLOWED_MIME_TYPES.includes(fileTypeResult.mime);
      const isAllowedExt = ["pdf", "docx", "doc", "txt"].includes(fileTypeResult.ext);
      
      if (!isAllowedMime && !isAllowedExt) {
        return res.status(400).json({ 
          error: `Invalid file type: ${fileTypeResult.mime}. Allowed: PDF, DOCX, TXT` 
        });
      }
    }

    const sanitizedTitle = sanitizeText(title);
    
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: fileTypeResult?.mime || "application/octet-stream" });
    formData.append("file", blob, filename);
    formData.append("title", sanitizedTitle);

    const nlpResponse = await fetch(`${NLP_API_URL}/analyze`, {
      method: "POST",
      body: formData,
      headers: NLP_API_KEY ? { "X-API-Key": NLP_API_KEY } : {},
    });

    if (!nlpResponse.ok) {
      const errorData = await nlpResponse.json().catch(() => ({ detail: "Unknown error" }));
      return res.status(nlpResponse.status).json(errorData);
    }

    const result = await nlpResponse.json();
    
    result.paper_hash = sanitizeHash(result.paper_hash);
    result.report_hash = sanitizeHash(result.report_hash);
    result.title = sanitizedTitle;
    
    if (result.questions) {
      result.questions = result.questions.map(q => ({
        ...q,
        text: sanitizeText(q.text).slice(0, 500),
      }));
    }

    res.json(result);

  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/v1/status/:taskId", apiKeyMiddleware, async (req, res) => {
  const { taskId } = req.params;
  
  try {
    const task = await cache.get(`task:${taskId}`);
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json(JSON.parse(task));
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/v1/analyze/async", apiKeyMiddleware, async (req, res) => {
  try {
    if (!req.body || !req.body.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const fileBuffer = Buffer.from(req.body.file.data || req.body.file);
    
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return res.status(413).json({ 
        error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 10}MB` 
      });
    }

    const taskId = uuidv4();
    const title = sanitizeText(req.body.title || "Untitled");

    await cache.set(`task:${taskId}`, JSON.stringify({
      status: "queued",
      taskId,
      createdAt: new Date().toISOString(),
      title,
    }), { EX: 3600 });

    setTimeout(async () => {
      try {
        await cache.set(`task:${taskId}`, JSON.stringify({
          status: "processing",
          taskId,
          createdAt: new Date().toISOString(),
          title,
        }), { EX: 3600 });

        const fileTypeResult = await fileTypeFromBuffer(fileBuffer);
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: fileTypeResult?.mime || "application/octet-stream" });
        formData.append("file", blob, req.body.filename || "file");
        formData.append("title", title);

        const nlpResponse = await fetch(`${NLP_API_URL}/analyze`, {
          method: "POST",
          body: formData,
        });

        const result = await nlpResponse.json();
        
        await cache.set(`task:${taskId}`, JSON.stringify({
          status: "completed",
          taskId,
          result,
          completedAt: new Date().toISOString(),
        }), { EX: 86400 });

      } catch (error) {
        await cache.set(`task:${taskId}`, JSON.stringify({
          status: "failed",
          taskId,
          error: error.message,
          failedAt: new Date().toISOString(),
        }), { EX: 3600 });
      }
    }, 100);

    res.json({ taskId, status: "queued", message: "Task submitted successfully" });

  } catch (error) {
    console.error("Async submit error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function sanitizeText(text) {
  if (!text) return "";
  return String(text)
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .slice(0, 500);
}

function sanitizeHash(hash) {
  if (!hash) return "";
  const clean = String(hash).replace(/[^a-fA-F0-9x]/g, "");
  return clean.startsWith("0x") ? clean.slice(0, 66) : `0x${clean.slice(0, 64)}`;
}

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  
  if (err.message?.includes("CORS")) {
    return res.status(403).json({ error: "CORS policy violation" });
  }
  
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`QuizLens Proxy running on port ${PORT}`);
  console.log(`NLP API: ${NLP_API_URL}`);
  console.log(`Rate limit: ${process.env.RATE_LIMIT_REQUESTS || 30} requests per ${process.env.RATE_LIMIT_WINDOW || 60}s`);
});
