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

  let code = "";

  const files = fs.readdirSync(dir);

  for (const file of files) {

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    // skip unwanted folders
    if (stat.isDirectory()) {

      if (ignoredFolders.includes(file)) continue;

      code += readFiles(fullPath);

    } 
    else {

      // only read allowed file types
      if (!allowedExtensions.some(ext => file.endsWith(ext))) continue;

      try {

        const content = fs.readFileSync(fullPath, "utf8");

        code += `\nFILE: ${file}\n`;
        code += content.slice(0, 2000); // prevent huge prompts

      } catch (err) {}

    }

  }

  return code;

}

async function askAI(question, repoPath) {

  let code = readFiles(repoPath);

  // limit total repo size sent to AI
  code = code.slice(0, 12000);

  const prompt = `
You are a senior software engineer helping analyze a GitHub repository.

Below is part of the repository code:

${code}

User question:
${question}

Explain clearly based on the code.
`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "deepseek/deepseek-chat",
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

  return response.data.choices[0].message.content;

}

module.exports = askAI;
