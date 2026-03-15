require("dotenv").config();
const express = require("express");
const cors = require("cors");

const cloneRepo = require("./cloneRepo");
const askAI = require("./aiChat");

const app = express();

app.use(cors());
app.use(express.json());

// let currentRepoPath = "";
global.currentRepoPath = "";

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

  if (!global.currentRepoPath) {
    return res.json([]);
  }

  const tree = getFileTree(global.currentRepoPath);

  res.json(tree);

});

app.get("/file", (req, res) => {

  const filePath = req.query.path;

  const fullPath = path.join(global.currentRepoPath, filePath);

  const content = fs.readFileSync(fullPath, "utf8");

  res.json({ content });

});

app.post("/load-repo", async (req, res) => {

    const { repoUrl } = req.body;

    try {

        const repoPath = await cloneRepo(repoUrl);

      global.currentRepoPath = repoPath;


        console.log("Repo path set to:", currentRepoPath);

        res.json({
            message: "Repo loaded successfully"
        });

    } catch (err) {

        console.error("Repo loading error:", err);

        res.status(500).json({
            error: "Failed to load repo"
        });

    }
});

app.post("/chat", async (req, res) => {

    const { question } = req.body;
     console.log("Current repo path:", currentRepoPath);
    if (!global.currentRepoPath) 
{
        return res.json({
            answer: "Please load a repository first."
        });
    }

    try {

        const answer = await askAI(question, global.currentRepoPath);


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