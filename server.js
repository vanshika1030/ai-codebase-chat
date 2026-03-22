require("dotenv").config();
const express = require("express");
const cors = require("cors");

const cloneRepo = require("./cloneRepo");
const { askAI, explainFile, searchFiles, modifyCode } = require("./aiChat");
const { createTwoFilesPatch } = require("diff");

const app = express();

app.use(cors());
app.use(express.json());

let currentRepoPath = "";

const fs = require("fs");
const path = require("path");

function getFileTree(dir, base = "") {
  const files = fs.readdirSync(dir);

  let result = [];

  for (const file of files) {

    if (["node_modules", ".git"].includes(file)) continue;

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    const relativePath = path.join(base, file);

    if (stat.isDirectory()) {
      result.push({
        type: "folder",
        name: file,
        path: relativePath,
        children: getFileTree(fullPath, relativePath)
      });
    } else {
      result.push({
        type: "file",
        name: file,
        path: relativePath
      });
    }

  }

  return result;
}

app.get("/files", (req, res) => {
  const repoDir = req.query.repoPath || currentRepoPath;

  if (!repoDir) {
    return res.json([]);
  }

  const tree = getFileTree(repoDir);

  res.json(tree);
});

app.get("/file", (req, res) => {
  const filename = req.query.name;
  const repoDir = req.query.repoPath || currentRepoPath;

  if (!repoDir) {
    return res.status(400).json({ error: "Missing repoPath" });
  }

  const filePath = path.join(repoDir, filename);

  try {
    const content = fs.readFileSync(filePath, "utf8");
    res.json({ content });
  } catch (err) {
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
    console.error("Explain-file error:", err);
    res.status(500).json({ error: "Failed to explain file" });
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
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
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
    console.error("Modify-code error:", err);
    res.status(500).json({ error: "Modify code failed" });
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

        const answer = await askAI(question, targetRepo);

        res.json({ answer });

    } catch (err) {

        console.error("AI error:", err);

        res.status(500).json({
            error: "AI failed"
        });

    }

});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});