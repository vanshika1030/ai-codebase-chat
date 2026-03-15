const axios = require("axios");
const fs = require("fs");
const path = require("path");

// allowed source code files
const allowedExtensions = [".js", ".ts", ".py", ".java", ".cpp"];

// folders we don't want to scan
const ignoredFolders = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next"
];

// read repo files recursively
function readFiles(dir) {

  let filesData = [];

  const files = fs.readdirSync(dir);

  for (const file of files) {

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    // skip unwanted folders
    if (stat.isDirectory()) {

      if (ignoredFolders.includes(file)) continue;

      filesData = filesData.concat(readFiles(fullPath));

    } 
    else {

      if (!allowedExtensions.some(ext => file.endsWith(ext))) continue;

      try {

        const content = fs.readFileSync(fullPath, "utf8");

        filesData.push({
          name: file,
          path: fullPath,
          content: content.slice(0, 2000) // prevent huge prompts
        });

      } catch (err) {}

    }

  }

  return filesData;
}


// 🔎 Mini-RAG search
function searchFiles(question, files) {

  const q = question.toLowerCase();

  return files
    .filter(file =>
      file.content.toLowerCase().includes(q)
    )
    .slice(0,5);

}


async function askAI(question, repoPath) {

  const repoFiles = readFiles(repoPath);

  // 🔎 find relevant files
  const relevantFiles = searchFiles(question, repoFiles);

  // build context only from those files
  const context = relevantFiles
    .map(f => `FILE: ${f.name}\n${f.content}`)
    .join("\n\n");

  const prompt = `
You are a senior software engineer helping analyze a GitHub repository.

Use the following code files to answer the question.

${context}

User question:
${question}

Explain clearly based on the code.
`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "deepseek/deepseek-chat-v3",
      messages: [
        { role: "user", content: prompt }
      ]
    },
    {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return {
    answer: response.data.choices[0].message.content,
    sources: relevantFiles.map(f => f.name)
  };

}

module.exports = askAI;
