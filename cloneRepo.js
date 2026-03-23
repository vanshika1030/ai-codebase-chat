const simpleGit = require("simple-git");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");

const git = simpleGit();

async function cloneRepo(repoUrl) {

    const repoName = repoUrl.split("/").pop().replace(".git", "");
    const secDir = path.join("/tmp", "repos");
    
    try {
        await fs.mkdir(secDir, { recursive: true });
    } catch (_) {
        // dir may already exist
    }
    
    const localPath = path.join(secDir, repoName);

    console.log("Cloning repo (shallow):", repoUrl);

    try {

        // Check if repo already exists - skip clone if so
        if (fsSync.existsSync(localPath)) {
    console.log("Repo already exists. Skipping clone.");
    return localPath;
}

        // Use shallow clone (--depth=1) for faster performance
        await git.clone(repoUrl, localPath, ["--depth=1", "--single-branch"]);

        console.log("Repo cloned successfully:", localPath);

        return localPath;

    } catch (error) {

        console.error("Clone error:", error);
        throw error;

    }
}

module.exports = cloneRepo;