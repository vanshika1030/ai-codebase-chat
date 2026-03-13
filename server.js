require("dotenv").config();
const express = require("express");
const cloneRepo = require("./cloneRepo");
const askAI = require("./aiChat");

const app = express();
app.use(express.json());

let currentRepoPath = "";

app.post("/load-repo", async (req, res) => {

    const { repoUrl } = req.body;

    try {
        currentRepoPath = await cloneRepo(repoUrl);

        res.json({
            message: "Repo loaded successfully"
        });

    } catch (err) {
        res.status(500).json({ error: "Failed to load repo" });
    }
});

app.post("/chat", async (req, res) => {

    const { question } = req.body;

    try {

        const answer = await askAI(question, currentRepoPath);

        res.json({
            answer
        });

    } catch (err) {
        res.status(500).json({ error: "AI failed" });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});