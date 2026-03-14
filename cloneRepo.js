const simpleGit = require("simple-git");
const path = require("path");
const fs = require("fs");

const git = simpleGit();

async function cloneRepo(repoUrl) {

    const repoName = repoUrl.split("/").pop().replace(".git", "");
    const localPath = path.join(__dirname, "repos", repoName);

    console.log("Cloning repo:", repoUrl);

    try {

        // delete existing repo if it exists
        if (fs.existsSync(localPath)) {
            console.log("Removing old repo...");
            fs.rmSync(localPath, { recursive: true, force: true });
        }

        await git.clone(repoUrl, localPath);

        console.log("Repo cloned successfully:", localPath);

        return localPath;

    } catch (error) {

        console.error("Clone error:", error);
        throw error;

    }
}

module.exports = cloneRepo;