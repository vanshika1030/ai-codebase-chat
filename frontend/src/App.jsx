import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";
import ReactMarkdown from "react-markdown";
const DiffViewer = React.lazy(() => import("react-diff-viewer-continued"));

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// Debounce utility function
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

function App() {

  const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

  const [repoUrl, setRepoUrl] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [repoLoaded, setRepoLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [isExplaining, setIsExplaining] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [modRequest, setModRequest] = useState("");
  const [codeDiff, setCodeDiff] = useState("");
  const [modifiedFile, setModifiedFile] = useState("");
  const [updatedCode, setUpdatedCode] = useState("");

  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // Response cache to avoid duplicate API calls
  const responseCacheRef = useRef(new Map());

  const messagesEndRef = useRef(null);
  const debounceSearchRef = useRef(null);

  // Debounce search query with 500ms delay
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-search when debounced search query changes
  useEffect(() => {
    if (debouncedSearchQuery && repoPath) {
      searchRepoAuto(debouncedSearchQuery);
    } else if (!debouncedSearchQuery) {
      setSearchResults([]);
    }
  }, [debouncedSearchQuery, repoPath]);

  // fetch repo files
  const fetchFiles = async (path = repoPath) => {
    if (!path) return;
    const res = await axios.get(`${BACKEND_BASE_URL}/files`, {
      params: { repoPath: path }
    });
    setFiles(res.data);
  };

  const loadRepo = async () => {
    if (!repoUrl) return;

    setLoading(true);

    try {
      const res = await axios.post(`${BACKEND_BASE_URL}/load-repo`, {
        repoUrl
      });

      setRepoPath(res.data.repoPath);
      setRepoLoaded(true);

      await fetchFiles(res.data.repoPath);

      setMessages(prev => [
        ...prev,
        { role: "system", content: "Repository loaded successfully." }
      ]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        { role: "system", content: "⚠️ Repo load failed" }
      ]);
    }

    setLoading(false);
  };

  const askQuestion = async () => {
    if (!question || !repoPath) return;

    // Check cache first
    const cacheKey = `${repoPath}|${question}`;
    if (responseCacheRef.current.has(cacheKey)) {
      const cached = responseCacheRef.current.get(cacheKey);
      const userMessage = { role: "user", content: question };
      setMessages(prev => [...prev, userMessage, cached]);
      setQuestion("");
      return;
    }

    const userMessage = { role: "user", content: question };
    setMessages(prev => [...prev, userMessage]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await axios.post(`${BACKEND_BASE_URL}/chat`, {
        question: userMessage.content,
        repoPath
      });

      const aiMessage = {
        role: "ai",
        content: res.data.answer,
        sources: res.data.sources
      };

      // Cache the response
      responseCacheRef.current.set(cacheKey, aiMessage);

      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || "Unknown error";
      console.error("Chat error:", errorMsg, err);
      setMessages(prev => [
        ...prev,
        {
          role: "ai",
          content: `⚠️ Error: ${errorMsg}`
        }
      ]);
    }

    setLoading(false);
  };

  const openFile = async (path) => {
    if (!repoPath) return;

    try {
      const res = await axios.get(`${BACKEND_BASE_URL}/file`, {
        params: { name: path, repoPath }
      });

      setSelectedFile(path);
      setFileContent(res.data.content);
      setCodeDiff("");
      setUpdatedCode("");
      setModifiedFile("");
    } catch (err) {
      console.error(err);
    }
  };

  const explainFile = async () => {
    if (!selectedFile || !fileContent || isExplaining) return;

    const filename = selectedFile.split('/').pop() || selectedFile;

    // Add user message to chat
    setMessages(prev => [...prev, {
      role: "user",
      content: `Explain ${filename}`
    }]);

    setIsExplaining(true);

    try {
      const res = await axios.post(`${BACKEND_BASE_URL}/explain-file`, {
        filePath: selectedFile,
        fileContent
      });

      // Add AI response to chat
      setMessages(prev => [...prev, {
        role: "ai",
        content: res.data.explanation
      }]);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || "Unknown error";
      console.error("Explain file error:", errorMsg, err);
      // Add error message to chat
      setMessages(prev => [...prev, {
        role: "ai",
        content: `⚠️ Error: ${errorMsg}`
      }]);
    }

    setIsExplaining(false);
  };

  const searchRepo = async () => {
    if (!searchQuery || !repoPath) return;
    await searchRepoAuto(searchQuery);
  };

  const searchRepoAuto = async (query) => {
    if (!query || !repoPath) {
      setSearchResults([]);
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(`${BACKEND_BASE_URL}/search`, {
        query,
        repoPath
      });
      setSearchResults(res.data.results || []);
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    }

    setLoading(false);
  };

  const requestCodeModification = async () => {
    if (!modRequest || !repoPath || !selectedFile) return;
    setLoading(true);

    try {
      const res = await axios.post(`${BACKEND_BASE_URL}/modify-code`, {
        query: modRequest,
        repoPath
      });

      setModifiedFile(res.data.file);
      setCodeDiff(res.data.diff);
      setUpdatedCode(res.data.updatedCode);
    } catch (err) {
      console.error(err);
      setCodeDiff("⚠️ Failed to generate diff.");
      setModifiedFile("");
      setUpdatedCode("");
    }

    setLoading(false);
  };

  const toggleFolder = (path) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const renderFileTree = (items, level = 0) => {
    return items.map((item, i) => {
      const indent = level * 20;
      if (item.type === "folder") {
        const isExpanded = expandedFolders.has(item.path);
        return (
          <div key={i}>
            <div
              className="file-item folder-item"
              style={{ paddingLeft: indent + 8 }}
              onClick={() => toggleFolder(item.path)}
            >
              {isExpanded ? "📁" : "📂"} {item.name}
            </div>
            {isExpanded && item.children && renderFileTree(item.children, level + 1)}
          </div>
        );
      } else {
        return (
          <div
            key={i}
            className="file-item"
            style={{ paddingLeft: indent + 8 }}
            onClick={() => openFile(item.path)}
          >
            📄 {item.name}
          </div>
        );
      }
    });
  };

  return (
    <div className="app-container">
      
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="navbar-content">
          <div className="navbar-left">
            <div className="app-logo">🤖 AI Codebase Explorer</div>
          </div>
          <div className="navbar-center">
            {repoLoaded && (
              <span className="repo-status">
                <span className="status-dot"></span>
                Repository Loaded
              </span>
            )}
          </div>
          <div className="navbar-right">
            {repoLoaded && (
              <span className="repo-name">{repoPath?.split("/").pop() || "Repo"}</span>
            )}
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <div className="main-container">
        
        {/* REPO LOADER SECTION */}
        {!repoLoaded && (
          <div className="repo-loader-backdrop">
            <div className="repo-loader-card">
              <h1>AI Codebase Explorer</h1>
              <p>Analyze GitHub repositories with AI assistance</p>
              <div className="repo-loader-form">
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="Paste GitHub repository URL"
                  className="repo-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadRepo();
                  }}
                />
                <button onClick={loadRepo} className="repo-button" disabled={loading}>
                  {loading ? "Loading..." : "Load Repository"}
                </button>
              </div>
              <p className="loader-hint">
                Example: https://github.com/username/repository
              </p>
            </div>
          </div>
        )}

        {/* SIDEBAR + CHAT + CODE VIEWER */}
        {repoLoaded && (
          <div className="layout-grid">
            
            {/* LEFT SIDEBAR - FILE EXPLORER */}
            <aside className="sidebar">
              <div className="sidebar-header">
                <h2>📁 Files</h2>
              </div>
              <div className="file-tree-container">
                {renderFileTree(files)}
              </div>
            </aside>

            {/* CENTER - CHAT PANEL */}
            <div className="chat-panel">
              
              {/* SEARCH SECTION */}
              <div className="search-section">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search repository..."
                  className="search-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchRepo();
                  }}
                />
                <button onClick={searchRepo} className="search-button">Search</button>
              </div>

              {/* SEARCH RESULTS */}
              {searchResults.length > 0 && (
                <div className="search-results-panel">
                  <div className="results-header">🔍 Search Results ({searchResults.length})</div>
                  <div className="results-list">
                    {searchResults.map((p, idx) => {
                      const relativePath = p.substring(repoPath.length + 1);
                      return (
                        <div 
                          key={idx} 
                          className="search-result-item"
                          onClick={() => openFile(relativePath)}
                        >
                          📄 {relativePath}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CHAT MESSAGES */}
              <div className="messages-container">
                {messages.length === 0 && !searchResults.length && (
                  <div className="empty-state">
                    <div className="empty-icon">💬</div>
                    <p>Ask questions about the code</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`message message-${msg.role}`}>
                    <div className="message-content">
                      <ReactMarkdown>
                        {typeof msg.content === "string" ? msg.content : msg.content?.answer}
                      </ReactMarkdown>
                      {msg.sources && (
                        <div className="message-sources">
                          <strong>📚 Sources:</strong>
                          <div className="sources-list">
                            {msg.sources.map((s, idx) => (
                              <span key={idx} className="source-badge">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="message message-loading">
                    <div className="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                    <span>AI is thinking...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* CHAT INPUT */}
              <div className="chat-input-area">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question or describe what you want..."
                  className="chat-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      askQuestion();
                    }
                  }}
                />
                <button onClick={askQuestion} className="chat-send-button" disabled={!question || loading}>
                  Send
                </button>
              </div>
            </div>

            {/* RIGHT PANEL - CODE VIEWER */}
            <aside className="code-panel">
              {selectedFile ? (
                <>
                  <div className="code-header">
                    <div className="code-file-name">
                      <span className="file-icon">📄</span>
                      {selectedFile}
                    </div>
                    <button onClick={explainFile} className="explain-button" disabled={isExplaining || !selectedFile}>
                      {isExplaining ? "🔄 Explaining..." : "✨ Explain"}
                    </button>
                  </div>

                  <div className="code-viewer-content">
                    <SyntaxHighlighter language="javascript" style={vscDarkPlus}>
                      {fileContent}
                    </SyntaxHighlighter>
                  </div>

                  <div className="modification-section">
                    <input
                      type="text"
                      value={modRequest}
                      onChange={(e) => setModRequest(e.target.value)}
                      placeholder="Describe changes..."
                      className="mod-input"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") requestCodeModification();
                      }}
                    />
                    <button onClick={requestCodeModification} className="mod-button" disabled={!modRequest || !selectedFile}>
                      Modify
                    </button>
                  </div>

                  {modifiedFile && (
                    <div className="diff-section">
                      <div className="diff-header">🔄 Changes: {modifiedFile}</div>
                      <React.Suspense fallback={<div className="loading-placeholder">Loading diff viewer...</div>}>
                        <DiffViewer
                          oldValue={fileContent}
                          newValue={updatedCode || fileContent}
                          splitView={true}
                        />
                      </React.Suspense>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-code-panel">
                  <div className="empty-icon">📂</div>
                  <p>Select a file to view</p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
