import { useState } from "react";
import axios from "axios";

function App() {

  const [repoUrl, setRepoUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const loadRepo = async () => {
    await axios.post("http://localhost:3000/load-repo", {
      repoUrl: repoUrl
    });

    alert("Repo loaded!");
  };

  const askQuestion = async () => {
    const res = await axios.post("http://localhost:3000/chat", {
      question: question
    });

    setAnswer(res.data.answer);
  };

  return (
    <div style={{ padding: "40px", fontFamily: "Arial" }}>

      <h1>AI Codebase Chat</h1>

      <h3>1. Paste GitHub Repo</h3>

      <input
        type="text"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="https://github.com/user/repo"
        style={{ width: "400px" }}
      />

      <button onClick={loadRepo}>Load Repo</button>

      <hr />

      <h3>2. Ask Question</h3>

      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask about the code"
        style={{ width: "400px" }}
      />

      <button onClick={askQuestion}>Ask</button>

      <h3>Answer:</h3>

      <p>{answer}</p>

    </div>
  );
}

export default App;