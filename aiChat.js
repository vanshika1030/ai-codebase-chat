const axios = require("axios");
const fs = require("fs");
const path = require("path");
let cachedFiles = [];
const allowedExtensions = [".js", ".ts", ".py", ".java", ".cpp"];

const ignoredFolders = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next"
];

function readFiles(dir) {
  let results = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (ignoredFolders.includes(file)) continue;
      results = results.concat(readFiles(fullPath));
    } else {
      if (!allowedExtensions.some(ext => file.endsWith(ext))) continue;

      try {
        const content = fs.readFileSync(fullPath, "utf8");
        results.push({
          name: file,
          path: fullPath,
          content
        });
      } catch (err) {
        // ignore read failures
      }
    }
  }

  return results;
}

function searchFiles(query, repoPath) {
  if (!repoPath) {
    return [];
  }

  if (!cachedFiles.length) {
    cachedFiles = readFiles(repoPath);
  }

  const files = cachedFiles;
  const q = (query || "").toLowerCase();

  const matches = files.filter(file => {
    return (
      file.name.toLowerCase().includes(q) ||
      file.content.toLowerCase().includes(q)
    );
  });

  if (matches.length === 0) {
    return files.slice(0, 10);
  }

  return matches.slice(0, 10);
}

async function askAI(question, repoPath) {
  if (!repoPath) {
    throw new Error("repoPath required");
  }

  const relevantFiles = searchFiles(question, repoPath);
  let code = "";

  for (const file of relevantFiles) {
    code += `\nFILE: ${file.name}\n`;
    code += file.content;
  }

  const prompt = `You are a senior software engineer helping analyze a GitHub repository.\n\n` +
    `Below are relevant files from the repository:\n\n${code}\n\n` +
    `User question: ${question}\n\n` +
    `Explain clearly based on the code.`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "deepseek/deepseek-chat",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("Relevant files:", relevantFiles.map(f => f.name));

  return {
    answer: response.data.choices[0].message.content,
    sources: relevantFiles.map(f => path.basename(f.path))
  };
}

async function explainFile(filePath, fileContent) {
  const prompt = `You are a senior software engineer.\n\n` +
    `File path: ${filePath}\n` +
    `File content:\n${fileContent}\n\n` +
    `Please provide a JSON output with keys: purpose, importantFunctions, dependencies, connectionsToRepo. ` +
    `Keep the response compact but complete.`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "deepseek/deepseek-chat",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data.choices[0].message.content;
}

async function modifyCode(query, repoPath) {
  if (!repoPath) {
    throw new Error("repoPath required");
  }

  const relevantFiles = searchFiles(query, repoPath);

  let context = "";
  for (const file of relevantFiles) {
    context += `\nFILE: ${file.name}\n${file.content}\n`;
  }

  const prompt = `You are an AI coding assistant. The user asked: "${query}". ` +
    `Below are relevant files from the repository. Provide a JSON object with keys: filePath, updatedCode. ` +
    `Return only JSON with escaped new lines if needed.\n\n${context}`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "deepseek/deepseek-chat",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const answer = response.data.choices[0].message.content;

  let parsed = null;
  try {
    // Locate JSON substring
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (err) {
    console.error("Could not parse modifyCode response JSON", err);
    throw new Error("Could not parse code modification response from AI");
  }

  if (!parsed || !parsed.filePath || !parsed.updatedCode) {
    throw new Error("AI did not return expected JSON structure");
  }

  let originalCode = "";
  try {
    originalCode = fs.readFileSync(parsed.filePath, "utf8");
  } catch (_) {
    originalCode = "";
  }

  return {
    filePath: parsed.filePath,
    originalCode,
    updatedCode: parsed.updatedCode
  };
}

module.exports = {
  askAI,
  readFiles,
  searchFiles,
  explainFile,
  modifyCode
};