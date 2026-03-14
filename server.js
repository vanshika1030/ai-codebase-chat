require("dotenv").config();
const express = require("express");
const cors = require("cors");

const cloneRepo = require("./cloneRepo");
const askAI = require("./aiChat");

const app = express();

app.use(cors());
app.use(express.json());

let currentRepoPath = "";

app.post("/load-repo", async (req, res) => {

    const { repoUrl } = req.body;

    try {

        const repoPath = await cloneRepo(repoUrl);

        currentRepoPath = repoPath;

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
    if (!currentRepoPath) {
        return res.json({
            answer: "Please load a repository first."
        });
    }

    try {

        const answer = await askAI(question, currentRepoPath);

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