require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function readFiles(dir) {
  let code = "";

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const fullPath = path.join(dir, file);

    if (fs.lstatSync(fullPath).isDirectory()) {
      code += readFiles(fullPath);
    } else if (file.endsWith(".js") || file.endsWith(".java") || file.endsWith(".py")) {
      code += fs.readFileSync(fullPath, "utf8") + "\n";
    }
  });

  return code;
}

async function askAI(question, repoPath) {

  const codebase = readFiles(repoPath).slice(0, 12000);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert software engineer explaining a codebase."
      },
      {
        role: "user",
        content: `Here is the code:\n${codebase}\n\nQuestion:${question}`
      }
    ]
  });

  return response.choices[0].message.content;
}

module.exports = askAI;