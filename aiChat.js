const axios = require("axios");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Cache with repo-specific files
const repoCache = new Map();

const allowedExtensions = [".js", ".ts", ".py", ".java", ".cpp"];

const ignoredFolders = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next"
];

async function readFilesAsync(dir) {
  let results = [];
  
  try {
    const files = await fs.readdir(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      
      try {
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          if (ignoredFolders.includes(file)) continue;
          results = results.concat(await readFilesAsync(fullPath));
        } else {
          if (!allowedExtensions.some(ext => file.endsWith(ext))) continue;

          try {
            const content = await fs.readFile(fullPath, "utf8");
            results.push({
              name: file,
              path: fullPath,
              content
            });
          } catch (err) {
            // ignore read failures
          }
        }
      } catch (statErr) {
        // skip files we can't stat
      }
    }
  } catch (err) {
    console.error("Error reading directory:", err);
  }

  return results;
}

async function searchFiles(query, repoPath) {
  if (!repoPath) {
    return [];
  }

  // Check if we have cached files for this repo
  if (!repoCache.has(repoPath)) {
    console.log("Reading repo files for first time - caching...");
    const cachedFiles = await readFilesAsync(repoPath);
    repoCache.set(repoPath, cachedFiles);
  }

  const files = repoCache.get(repoPath);
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

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set in environment variables");
  }

  const relevantFiles = await searchFiles(question, repoPath);
  let code = "";
  let MAX_CONTEXT = 50000;

  // Build context from files
  for (const file of relevantFiles) {
    const fileHeader = `\nFILE: ${file.name}\n`;
    const fileContent = file.content;
    
    // If adding this file would exceed limit, truncate it
    if ((code + fileHeader + fileContent).length > MAX_CONTEXT) {
      const remainingSpace = MAX_CONTEXT - code.length - fileHeader.length;
      if (remainingSpace > 500) {
        code += fileHeader;
        code += fileContent.substring(0, remainingSpace - 100);
        code += "\n... (file truncated)";
      }
      break;
    } else {
      code += fileHeader;
      code += fileContent;
    }
  }

  if (code.length > MAX_CONTEXT + 5000) {
    throw new Error(`Context too large (${code.length} chars). Please ask a more specific question to reduce matches.`);
  }

  const prompt = `You are a senior software engineer helping analyze a GitHub repository.\n\n` +
    `Below are relevant files from the repository:\n\n${code}\n\n` +
    `User question: ${question}\n\n` +
    `Explain clearly based on the code.`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openrouter/auto",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  ).catch(err => {
    if (err.response?.status === 401) {
      throw new Error("Invalid API key for OpenRouter");
    }
    if (err.response?.status === 429) {
      throw new Error("Rate limited by OpenRouter. Please try again later");
    }
    if (err.response?.data?.error?.message) {
      throw new Error(`OpenRouter API error: ${err.response.data.error.message}`);
    }
    throw err;
  });

  console.log("Relevant files:", relevantFiles.map(f => f.name));
  console.log("API Response status:", response.status);

  if (!response.data.choices || !response.data.choices[0]) {
    throw new Error("Invalid API response format from OpenRouter");
  }

  return {
    answer: response.data.choices[0].message.content,
    sources: relevantFiles.map(f => path.basename(f.path))
  };
}

async function explainFile(filePath, fileContent) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set in environment variables");
  }

  const MAX_FILE_SIZE = 20000; // Increased from 8000
  const TRUNCATE_MARKER = "\n... [MIDDLE SECTION OMITTED FOR BREVITY] ...\n";
  
  let processedContent = fileContent;
  let wasTruncated = false;

  // If file is too large, intelligently truncate it
  if (fileContent.length > MAX_FILE_SIZE) {
    wasTruncated = true;
    // Keep beginning (60%) and end (40%) of file for better understanding of structure
    const keepBeginning = Math.floor(MAX_FILE_SIZE * 0.6);
    const keepEnd = Math.floor(MAX_FILE_SIZE * 0.35);
    
    const beginning = fileContent.substring(0, keepBeginning);
    const end = fileContent.substring(fileContent.length - keepEnd);
    
    processedContent = beginning + TRUNCATE_MARKER + end;
  }

  const truncationNote = wasTruncated 
    ? "\n\nNote: This file was very large, so only the beginning and end sections are shown. Focus on the structure and key functions visible in these sections."
    : "";

  const prompt = `You are a senior software engineer.\n\n` +
    `File path: ${filePath}\n` +
    `File content:\n${processedContent}${truncationNote}\n\n` +
    `Please provide a JSON output with keys: purpose, importantFunctions, dependencies, connectionsToRepo. ` +
    `Keep the response compact but complete.`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openrouter/auto",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  ).catch(err => {
    if (err.response?.status === 401) {
      throw new Error("Invalid API key for OpenRouter");
    }
    if (err.response?.status === 429) {
      throw new Error("Rate limited by OpenRouter. Please try again later");
    }
    if (err.response?.data?.error?.message) {
      throw new Error(`OpenRouter API error: ${err.response.data.error.message}`);
    }
    throw err;
  });

  if (!response.data.choices || !response.data.choices[0]) {
    throw new Error("Invalid API response format from OpenRouter");
  }

  return response.data.choices[0].message.content;
}

async function modifyCode(query, repoPath) {
  if (!repoPath) {
    throw new Error("repoPath required");
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set in environment variables");
  }

  const relevantFiles = await searchFiles(query, repoPath);

  let context = "";
  let MAX_CONTEXT = 50000;

  // Build context from files with smart truncation
  for (const file of relevantFiles) {
    const fileHeader = `\nFILE: ${file.name}\n`;
    const fileContent = file.content;
    
    // If adding this file would exceed limit, truncate it
    if ((context + fileHeader + fileContent).length > MAX_CONTEXT) {
      const remainingSpace = MAX_CONTEXT - context.length - fileHeader.length;
      if (remainingSpace > 500) {
        context += fileHeader;
        context += fileContent.substring(0, remainingSpace - 100);
        context += "\n... (file truncated)";
      }
      break;
    } else {
      context += fileHeader;
      context += fileContent + "\n";
    }
  }

  if (context.length > MAX_CONTEXT + 5000) {
    throw new Error(`Context too large for code modification. Please ask a more specific question.`);
  }

  const prompt = `You are an AI coding assistant. The user asked: "${query}". ` +
    `Below are relevant files from the repository. Provide a JSON object with keys: filePath, updatedCode. ` +
    `Return only JSON with escaped new lines if needed.\n\n${context}`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openrouter/auto",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  ).catch(err => {
    if (err.response?.status === 401) {
      throw new Error("Invalid API key for OpenRouter");
    }
    if (err.response?.status === 429) {
      throw new Error("Rate limited by OpenRouter. Please try again later");
    }
    if (err.response?.data?.error?.message) {
      throw new Error(`OpenRouter API error: ${err.response.data.error.message}`);
    }
    throw err;
  });

  const answer = response.data.choices[0].message.content;

  let parsed = null;
  try {
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
    originalCode = fsSync.readFileSync(parsed.filePath, "utf8");
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
  searchFiles,
  explainFile,
  modifyCode
};