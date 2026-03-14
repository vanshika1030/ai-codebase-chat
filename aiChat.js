const axios = require("axios");
const fs = require("fs");
const path = require("path");

function readFiles(dir) {

  let code = "";

  const files = fs.readdirSync(dir);

  for (const file of files) {

      if (
      file === "node_modules" ||
      file === ".git" ||
      file === "dist" ||
      file === "build" ||
      file === "coverage"
    ) continue;

    const fullPath = path.join(dir, file);

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {

      if (file === "node_modules" || file === ".git") continue;

      code += readFiles(fullPath);

    } else {

      try {
        code += fs.readFileSync(fullPath, "utf8") + "\n";
      } catch (err) {}

    }

  }

  return code;
}

async function askAI(question, repoPath) {

  const code = readFiles(repoPath);

  const prompt = `
You are an expert software engineer.

Here is a codebase:
${code}

Question: ${question}
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