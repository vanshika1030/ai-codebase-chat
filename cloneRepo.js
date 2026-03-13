const simpleGit = require("simple-git");
const path = require("path");

const git = simpleGit();

async function cloneRepo(repoUrl) {
    const repoName = repoUrl.split("/").pop().replace(".git", "");
    const localPath = path.join(__dirname, "repos", repoName);

    try {
        await git.clone(repoUrl, localPath);
        console.log("Repo cloned:", repoName);
        return localPath;
    } catch (err) {
        console.error("Clone failed:", err);
    }
}

module.exports = cloneRepo;