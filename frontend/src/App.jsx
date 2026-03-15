import { useState } from "react";
import axios from "axios";
import "./App.css";
import ReactMarkdown from "react-markdown";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

function App() {

  const [repoUrl, setRepoUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [repoLoaded, setRepoLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");

  // fetch repo files
  const fetchFiles = async () => {
    const res = await axios.get("http://localhost:3000/files");
    setFiles(res.data);
  };

  const loadRepo = async () => {

    setLoading(true);

    await axios.post("http://localhost:3000/load-repo", {
      repoUrl
    });

    setRepoLoaded(true);

    await fetchFiles(); // IMPORTANT

    setMessages(prev => [
      ...prev,
      { role: "system", content: "Repository loaded successfully." }
    ]);

    setLoading(false);
  };

  const askQuestion = async () => {

    if (!question) return;

    const userMessage = { role: "user", content: question };

    setMessages(prev => [...prev, userMessage]);

    setQuestion("");

    setLoading(true);

    const res = await axios.post("http://localhost:3000/chat", {
      question: userMessage.content
    });

    setMessages(prev => [
  ...prev,
  {
    role: "ai",
    content: res.data.answer,
    sources: res.data.sources
  }
]);


    setLoading(false);
  };

  const openFile = async (path) => {

    const res = await axios.get("http://localhost:3000/file", {
      params: { path }
    });

    setSelectedFile(path);
    setFileContent(res.data.content);

  };

  return (

    <div className="container">

      <h1>AI Codebase Chat</h1>

      <div className="repo-section">

        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="Paste GitHub repo URL"
        />

        <button onClick={loadRepo}>Load Repo</button>

        {repoLoaded && <span className="loaded">Repo Loaded ✓</span>}

      </div>

      {/* MAIN LAYOUT */}
      <div className="main-layout">

        {/* FILE SIDEBAR */}
        <div className="sidebar">

          <h3>Files</h3>

          {files.map((file, i) => (
            <div
              key={i}
              className="file-item"
              onClick={() => openFile(file.path)}
            >
              {file.name}
            </div>
          ))}

        </div>

        {/* CHAT SECTION */}
        <div className="chat-section">

          <div className="chat-box">

            {messages.map((msg, i) => (

              <div
                key={i}
                className={`message ${msg.role}`}
              >
                <ReactMarkdown>{msg.content}</ReactMarkdown>

{msg.sources && (
  <div className="sources">
    <strong>Sources:</strong>

    {msg.sources.map((s,i)=>(
      <div key={i}>{s}</div>
    ))}
  </div>
)}

              </div>

            ))}

            {loading && (
              <div className="loading">AI is thinking...</div>
            )}

          </div>

          <div className="input-area">

            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about the code..."
              onKeyDown={(e) => {
                if (e.key === "Enter") askQuestion();
              }}
            />

            <button onClick={askQuestion}>Ask</button>

          </div>

        </div>

        {/* CODE VIEWER */}
        <div className="code-viewer">

          <h3>{selectedFile}</h3>

          <SyntaxHighlighter
  language="javascript"
  style={vscDarkPlus}
>
  {fileContent}
</SyntaxHighlighter>


        </div>

      </div>

    </div>
  );
}

export default App;
