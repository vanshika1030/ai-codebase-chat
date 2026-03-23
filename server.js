require("dotenv").config();

// Debug: Check if API key is loaded
if (!process.env.OPENROUTER_API_KEY) {
  console.warn("⚠️  WARNING: OPENROUTER_API_KEY not found in environment variables!");
  console.warn("Make sure .env file exists in the root directory with: OPENROUTER_API_KEY=your_key");
} else {
  console.log("✓ API key loaded successfully");
}

const express = require("express");
const cors = require("cors");

const cloneRepo = require("./cloneRepo");
const { askAI, explainFile, searchFiles, modifyCode } = require("./aiChat");
const { createTwoFilesPatch } = require("diff");

const app = express();

// Enhanced CORS with specific domain (update for production)
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true
}));
app.use(express.json());

let currentRepoPath = "";

const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Cache for file trees to avoid repeated reads
const fileTreeCache = new Map();

async function getFileTree(dir, base = "") {
  try {
    const files = await fs.readdir(dir);

    let result = [];

    for (const file of files) {

      if (["node_modules", ".git", "dist", "build", ".next", "coverage"].includes(file)) continue;

      const fullPath = path.join(dir, file);
      
      try {
        const stat = await fs.stat(fullPath);

        const relativePath = path.join(base, file);

        if (stat.isDirectory()) {
          result.push({
            type: "folder",
            name: file,
            path: relativePath,
            children: await getFileTree(fullPath, relativePath)
          });
        } else {
          result.push({
            type: "file",
            name: file,
            path: relativePath
          });
        }
      } catch (statErr) {
        // Skip files we can't stat
      }

    }

    return result;
  } catch (err) {
    console.error("Error reading directory:", err);
    return [];
  }
}

app.get("/files", async (req, res) => {
  const repoDir = req.query.repoPath || currentRepoPath;

  if (!repoDir) {
    return res.json([]);
  }

  // Check cache first
  if (fileTreeCache.has(repoDir)) {
    return res.json(fileTreeCache.get(repoDir));
  }

  try {
    const tree = await getFileTree(repoDir);
    // Cache the result for 5 minutes
    fileTreeCache.set(repoDir, tree);
    setTimeout(() => fileTreeCache.delete(repoDir), 5 * 60 * 1000);
    res.json(tree);
  } catch (err) {
    console.error("File tree error:", err);
    res.status(500).json({ error: "Failed to read directory" });
  }
});

app.get("/file", async (req, res) => {
  const filename = req.query.name;
  const repoDir = req.query.repoPath || currentRepoPath;

  if (!repoDir) {
    return res.status(400).json({ error: "Missing repoPath" });
  }

  const filePath = path.join(repoDir, filename);

  try {
    const content = await fs.readFile(filePath, "utf8");
    res.json({ content });
  } catch (err) {
    console.error("File read error:", err);
    res.status(500).json({ error: "File not found" });
  }
});

app.post("/load-repo", async (req, res) => {

    const { repoUrl } = req.body;

    try {

        const repoPath = await cloneRepo(repoUrl);

        currentRepoPath = repoPath;

        console.log("Repo path set to:", currentRepoPath);

        res.json({
            message: "Repo loaded successfully",
            repoPath
        });

    } catch (err) {

        console.error("Repo loading error:", err);

        res.status(500).json({
            error: "Failed to load repo"
        });

    }
});

app.post("/explain-file", async (req, res) => {
  const { filePath, fileContent } = req.body;

  if (!filePath || !fileContent) {
    return res.status(400).json({ error: "filePath and fileContent are required" });
  }

  try {
    const explanation = await explainFile(filePath, fileContent);
    res.json({ explanation });
  } catch (err) {
    console.error("Explain-file error:", err.response?.data || err.message || err);
    res.status(500).json({ 
      error: err.response?.data?.error || err.message || "Failed to explain file" 
    });
  }
});

app.post("/search", async (req, res) => {
  const { query, repoPath } = req.body;
  const targetRepo = repoPath || currentRepoPath;

  if (!query || !targetRepo) {
    return res.status(400).json({ error: "query and repoPath are required" });
  }

  try {
    const matches = searchFiles(query, targetRepo);
    const resultPaths = matches.map(f => f.path);
    res.json({ results: resultPaths });
  } catch (err) {
    console.error("Search error:", err.message || err);
    res.status(500).json({ error: err.message || "Search failed" });
  }
});

app.post("/modify-code", async (req, res) => {
  const { query, repoPath } = req.body;
  const targetRepo = repoPath || currentRepoPath;

  if (!query || !targetRepo) {
    return res.status(400).json({ error: "query and repoPath are required" });
  }

  try {
    const modification = await modifyCode(query, targetRepo);
    const patch = createTwoFilesPatch(
      modification.filePath,
      modification.filePath,
      modification.originalCode || "",
      modification.updatedCode || ""
    );

    res.json({
      file: modification.filePath,
      diff: patch,
      updatedCode: modification.updatedCode
    });
  } catch (err) {
    console.error("Modify-code error:", err.response?.data || err.message || err);
    res.status(500).json({ error: err.response?.data?.error || err.message || "Modify code failed" });
  }
});

app.post("/chat", async (req, res) => {

    const { question, repoPath } = req.body;
    const targetRepo = repoPath || currentRepoPath;

    if (!targetRepo) {
        return res.json({
            answer: "Please load a repository first."
        });
    }

    try {

        const result = await askAI(question, targetRepo);

        res.json(result);

    } catch (err) {

        console.error("AI error:", err.response?.data || err.message || err);

        res.status(500).json({
            error: err.response?.data?.error || err.message || "AI failed"
        });

    }

});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});